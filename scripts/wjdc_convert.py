#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
任务书 #26 WP2：WoWButler 数据导出转换器（wjdc_convert.py）

输入：插件导出的 SavedVariables 文件（WJDCDump = {...}，纯 Lua 表，中文不转义）
输出（只产文件，不落库）：
  1. 核对表.md        —— 团本/大秘境分区 BOSS→装备行，异常行标黄（<mark>），统计行
  2. boss_loot_load.json / dungeon_loot_load.json —— 字段直接对齐表结构（--load-json 产物）
  3. 待匹配清单.md     —— 匹配不到 game_bosses / game_dungeons 的行单列，禁止自动创建字典条目
  4. 对账差异.md       —— 与数据中心现存数据对比：新增/变更/缺失（需 --existing）
  5. character.json    —— /wjdc me 产物，字段对齐用户中心「我的角色」

字典（--dict）与存量（--existing）均为 JSON 导出文件，格式见 scripts/wjdc/README.md。
零第三方依赖，Python 3.8+ 标准库即可运行。
"""
import argparse
import json
import os
import re
import sys

# ============================================================
# 一、迷你 Lua 表解析器（仅支持 SavedVariables 写盘语法子集）
# ============================================================

class LuaParseError(Exception):
    pass

_TOKEN_RE = re.compile(r"""
      (?P<ws>\s+)
    | (?P<comment>--[^\n]*)
    | (?P<string>"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')
    | (?P<number>-?\d+(?:\.\d+)?)
    | (?P<ident>[A-Za-z_][A-Za-z0-9_]*)
    | (?P<sym>[{}\[\]=,])
""", re.VERBOSE)


def _tokenize(text):
    tokens = []
    pos = 0
    while pos < len(text):
        m = _TOKEN_RE.match(text, pos)
        if not m:
            raise LuaParseError("无法识别的字符 @%d: %r" % (pos, text[pos:pos + 20]))
        pos = m.end()
        kind = m.lastgroup
        if kind in ("ws", "comment"):
            continue
        tokens.append((kind, m.group()))
    return tokens


def _unescape(s):
    body = s[1:-1]
    return re.sub(r"\\(.)", lambda m: {"n": "\n", "t": "\t", "r": "\r"}.get(m.group(1), m.group(1)), body)


class _Parser:
    def __init__(self, tokens):
        self.toks = tokens
        self.i = 0

    def peek(self):
        return self.toks[self.i] if self.i < len(self.toks) else (None, None)

    def next(self):
        t = self.peek()
        self.i += 1
        return t

    def expect(self, sym):
        kind, val = self.next()
        if val != sym:
            raise LuaParseError("期望 %r 得到 %r" % (sym, val))

    def parse_value(self):
        kind, val = self.next()
        if kind == "string":
            return _unescape(val)
        if kind == "number":
            return float(val) if "." in val else int(val)
        if kind == "ident":
            if val == "true":
                return True
            if val == "false":
                return False
            if val == "nil":
                return None
            raise LuaParseError("意外的标识符 %r" % val)
        if val == "{":
            return self.parse_table()
        raise LuaParseError("意外的记号 %r" % val)

    def parse_table(self):
        entries = []  # (key, value)；key=None 表示数组项
        while True:
            kind, val = self.peek()
            if val == "}":
                self.next()
                break
            if val == "[":
                self.next()
                kkind, kval = self.next()
                if kkind == "string":
                    key = _unescape(kval)
                elif kkind == "number":
                    key = int(float(kval))
                else:
                    raise LuaParseError("不支持的表键 %r" % kval)
                self.expect("]")
                self.expect("=")
                entries.append((key, self.parse_value()))
            elif kind == "ident" and self.i + 1 < len(self.toks) and self.toks[self.i + 1][1] == "=":
                key = self.next()[1]
                self.expect("=")
                entries.append((key, self.parse_value()))
            else:
                entries.append((None, self.parse_value()))
            kind, val = self.peek()
            if val == ",":
                self.next()
            elif val != "}":
                raise LuaParseError("表项后期望 , 或 } 得到 %r" % val)
        # 全为 1..n 连续整数键 → list，否则 dict
        if entries and all(k is None for k, _ in entries):
            return [v for _, v in entries]
        d = {}
        arr = []
        for k, v in entries:
            if k is None:
                arr.append(v)
            else:
                d[k] = v
        if arr and not d:
            return arr
        if arr:
            for idx, v in enumerate(arr, 1):
                d[idx] = v
        return d


def parse_saved_variables(path):
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    # 兼容极端情况：UTF-8 BOM
    text = text.lstrip("﻿")
    tokens = _tokenize(text)
    p = _Parser(tokens)
    data = {}
    while p.peek()[0] is not None:
        kind, name = p.next()
        if kind != "ident":
            raise LuaParseError("顶层期望变量名，得到 %r" % name)
        p.expect("=")
        data[name] = p.parse_value()
    if "WJDCDump" not in data:
        raise LuaParseError("文件中找不到 WJDCDump 表——请确认传的是 WoWButlerExporter 的 SavedVariables")
    return data["WJDCDump"]


# ============================================================
# 二、数据规整
# ============================================================

def s(v):
    return v if isinstance(v, str) else ("" if v is None else str(v))


def str_list(v):
    if isinstance(v, list):
        return [s(x) for x in v if s(x)]
    if isinstance(v, dict):  # 解析器 dict 形态的数组兜底
        return [s(v[k]) for k in sorted(v.keys(), key=lambda x: (isinstance(x, str), x)) if s(v[k])]
    return []


def norm_items(dump, section):
    """把 raids/dungeons 段拍平成统一行：instance/boss/item 字段"""
    rows = []
    for inst in dump.get(section) or []:
        iname = s(inst.get("instance"))
        for boss in inst.get("bosses") or []:
            bname = s(boss.get("boss"))
            for it in boss.get("loot") or []:
                rows.append({
                    "instance": iname,
                    "boss": bname,
                    "id": it.get("id"),
                    "name": s(it.get("name")),
                    "slot": s(it.get("slot")),
                    "type": s(it.get("type")),
                    "ilvl": it.get("ilvl"),
                    "primary": str_list(it.get("primary")),
                    "secondary": str_list(it.get("secondary")),
                    "effect": s(it.get("effect")),
                })
    return rows


def row_issues(r):
    issues = []
    if not r["slot"]:
        issues.append("缺部位")
    if not r["type"]:
        issues.append("缺类型")
    if not r["effect"]:
        issues.append("特效为空")
    return issues


# ============================================================
# 三、字典匹配（只报告不创建）
# ============================================================

class Dict:
    def __init__(self, dict_path):
        with open(dict_path, "r", encoding="utf-8") as f:
            d = json.load(f)
        self.raids = {s(x.get("name")): x for x in d.get("raids", [])}
        self.dungeons = {s(x.get("name")): x for x in d.get("dungeons", [])}
        self.boss_by_raid = {}     # (raid_name, boss_name) -> boss
        self.boss_by_dungeon = {}  # (dungeon_name, boss_name) -> boss
        for b in d.get("bosses", []):
            if b.get("raid_name"):
                self.boss_by_raid[(s(b["raid_name"]), s(b.get("name")))] = b
            if b.get("dungeon_name"):
                self.boss_by_dungeon[(s(b["dungeon_name"]), s(b.get("name")))] = b

    def match_raid_boss(self, inst, boss):
        if inst not in self.raids:
            return None, "未知团本「%s」" % inst
        b = self.boss_by_raid.get((inst, boss))
        if not b:
            return None, "未知 BOSS「%s」（团本「%s」）" % (boss, inst)
        return b, None

    def match_dungeon_boss(self, inst, boss):
        if inst not in self.dungeons:
            return None, "未知副本「%s」" % inst
        b = self.boss_by_dungeon.get((inst, boss))
        if not b:
            return None, "未知 BOSS「%s」（副本「%s」）" % (boss, inst)
        return b, None


# ============================================================
# 四、产物生成
# ============================================================

def mark(v):
    return "<mark>%s</mark>" % (v or "缺失")


def cell(v, bad):
    return mark(s(v)) if bad else (s(v) or "—")


def write_checklist(path, dump, raid_rows, dungeon_rows):
    L = []
    meta = dump.get("meta") or {}
    L.append("# WJDC 导出核对表")
    L.append("")
    L.append("- 导出时间：%s ｜ 客户端：%s（build %s）｜ 类型：%s" % (
        s(meta.get("time")), s(meta.get("client")), s(meta.get("build")), s(meta.get("type"))))
    L.append("- 异常行以 <mark>黄色高亮</mark> 标出（缺部位 / 缺类型 / 特效为空），多为游戏内物品缓存未就绪，可让运营 /reload 后重跑补齐。")
    L.append("")

    def section(title, rows, inst_label):
        L.append("## %s" % title)
        L.append("")
        insts = []
        for r in rows:
            if r["instance"] not in insts:
                insts.append(r["instance"])
        bosses = {(r["instance"], r["boss"]) for r in rows}
        L.append("**统计：%d %s / %d BOSS / %d 件**" % (len(insts), inst_label, len(bosses), len(rows)))
        L.append("")
        cur = (None, None)
        for r in rows:
            key = (r["instance"], r["boss"])
            if key != cur:
                if cur != (None, None):
                    L.append("")
                cur = key
                L.append("### %s · %s" % (r["instance"], r["boss"]))
                L.append("")
                L.append("| 装备 | 部位 | 类型 | 装等 | 主属性 | 副属性 | 特效 |")
                L.append("|---|---|---|---|---|---|---|")
            iss = row_issues(r)
            L.append("| %s | %s | %s | %s | %s | %s | %s |" % (
                r["name"],
                cell(r["slot"], "缺部位" in iss),
                cell(r["type"], "缺类型" in iss),
                s(r["ilvl"]) or "—",
                "、".join(r["primary"]) or "—",
                "、".join(r["secondary"]) or "—",
                cell(r["effect"], "特效为空" in iss),
            ))
        L.append("")

    section("团本掉落", raid_rows, "团本")
    section("大秘境掉落", dungeon_rows, "副本")

    # 套装段（附审）
    tier = dump.get("tier")
    if tier:
        L.append("## 套装效果")
        L.append("")
        n_failed = 0
        L.append("| 职业 | 专精 | 套装 | 2 件 | 4 件 |")
        L.append("|---|---|---|---|---|")
        for c in tier:
            for sp in c.get("specs") or []:
                if sp.get("status") == "failed":
                    n_failed += 1
                    L.append("| %s | %s | %s | — | — |" % (s(c.get("class")), s(sp.get("spec")), mark("提取失败 failed")))
                else:
                    L.append("| %s | %s | %s | %s | %s |" % (
                        s(c.get("class")), s(sp.get("spec")), s(sp.get("set")) or "—",
                        s(sp.get("bonus2")) or "—", s(sp.get("bonus4")) or "—"))
        L.append("")
        L.append("**套装统计：%d 职业，%d 个专精提取失败（failed）**" % (len(tier), n_failed))
        L.append("")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L))


def build_load_rows(rows, matcher):
    """返回 (matched_rows, unmatched_rows)。matched 带 boss_id / dungeon_id。"""
    matched, unmatched = [], []
    seen = set()
    for r in rows:
        entry, reason = matcher(r["instance"], r["boss"])
        if not entry:
            unmatched.append({**r, "reason": reason})
            continue
        base = {
            "item_name": r["name"],
            "slot": r["slot"] or None,
            "item_type": r["type"] or None,
            "official_item_id": r["id"],
            "note": None,
            "effect": r["effect"] or None,
            "primary_stats": r["primary"] or None,
            "secondary_stats": r["secondary"] or None,
        }
        key = (entry.get("id"), r["name"])
        if key in seen:  # 同 BOSS 同名去重（与 dungeon_loot 唯一约束同口径）
            continue
        seen.add(key)
        matched.append((entry, base, r))
    return matched, unmatched


def write_unmatched(path, unmatched):
    L = ["# 待匹配清单（禁止自动创建字典条目，需人工核对后由超管录入）", ""]
    if not unmatched:
        L.append("无待匹配行——全部命中 game_bosses / game_dungeons。")
    else:
        L.append("| 所属实例 | BOSS | 装备 | 部位 | 类型 | 原因 |")
        L.append("|---|---|---|---|---|---|")
        for r in unmatched:
            L.append("| %s | %s | %s | %s | %s | %s |" % (
                r["instance"], r["boss"], r["name"], r["slot"] or "—", r["type"] or "—", r["reason"]))
    L.append("")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L))


def _cmp_key(r, kind):
    if kind == "boss_loot":
        return (r.get("boss_id"), s(r.get("item_name")))
    return (r.get("dungeon_id"), r.get("boss_id"), s(r.get("item_name")))


_CMP_FIELDS = ["slot", "item_type", "effect", "primary_stats", "secondary_stats", "official_item_id"]


def _norm_field(v):
    if isinstance(v, list):
        return sorted(s(x) for x in v)
    return s(v) if v is not None else None


def write_diff(new_rows, existing_rows, kind, label):
    old_by_key = {_cmp_key(r, kind): r for r in existing_rows}
    new_by_key = {_cmp_key(r, kind): r for r in new_rows}
    added = [new_by_key[k] for k in new_by_key if k not in old_by_key]
    removed = [old_by_key[k] for k in old_by_key if k not in new_by_key]
    changed = []
    for k in new_by_key:
        if k in old_by_key:
            diffs = []
            for f in _CMP_FIELDS:
                if _norm_field(new_by_key[k].get(f)) != _norm_field(old_by_key[k].get(f)):
                    fmt = lambda v: ("（空）" if v is None else ("、" .join(v) if isinstance(v, list) else v))
                    diffs.append("%s: %s → %s" % (f, fmt(_norm_field(old_by_key[k].get(f))), fmt(_norm_field(new_by_key[k].get(f)))))
            if diffs:
                changed.append((new_by_key[k], diffs))
    return {"label": label, "added": added, "changed": changed, "removed": removed}


def write_diff_report(path, reports):
    L = ["# 对账差异报告（导出数据 vs 数据中心现存）", ""]
    for rep in reports:
        L.append("## %s" % rep["label"])
        L.append("")
        L.append("- 新增：%d 条 ｜ 变更：%d 条 ｜ 缺失：%d 条" % (len(rep["added"]), len(rep["changed"]), len(rep["removed"])))
        L.append("")
        if rep["added"]:
            L.append("### 新增（导出里有、库里没有）")
            for r in rep["added"]:
                L.append("- %s（%s / %s）" % (s(r.get("item_name")), s(r.get("slot")) or "无部位", s(r.get("item_type")) or "无类型"))
            L.append("")
        if rep["changed"]:
            L.append("### 变更（同名装备字段不一致）")
            for r, diffs in rep["changed"]:
                L.append("- %s：" % s(r.get("item_name")))
                for d in diffs:
                    L.append("  - %s" % d)
            L.append("")
        if rep["removed"]:
            L.append("### 缺失（库里有、本次导出没有——可能已移出掉落池，需人工确认）")
            for r in rep["removed"]:
                L.append("- %s" % s(r.get("item_name")))
            L.append("")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L))


def write_character(path, me):
    char = {
        "character_name": s(me.get("name")),
        "server_name": s(me.get("realm")),
        "server_region": s(me.get("region")),
        "faction": s(me.get("faction")),
        "race": s(me.get("race")),
        "class": s(me.get("class")),
        "spec": s(me.get("spec")),
        "level": me.get("level") or None,
        "item_level": me.get("ilvl") or None,
        "guild_name": s(me.get("guild")),
        "armory_url": "",
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(char, f, ensure_ascii=False, indent=2)
    return char


# ============================================================
# 五、主流程
# ============================================================

def main():
    ap = argparse.ArgumentParser(description="WJDC 导出转换器（只产文件不落库）")
    ap.add_argument("--input", required=True, help="插件 SavedVariables 文件路径")
    ap.add_argument("--dict", required=True, help="字典导出 JSON（game_raids/game_bosses/game_dungeons）")
    ap.add_argument("--existing", help="数据中心现存 boss_loot/dungeon_loot 导出 JSON（启用对账）")
    ap.add_argument("--outdir", required=True, help="产物输出目录")
    args = ap.parse_args()

    dump = parse_saved_variables(args.input)
    dictionary = Dict(args.dict)
    os.makedirs(args.outdir, exist_ok=True)
    out = lambda name: os.path.join(args.outdir, name)

    raid_rows = norm_items(dump, "raids")
    dungeon_rows = norm_items(dump, "dungeons")

    write_checklist(out("核对表.md"), dump, raid_rows, dungeon_rows)

    boss_matched, boss_unmatched = build_load_rows(raid_rows, dictionary.match_raid_boss)
    dun_matched, dun_unmatched = build_load_rows(dungeon_rows, dictionary.match_dungeon_boss)

    boss_load = [dict(b, boss_id=e.get("id")) for e, b, _ in boss_matched]
    # dungeon_loot：dungeon_id 来自副本字典，boss_id 来自 BOSS 字典；official_item_id 该列为 text
    dun_load = []
    for e, b, r in dun_matched:
        dun = dictionary.dungeons.get(r["instance"])
        dun_load.append(dict(b,
                             dungeon_id=dun.get("id") if dun else None,
                             boss_id=e.get("id"),
                             official_item_id=s(b["official_item_id"]) if b["official_item_id"] is not None else None))

    with open(out("boss_loot_load.json"), "w", encoding="utf-8") as f:
        json.dump(boss_load, f, ensure_ascii=False, indent=2)
    with open(out("dungeon_loot_load.json"), "w", encoding="utf-8") as f:
        json.dump(dun_load, f, ensure_ascii=False, indent=2)

    write_unmatched(out("待匹配清单.md"), boss_unmatched + dun_unmatched)

    me = dump.get("me")
    char_path = None
    if me:
        char_path = out("character.json")
        write_character(char_path, me)

    diff_path = None
    if args.existing:
        with open(args.existing, "r", encoding="utf-8") as f:
            existing = json.load(f)
        reports = [
            write_diff(boss_load, existing.get("boss_loot", []), "boss_loot", "boss_loot（团本掉落池）"),
            write_diff(dun_load, existing.get("dungeon_loot", []), "dungeon_loot", "dungeon_loot（大秘境掉落池）"),
        ]
        diff_path = out("对账差异.md")
        write_diff_report(diff_path, reports)

    print("转换完成，产物目录：%s" % os.path.abspath(args.outdir))
    print("  核对表.md            ：%d 团本行 / %d 大秘境行" % (len(raid_rows), len(dungeon_rows)))
    print("  boss_loot_load.json  ：%d 行" % len(boss_load))
    print("  dungeon_loot_load.json：%d 行" % len(dun_load))
    print("  待匹配清单.md        ：%d 行（只报告不创建）" % (len(boss_unmatched) + len(dun_unmatched)))
    if char_path:
        print("  character.json       ：已生成（/wjdc me 产物）")
    if diff_path:
        print("  对账差异.md          ：已生成")
    anomalies = sum(1 for r in raid_rows + dungeon_rows if row_issues(r))
    if anomalies:
        print("提示：%d 行存在缺字段异常（核对表内已标黄）" % anomalies)


if __name__ == "__main__":
    sys.exit(main())
