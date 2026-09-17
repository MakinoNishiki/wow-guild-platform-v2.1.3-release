#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
parse_source.py — decor_catalog.source_text 来源结构化解析器
（任务书 #50 WP2，REQ-137 一期；配套迁移草案 sql/31_task050_decor_sources.sql）

依赖：零第三方依赖（标准库 re/json/argparse）
用法：
    python scripts/decor/parse_source.py [--input scripts/decor/out/decor_catalog.json]
                                         [--outdir scripts/decor/out]

输入：decor_catalog.json 留档件（任务书 #49 产物，2062 行，含 record_id/entry_type/
      name/source_text 等）。source_text 非空 1987 件、空字符串 75 件。
文法：任务书 #50 WP2 文法规格（顾问全量语料实测归纳 2062/2062，直接采信）——
      条目按 |n|n 分隔（兼容真实 \r\n / \n / |n 混合）；条目 = 色标键值对序列
      |cFFFFD200{键}{可选冒号}|r{值}。本解析器采用「键令牌流」模型：每个类型首键
      开启一个新来源元素，字段键归属当前元素——天然兼容单条目多首键
      （成就+商人同段、事件+宝藏同段）、跨行组合价、真实换行混入等实测形态。

产物（默认写入 scripts/decor/out/，产物目录不入库）：
    decor_sources.json        record_id → sources 结构化结果（复核留档）
    decor_sources.sql         单事务批量 UPDATE（BEGIN + 2062×UPDATE + COMMIT，
                              派生列整体覆盖写，幂等可重跑零漂移）
    parse_source_report.txt   本脚本 stdout 报告的落盘副本（送审附件）

护栏（硬门，任一不满足即退出码 1，SQL 产物照常落盘但报告标红）：
    - 1987 条非空逐条处理，无法归类条目逐条贴出（record_id + 条目原文，不吞并）
    - 类型分布计数与任务书全清单对齐（允许件级多类型）
    - 键集合不得超出任务书清单（新键 = 文法冲突，逐条贴出）
    - 价格解析零残差（金币/货币/物品/裸贴图全部归位，剩余字符即报警）
    - 基准四件全字段断言：28350 商城+世界商人500金 / 27973 双商人双地区20×currency:3363 /
      27043 掉落乌拉特克/烈毒之渊 / 675 组合价「2000 currency:1220 + 1000 金」×2 商人不丢件
    - 空 75 件 sources=[]，entry_type 分布贴出
    - 生成 SQL 自查：UPDATE 语句数=2062、BEGIN/COMMIT 各 1、record_id 覆盖=2062 全唯一

实测偏差处置（2026-09-17 顾问对送审件六类偏差已定夺，按定夺落地）：
    ① 名望： 6 次全部出现在商人出售条目内部（非首键），落 vendor 条目内字段
       reputation（顾问定夺：对齐任务书 schema 示例，勿用 renown）；type 枚举
       renown 保留不动（未实例化）；② 物品价 |Hitem:ID|h（30 件）落
       {"item_id":N,"amount":M}；③ 无超链接裸贴图价（20 件，全为腐化贴图
       amount=100）落 {"texture":贴图文件名主干,"amount":N}——主干 = 去路径、
       去尾部 ":0"、去 .blp 扩展名；④ 金+银合并件（1482「2金50银」）同元素
       双键 {"gold":2,"silver":50} 不折合；⑤ 8176 地区键前置先于任务键，
       归 quest、地区并入 zones；⑥ 25546 佩佩 原文仅两个地区无类型键，
       无法归类在案 sources=[]（运营游戏内核查中），清单逐条贴出不吞并。
"""

import argparse
import io
import json
import re
import sys
from collections import Counter

# ---------------------------------------------------------------- 文法定义

# 类型首键 → (type 枚举, 主值字段名)；商城/节日为无冒号独立 tag（主值取键本身）
TYPE_KEYS = {
    "商人出售": ("vendor", "vendor"),
    "商人": ("vendor", "vendor"),
    "专业技能": ("profession", "profession"),
    "任务": ("quest", "quest"),
    "成就": ("achievement", "achievement"),
    "掉落": ("drop", "drop"),
    "商城": ("shop", "tag"),
    "游戏商城": ("shop", "tag"),
    "宝藏": ("treasure", "treasure"),
    "事件": ("event", "event"),
    "只能在美酒节期间获得": ("festival_note", "note"),
    "可在美酒节开始前购买": ("festival_note", "note"),
}

# 字段键（归属当前元素）；名望实测为条目内字段，定夺①落 reputation（见头注释）
FIELD_KEYS = {"地区", "价格", "阵营", "分类", "名望"}

# 色标键值对令牌：|cFFFFD200{键}{可选冒号}|r{值}（值 = 到下一键或文本结尾）
TOKEN_RE = re.compile(r"\|cFFFFD200([^|]*)\|r")

# 价格令牌（按出现顺序扫描）：
#   货币 100|Hcurrency:2003|h|<贴图>|t|h
#   物品 100|Hitem:37829|h|<贴图>|t|h          （清单外实测形态，偏差②）
#   贴图 100|TINTERFACE\MONEYFRAME\UI-GOLDICON.BLP:0|t（金币/银币/无超链接裸贴图）
PRICE_TOKEN_RE = re.compile(
    r"(\d+)\|Hcurrency:(\d+)\|h\|[^|]*\|t\|h"   # 1=amount 2=currency_id
    r"|(\d+)\|Hitem:(\d+)\|h\|[^|]*\|t\|h"      # 3=amount 4=item_id
    r"|(\d+)\|T([^|]*)\|t"                       # 5=amount 6=texture 路径
)

# 任务书全清单计数（覆盖率对齐基准；名望 6 按定夺①落 reputation 字段）
SPEC_TYPE_COUNTS = {
    "vendor": 2015 + 30,
    "profession": 330,
    "quest": 326,
    "achievement": 184,
    "drop": 79,
    "shop": 65 + 2,
    "treasure": 14,
    "event": 1,
    "festival_note": 4 + 2,
    "renown": 0,  # type 枚举保留（定夺①）；名望 6 次均落 reputation 字段 → 元素计数 0
}
SPEC_KEY_COUNTS = {
    "地区": 2693, "商人出售": 2015, "价格": 2003, "专业技能": 330, "任务": 326,
    "成就": 184, "分类": 184, "阵营": 153,  # 152 带冒号 + 1 无冒号（record 8192）
    "掉落": 79, "商城": 65, "商人": 30, "宝藏": 14, "名望": 6,
    "只能在美酒节期间获得": 4, "可在美酒节开始前购买": 2, "游戏商城": 2, "事件": 1,
}

BASELINE_IDS = (28350, 27973, 27043, 675)


# ---------------------------------------------------------------- 解析

def tokenize(source_text):
    """切色标键值对令牌流：[(键(去冒号), 原值)]，值 = 到下一键或文本结尾。"""
    ms = list(TOKEN_RE.finditer(source_text))
    return [
        (m.group(1).rstrip("："),
         source_text[m.end():(ms[i + 1].start() if i + 1 < len(ms) else len(source_text))])
        for i, m in enumerate(ms)
    ]


def clean_value(v):
    """去首尾条目分隔符与空白（|n、\r\n、\n、空格）；值内部形态保留。"""
    return re.sub(r"(?:\|n|[\s\r\n])+$", "", re.sub(r"^(?:\|n|[\s\r\n])+", "", v))


def parse_price(raw):
    """价格值 → 价格元素数组（组合价=多元素，顺序保持原文）。

    返回 (price_list, residual)：residual 非空 = 存在未识别残差（护栏报警）。
    金币 {"gold":N}；货币 {"currency_id":N,"amount":M}；物品 {"item_id":N,"amount":M}；
    银币与金币相邻时合并 {"gold":G,"silver":S}（定夺④：同元素双键不折合，实测仅
    record 1482「2金50银」）；无超链接裸贴图 {"texture":文件名主干,"amount":N}
    （定夺③：主干 = 去路径、去尾部 ":0"、去 .blp 扩展名；实测仅腐化贴图）。
    """
    parts = []
    for m in PRICE_TOKEN_RE.finditer(raw):
        if m.group(2) is not None:
            parts.append({"currency_id": int(m.group(2)), "amount": int(m.group(1))})
        elif m.group(4) is not None:
            parts.append({"item_id": int(m.group(4)), "amount": int(m.group(3))})
        else:
            amount, tex = int(m.group(5)), m.group(6)
            name = tex.replace("\\", "/").split("/")[-1].rsplit(":", 1)[0]
            stem = re.sub(r"\.blp$", "", name, flags=re.I)
            if "GOLDICON" in stem.upper():
                parts.append({"gold": amount})
            elif "SILVERICON" in stem.upper():
                parts.append({"silver": amount})
            else:
                parts.append({"texture": stem, "amount": amount})
    # 金+银相邻合并为一个金钱元素（顺序位置以金币为准）
    merged = []
    for p in parts:
        if "silver" in p and merged and set(merged[-1]) == {"gold"}:
            merged[-1] = {"gold": merged[-1]["gold"], "silver": p["silver"]}
        else:
            merged.append(p)
    residual = PRICE_TOKEN_RE.sub("", raw)
    residual = residual.replace("|n", "").replace("\r", "").replace("\n", "").strip()
    return merged, residual


def new_element(type_key, value):
    typ, field = TYPE_KEYS[type_key]
    el = {"type": typ}
    if typ == "shop":
        el["tag"] = type_key  # 无冒号独立 tag，主值 = 键本身（值恒为空）
    elif typ == "festival_note":
        el["note"] = type_key
    else:
        el[field] = clean_value(value)
    return el


def parse_source_text(source_text):
    """单条 source_text → (elements, anomalies)。

    键令牌流模型：类型首键开启新元素；字段键归属当前元素；
    地区键前置（无当前元素）时缓冲，挂入随后第一个元素（实测仅 record 8176）。
    """
    elements = []
    anomalies = []
    pending_zones = []
    cur = None
    for key, raw_val in tokenize(source_text):
        if key in TYPE_KEYS:
            cur = new_element(key, raw_val)
            if pending_zones:
                cur["zones"] = pending_zones
                pending_zones = []
                anomalies.append("地区键前置挂入随后元素")
            elements.append(cur)
        elif key in FIELD_KEYS:
            val = clean_value(raw_val)
            if key == "地区":
                if cur is None:
                    pending_zones.append(val)
                else:
                    cur.setdefault("zones", []).append(val)
            elif key == "价格":
                if cur is None:
                    anomalies.append("价格键无归属元素")
                    continue
                price, residual = parse_price(raw_val)
                cur["price"] = price
                if residual:
                    anomalies.append("价格残差: " + residual)
            elif key == "阵营":
                if cur is None:
                    anomalies.append("阵营键无归属元素")
                else:
                    cur["reputation"] = val
            elif key == "分类":
                if cur is None:
                    anomalies.append("分类键无归属元素")
                else:
                    cur["category"] = val
            elif key == "名望":
                if cur is None:
                    anomalies.append("名望键无归属元素")
                else:
                    cur["reputation"] = val  # 定夺①：名望落条目内 reputation 字段
        else:
            anomalies.append("清单外新键: " + key)
    if pending_zones:
        anomalies.append("悬空地区键: " + "/".join(pending_zones))
    return elements, anomalies


# ---------------------------------------------------------------- 主流程

def main():
    ap = argparse.ArgumentParser(description="decor_catalog source_text 来源结构化（任务书 #50 WP2）")
    ap.add_argument("--input", default="scripts/decor/out/decor_catalog.json")
    ap.add_argument("--outdir", default="scripts/decor/out")
    args = ap.parse_args()

    with open(args.input, encoding="utf-8") as f:
        data = json.load(f)

    report = io.StringIO()

    def out(line=""):
        print(line)
        report.write(line + "\n")

    # 规范化字段（vendor 元素键序对齐任务书 schema 示例）
    def normalize(el):
        if el["type"] == "vendor":
            return {
                "type": "vendor",
                "vendor": el["vendor"],
                "zones": el.get("zones", []),
                "price": el.get("price"),
                "reputation": el.get("reputation"),
            }
        if el["type"] in ("quest", "drop", "treasure"):
            field = {"quest": "quest", "drop": "drop", "treasure": "treasure"}[el["type"]]
            return {"type": el["type"], field: el[field], "zones": el.get("zones", [])}
        return el

    sources_by_id = {}
    unclassified = []       # 无法归类条目（record_id + 原文，逐条贴出不吞并）
    anomalies_all = []      # (record_id, anomaly)
    unknown_keys = []
    key_counts = Counter()
    type_counts = Counter()
    empty_records = []

    for d in data:
        rid, st = d["record_id"], d["source_text"]
        if st == "":
            sources_by_id[rid] = []
            empty_records.append(d)
            continue
        for k, _ in tokenize(st):
            key_counts[k] += 1
        elements, anomalies = parse_source_text(st)
        for a in anomalies:
            anomalies_all.append((rid, a))
            if a.startswith("清单外新键"):
                unknown_keys.append((rid, a))
        elements = [normalize(e) for e in elements]
        for e in elements:
            type_counts[e["type"]] += 1
        if not elements:
            unclassified.append((rid, st))
        sources_by_id[rid] = elements

    hard_fail = False

    out("=" * 70)
    out("任务书 #50 WP2 sourceText 结构化解析报告（parse_source.py 干跑）")
    out("=" * 70)
    out(f"输入：{args.input}  总件数={len(data)}（应 2062）"
        f"  source_text 非空={len(data) - len(empty_records)}（应 1987）"
        f"  空={len(empty_records)}（应 75）")
    if len(data) != 2062 or len(empty_records) != 75:
        hard_fail = True
        out("!! 件数口径不符")

    out("\n--- 覆盖率 ---")
    out(f"非空逐条处理：{len(data) - len(empty_records)}/1987；"
        f"归类={len(data) - len(empty_records) - len(unclassified)}，"
        f"无法归类={len(unclassified)}")
    for rid, st in unclassified:
        out(f"  [无法归类] record_id={rid} 原文={st!r}")

    out("\n--- 键计数 vs 任务书全清单 ---")
    for k, spec_n in SPEC_KEY_COUNTS.items():
        got = key_counts.get(k, 0)
        mark = "OK" if got == spec_n else "!!"
        if got != spec_n:
            hard_fail = True
        out(f"  {mark} {k}: 实测 {got} / 清单 {spec_n}")
    extra = [k for k in key_counts if k not in SPEC_KEY_COUNTS]
    out(f"  清单外新键：{len(extra)}" + ("" if not extra else " " + repr(extra)))
    if extra:
        hard_fail = True

    out("\n--- 类型分布（元素级，允许件级多类型） ---")
    out(f"  {'type':<14}{'实测':>6}{'清单':>6}  备注")
    for typ, spec_n in SPEC_TYPE_COUNTS.items():
        got = type_counts.get(typ, 0)
        mark = "OK" if got == spec_n else "!!"
        note = "名望 6 次按定夺①落 reputation 字段（逐条在下）" if typ == "renown" else ""
        if got != spec_n:
            hard_fail = True
        out(f"  {mark} {typ:<13}{got:>6}{spec_n:>6}  {note}")
    out(f"  元素总数={sum(type_counts.values())}")

    out("\n--- 解析异常（价格残差/键无归属/清单外新键等） ---")
    if not anomalies_all:
        out("  无")
    for rid, a in anomalies_all:
        out(f"  record_id={rid}: {a}")
    if unknown_keys or any("残差" in a or "无归属" in a for _, a in anomalies_all):
        hard_fail = True

    out("\n--- 空 source_text 75 件 entry_type 分布 ---")
    et = Counter(d["entry_type"] for d in empty_records)
    for k, v in sorted(et.items()):
        out(f"  entry_type={k}: {v} 件")
    out("  （预期大头 39 件房间/户型 entry_type=2，另 36 件 entry_type=1 无来源装饰）")

    out("\n--- 基准四件全字段解析结果 ---")
    byid = {d["record_id"]: d for d in data}
    for rid in BASELINE_IDS:
        out(f"  record_id={rid}（{byid[rid]['name']}）")
        out("    原文: " + repr(byid[rid]["source_text"]))
        out("    解析: " + json.dumps(sources_by_id[rid], ensure_ascii=False))

    # 基准断言（硬门）
    b = sources_by_id
    checks = [
        ("28350 商城+世界商人500金",
         b[28350] == [
             {"type": "shop", "tag": "商城"},
             {"type": "vendor", "vendor": "世界商人", "zones": [],
              "price": [{"gold": 500}], "reputation": None}]),
        ("27973 双商人双地区 20×currency:3363",
         b[27973] == [
             {"type": "vendor", "vendor": "“丹恩”夜影", "zones": ["烈风海岸"],
              "price": [{"currency_id": 3363, "amount": 20}], "reputation": None},
             {"type": "vendor", "vendor": "费奥蕊·月行者", "zones": ["创始者之角"],
              "price": [{"currency_id": 3363, "amount": 20}], "reputation": None}]),
        ("27043 掉落 乌拉特克/烈毒之渊",
         b[27043] == [{"type": "drop", "drop": "乌拉特克", "zones": ["烈毒之渊"]}]),
        ("675 组合价 2000 currency:1220 + 1000 金 ×2 商人",
         b[675] == [
             {"type": "vendor", "vendor": "赛尔弗丽雅·珀林", "zones": ["瓦尔莎拉"],
              "price": [{"currency_id": 1220, "amount": 2000}, {"gold": 1000}],
              "reputation": "织梦者 - 崇拜"},
             {"type": "vendor", "vendor": "西尔维娅·鹿角", "zones": ["瓦尔莎拉"],
              "price": [{"currency_id": 1220, "amount": 2000}, {"gold": 1000}],
              "reputation": "织梦者 - 崇拜"}]),
    ]
    out("\n--- 基准断言 ---")
    for name, ok in checks:
        out(f"  {'OK' if ok else '!! FAIL'} {name}")
        if not ok:
            hard_fail = True

    # 实测偏差处置清单（六类偏差顾问已定夺 2026-09-17，按定夺落地；仍逐条在案）
    def records_with(pred):
        return sorted(rid for rid, els in sources_by_id.items()
                      if any(pred(p) for e in els for p in e.get("price") or []))

    renown_records = sorted(d["record_id"] for d in data if "名望：" in d["source_text"])
    out("\n--- 实测偏差处置清单（六类顾问定夺已落地，逐条在案） ---")
    out(f"  ① 名望落 vendor 条目内 reputation 字段（type 枚举 renown 保留未实例化），"
        f"{len(renown_records)} 件：{renown_records}")
    out(f"  ② |Hitem:ID|h 物品价（{{\"item_id\":N,\"amount\":M}}），"
        f"{len(records_with(lambda p: 'item_id' in p))} 件：{records_with(lambda p: 'item_id' in p)}")
    out(f"  ③ 无超链接裸贴图价（{{\"texture\":文件名主干,\"amount\":N}}，实测全为腐化贴图 amount=100），"
        f"{len(records_with(lambda p: 'texture' in p))} 件：{records_with(lambda p: 'texture' in p)}")
    out(f"  ④ 金+银合并价同元素双键（{{\"gold\":G,\"silver\":S}} 不折合），"
        f"{len(records_with(lambda p: 'silver' in p))} 件：{records_with(lambda p: 'silver' in p)}")
    out(f"  ⑤ 地区键前置归随后 quest 元素、地区并入 zones：{[rid for rid, a in anomalies_all if '前置' in a]}")
    out(f"  ⑥ 无法归类（原文无类型首键，sources=[] 在案不吞并，运营游戏内核查中）："
        f"{[rid for rid, _ in unclassified]}")

    # 价格形态普查
    out("\n--- 价格形态普查（2003 个价格值） ---")
    shape = Counter()
    for d in data:
        if d["source_text"] == "":
            continue
        for el in sources_by_id[d["record_id"]]:
            if "price" in el and el["price"] is not None:
                sig = tuple(tuple(sorted(p)) for p in el["price"])
                shape[sig] += 1
    for sig, n in shape.most_common():
        out(f"  {n:>5} × {sig}")

    # 生成产物
    src_json = [{"record_id": rid, "sources": sources_by_id[rid]}
                for rid in sorted(sources_by_id)]
    json_path = f"{args.outdir}/decor_sources.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(src_json, f, ensure_ascii=False, indent=1)

    def sql_lit(v):
        return "'" + v.replace("'", "''") + "'"

    lines = ["BEGIN;"]
    for row in src_json:
        payload = json.dumps(row["sources"], ensure_ascii=False, separators=(",", ":"))
        lines.append(f"UPDATE decor_catalog SET sources = {sql_lit(payload)}::jsonb"
                     f" WHERE record_id = {row['record_id']};")
    lines.append("COMMIT;")
    sql_path = f"{args.outdir}/decor_sources.sql"
    with open(sql_path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")

    # 生成 SQL 自查
    with open(sql_path, encoding="utf-8") as f:
        sql_text = f.read()
    n_update = sql_text.count("UPDATE decor_catalog SET sources =")
    ids_in_sql = re.findall(r"WHERE record_id = (\d+);", sql_text)
    out("\n--- 生成 SQL 自查 ---")
    out(f"  UPDATE 语句数={n_update}（应 2062）  BEGIN={sql_text.count('BEGIN;')}"
        f"  COMMIT={sql_text.count('COMMIT;')}")
    out(f"  record_id 覆盖={len(ids_in_sql)} 唯一={len(set(ids_in_sql))}"
        f"  与输入全集一致={ {int(i) for i in ids_in_sql} == set(sources_by_id) }")
    if not (n_update == 2062 and sql_text.count("BEGIN;") == 1
            and sql_text.count("COMMIT;") == 1 and len(set(ids_in_sql)) == 2062):
        hard_fail = True
    nonempty_sources = sum(1 for v in sources_by_id.values() if v)
    out(f"  sources 非空={nonempty_sources}（应 1987 − 无法归类 {len(unclassified)}"
        f" = {1987 - len(unclassified)}）  空={2062 - nonempty_sources}（应 75+无法归类）")
    if nonempty_sources != 1987 - len(unclassified):
        hard_fail = True

    out(f"\n产物：{json_path} / {sql_path} / {args.outdir}/parse_source_report.txt")
    out(f"\n硬门总判：{'全部通过' if not hard_fail else '存在未过项（见 !! 行）'}"
        f"（实测偏差 6 类顾问定夺已落地，逐条在案见上节）")
    with open(f"{args.outdir}/parse_source_report.txt", "w", encoding="utf-8", newline="\n") as f:
        f.write(report.getvalue())
    sys.exit(1 if hard_fail else 0)


if __name__ == "__main__":
    main()
