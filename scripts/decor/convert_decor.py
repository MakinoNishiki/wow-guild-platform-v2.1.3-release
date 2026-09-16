#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
convert_decor.py — WoWButlerDecor SavedVariables → decor_catalog.json + decor_seed.sql
（任务书 #49 WP2，REQ-137；配套迁移 sql/30_task049_decor_catalog.sql）

依赖：pip install lupa
用法：
    python scripts/decor/convert_decor.py --input <WoWButlerDecor.lua> [--outdir scripts/decor/out]

输入：插件 v0.2 游戏内 `/wbd scan` 后 /reload 落盘的 SavedVariables（WoWButlerDecorDB 全局表）。
解析：lupa LuaRuntime 全真解析（禁止正则/文本猜测）。

产物（默认写入 scripts/decor/out/，产物目录不入库）：
    decor_catalog.json  全量字典数组（调试/留档，键名 = 表列 snake_case）
    decor_seed.sql      单事务种子：INSERT ... ON CONFLICT (record_id) DO UPDATE，
                        匹配键 = record_id 主键，天然幂等，重跑不插重；
                        collected_at 不在 UPDATE 列表（保留首次入库时间）

字段映射（Lua 字段 → snake_case 列）：
    recordID→record_id / entryType→entry_type / itemID→item_id / name→name /
    iconTexture→icon_file_id / asset→asset_id / uiModelSceneID→model_scene_id /
    quality→quality / size→size / placementCost→placement_cost /
    categoryIDs→category_ids(jsonb 数组) / subcategoryIDs→subcategory_ids(jsonb 数组) /
    sourceText→source_text（原样 raw，本批不做结构化解析，图鉴页设计时再定规则，免重采） /
    dataTagsByID→tags(jsonb 对象，键=tagID 字符串，值=中文标签) /
    isAllowedIndoors→indoors / isAllowedOutdoors→outdoors / canCustomize→can_customize /
    firstAcquisitionBonus→first_acquisition_bonus /
    runMeta.client→client_version、runMeta.run_id→run_id（每行随行落）
"""

import argparse
import json
import os
import sys

from lupa import LuaRuntime, lua_type

# 表列顺序（record_id 主键在首；collected_at 走 DEFAULT now()，不出现在 INSERT 中）
COLUMNS = [
    "record_id", "entry_type", "item_id", "name", "icon_file_id", "asset_id",
    "model_scene_id", "quality", "size", "placement_cost",
    "category_ids", "subcategory_ids", "source_text", "tags",
    "indoors", "outdoors", "can_customize", "first_acquisition_bonus",
    "client_version", "run_id",
]
INT_COLS = {
    "record_id", "entry_type", "item_id", "icon_file_id", "asset_id",
    "model_scene_id", "quality", "size", "placement_cost", "first_acquisition_bonus",
}
JSON_COLS = {"category_ids", "subcategory_ids", "tags"}

FIELD_MAP = {
    "record_id": "recordID",
    "entry_type": "entryType",
    "item_id": "itemID",
    "name": "name",
    "icon_file_id": "iconTexture",
    "asset_id": "asset",
    "model_scene_id": "uiModelSceneID",
    "quality": "quality",
    "size": "size",
    "placement_cost": "placementCost",
    "category_ids": "categoryIDs",
    "subcategory_ids": "subcategoryIDs",
    "source_text": "sourceText",
    "tags": "dataTagsByID",
    "indoors": "isAllowedIndoors",
    "outdoors": "isAllowedOutdoors",
    "can_customize": "canCustomize",
    "first_acquisition_bonus": "firstAcquisitionBonus",
}

BATCH = 500  # 单条 INSERT 的行数上限（PG 参数上限 65535，500×20 列远低于此）


def norm_num(v):
    """Lua 数字全是双精度浮点：整数值归一为 int（8198895.0 → 8198895）。"""
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def lua_to_py(v):
    """lupa 表递归转 Python 原生结构；1..n 连续整数键 → list，其余 → dict（键转字符串）。"""
    if lua_type(v) != "table":
        return norm_num(v)
    keys = list(v.keys())
    if not keys:
        return []
    int_keys = [k for k in keys if isinstance(k, (int, float)) and float(k).is_integer()]
    if len(int_keys) == len(keys):
        nums = sorted(int(k) for k in int_keys)
        if nums == list(range(1, len(nums) + 1)):
            return [lua_to_py(v[k]) for k in nums]
    return {str(norm_num(k)): lua_to_py(v[k]) for k in keys}


def sql_literal(col, v):
    if v is None:
        return "NULL"
    if col in JSON_COLS:
        s = json.dumps(v, ensure_ascii=False, separators=(",", ":"))
        return "'" + s.replace("'", "''") + "'::jsonb"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(norm_num(v))
    return "'" + str(v).replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser(description="WoWButlerDecor SavedVariables → decor_catalog 种子")
    ap.add_argument("--input", required=True, help="WoWButlerDecor SavedVariables 文件路径")
    ap.add_argument("--outdir", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"),
                    help="产物目录（默认 scripts/decor/out）")
    args = ap.parse_args()

    lua = LuaRuntime(unpack_returned_tuples=True)
    with open(args.input, encoding="utf-8") as f:
        src = f.read()
    lua.execute(src)  # SavedVariables 本身即合法 Lua chunk（WoWButlerDecorDB = {...}）
    db = lua.globals().WoWButlerDecorDB
    if lua_type(db) != "table":
        print("ERROR: 文件中未找到 WoWButlerDecorDB 全局表", file=sys.stderr)
        sys.exit(1)

    meta = db["runMeta"]
    client_version = str(meta["client"]) if meta["client"] is not None else None
    run_id = str(meta["run_id"]) if meta["run_id"] is not None else None
    dataset = str(meta["dataset"]) if meta["dataset"] is not None else None
    addon_ver = str(meta["addon"]) if meta["addon"] is not None else None
    total_count = int(db["totalCount"]) if db["totalCount"] is not None else None
    fail_count = int(db["failCount"]) if db["failCount"] is not None else None

    # 注意：必须用 [] 索引——lupa 表自带 dict 风格 items() 方法，db.items 属性访问会撞名
    items_lua = db["items"]
    n_items = items_lua is not None and lua_type(items_lua) == "table" and len(items_lua) or 0
    if not n_items:
        print("ERROR: WoWButlerDecorDB.items 为空或非表（需 v0.2 全量采集件）", file=sys.stderr)
        sys.exit(1)

    rows, seen, missing_name = [], set(), []
    field_nonempty = {c: 0 for c in COLUMNS}
    entry_type_dist = {}
    for i in range(1, len(items_lua) + 1):
        it = items_lua[i]
        row = {}
        for col, lua_key in FIELD_MAP.items():
            v = lua_to_py(it[lua_key]) if it[lua_key] is not None else None
            if col == "tags" and v == []:
                v = {}  # 空 dataTagsByID → jsonb 对象而非数组
            if col in INT_COLS and v is not None:
                v = int(v)
            row[col] = v
            if v is not None and v != [] and v != {} and v != "":
                field_nonempty[col] += 1
        row["client_version"] = client_version
        row["run_id"] = run_id
        rid = row["record_id"]
        if rid in seen:
            print(f"ERROR: recordID 重复：{rid}", file=sys.stderr)
            sys.exit(1)
        seen.add(rid)
        if not row["name"]:
            missing_name.append(rid)
        et = row["entry_type"]
        entry_type_dist[et] = entry_type_dist.get(et, 0) + 1
        rows.append(row)

    if missing_name:
        print(f"ERROR: {len(missing_name)} 件缺 name（name 列 NOT NULL）：{missing_name[:10]}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(args.outdir, exist_ok=True)

    # ---- decor_catalog.json（调试/留档）----
    json_path = os.path.join(args.outdir, "decor_catalog.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
        f.write("\n")

    # ---- decor_seed.sql（单事务，幂等）----
    update_cols = [c for c in COLUMNS if c != "record_id"]  # collected_at 不在列：保留首次入库时间
    set_clause = ",\n  ".join(f"{c} = EXCLUDED.{c}" for c in update_cols)
    sql_path = os.path.join(args.outdir, "decor_seed.sql")
    with open(sql_path, "w", encoding="utf-8", newline="\n") as f:
        f.write("-- ============================================================\n")
        f.write("-- decor_seed.sql — decor_catalog 种子（任务书 #49 WP2，REQ-137）\n")
        f.write(f"-- 生成：scripts/decor/convert_decor.py ← {os.path.basename(args.input)}"
                f"（插件 v{addon_ver}，client={client_version}，run_id={run_id}）\n")
        f.write(f"-- 行数：{len(rows)}；单事务；INSERT ... ON CONFLICT (record_id) DO UPDATE\n")
        f.write("-- 匹配键 = record_id 主键，天然幂等，重跑不插重；collected_at 保留首次入库时间\n")
        f.write("-- 前置：先执行 sql/30_task049_decor_catalog.sql\n")
        f.write("-- 执行：SSH + docker exec psql（supabase_admin 角色）\n")
        f.write("-- ============================================================\n")
        f.write("BEGIN;\n\n")
        cols_sql = ", ".join(COLUMNS)
        for s in range(0, len(rows), BATCH):
            chunk = rows[s:s + BATCH]
            f.write(f"INSERT INTO decor_catalog ({cols_sql}) VALUES\n")
            vals = ",\n".join(
                "  (" + ", ".join(sql_literal(c, r[c]) for c in COLUMNS) + ")" for r in chunk
            )
            f.write(vals + "\n")
            f.write(f"ON CONFLICT (record_id) DO UPDATE SET\n  {set_clause};\n\n")
        f.write("COMMIT;\n")

    # ---- 摘要与抽查（送审/验收对数用）----
    print(f"输入：{args.input}")
    print(f"runMeta：addon={addon_ver} client={client_version} run_id={run_id} dataset={dataset}")
    print(f"items={len(rows)} totalCount={total_count} failCount={fail_count}"
          f" {'（吻合）' if len(rows) == total_count else '（!!件数不符）'}")
    print(f"entryType 分布：{entry_type_dist}")
    print("字段非空率：" + "；".join(
        f"{c}={field_nonempty[c]}/{len(rows)}" for c in [
            "item_id", "icon_file_id", "source_text", "tags", "category_ids",
            "subcategory_ids", "quality", "size", "placement_cost",
        ]))
    for rid in (28350, 27973, 27043):
        r = next((x for x in rows if x["record_id"] == rid), None)
        if not r:
            print(f"抽查 recordID={rid}：!!未找到")
            continue
        st = (r["source_text"] or "").replace("\n", "\\n")
        print(f"抽查 recordID={rid}：{r['name']}（entryType={r['entry_type']} itemID={r['item_id']}）")
        print(f"  tags={json.dumps(r['tags'], ensure_ascii=False)}")
        print(f"  source_text={st[:150]}")
    print(f"产物：{json_path}")
    print(f"产物：{sql_path}（{os.path.getsize(sql_path)} 字节）")


if __name__ == "__main__":
    main()
