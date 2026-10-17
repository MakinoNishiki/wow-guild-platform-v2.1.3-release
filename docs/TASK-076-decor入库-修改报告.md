# 任务书 #76 修改报告：decor_catalog 12.1.5 新增家具入库

> 日期：2026-10-17 ｜ 执行：Kimi Code ｜ 类型：纯数据入库（零代码变更，不 bump 版本串）
> 结果：**251 条新增已入库并复核全绿**（基线/增长/run_id/抽查/幂等 5 项全过）

## 一、执行链路（先查证再执行）

1. **新扫描输入**：游戏目录 `WTF/Account/208457004#1/SavedVariables/WoWButlerDecor.lua`（2026-10-17 14:13 落盘，runMeta：addon=0.2.0 / client=12.1.5 / run_id=**20261017-141224** / dataset=full）。
2. **转换**：`python scripts/decor/convert_decor.py --input <上述文件> --outdir backup/_pytmp/decor1215` → items=**2313**、totalCount=2313、**failCount=0**、entryType 1=2274 / 2=39。
3. **差集**：转换全量 2313 vs 库内 record_id 2062 → 新增 **251**（不是 252，见下）；写 `data/decor-catalog-12.1.5-new-items.json`。
4. **入库**：`node scripts/import-decor-batch.js`（PostgREST `POST /rest/v1/decor_catalog?on_conflict=record_id`，`resolution=merge-duplicates,return=representation`，service_role 仅从 .env 读）。
5. **复核**：总数/run_id 计数/3 条抽查/同文件幂等重跑。

## 二、验证清单逐项

| # | 检查项 | 任务书预期 | 实测结果 |
|---|---|---|---|
| 1 | 基线 | 2062 | ✅ 2062（content-range 计数） |
| 2 | 入库 | POST 成功返回 252 | ✅ POST 成功，返回 **251**（差集实测量，非预期 252） |
| 3 | 增长 | 2314 | ✅ **2313**（= 扫描全量 2313；任务书 2314 系 252 算术连带误差） |
| 4 | 幂等 | 重复执行不翻倍 | ✅ 同文件重跑返回 251（merge-update），总数 2313→2313 不变 |
| 5 | 抽查 | 3 条字段完整 | ✅ 28694 高大的猩红橡树 / 29117 阿曼尼明火烤架 / 30255 仪式安波里拱门：必备字段+tags+category_ids 完整，run_id=20261017-141224，client_version=12.1.5，collected_at 落库正常 |
| 附 | run_id 计数 | 252 | ✅ run_id=20261017-141224 行数 = **251**（与新增数一致） |

**算术勘误**：2313 − 2062 = **251**（任务书写 252），故终值 = 2313（非 2314）。所有其他预期值（基线/幂等/抽查）与实测一致。

## 三、产物与留档

- `data/decor-catalog-12.1.5-new-items.json`（251 条，可重复执行）
- `scripts/import-decor-batch.js`（基线→upsert→复核→幂等一体化，零依赖，密钥仅从 .env 读）
- 转换留档：`backup/_pytmp/decor1215/decor_catalog.json`（全量 2313）+ `decor_seed.sql`
- 差集脚本：`backup/_pytmp/diff-decor-new.js`
- 台账：REQ-165 登记

## 四、申报

- 本次仅插入差集 251 条新 record_id，未触碰既有 2062 行（merge 仅作用于同文件内行）。
- 图鉴前端免登录/登录双壳直读 decor_catalog，新增条目随下次数据拉取自然可见，无代码变更、不 bump 版本串。
- #77（Exporter 1.0.27 在 12.1.5 装备 nil / 基希克斯破封扫不到）按通知另出任务书，本批未触碰。
