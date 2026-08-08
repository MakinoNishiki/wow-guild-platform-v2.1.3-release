# 任务书 #29-WP1 sql/20 迁移执行报告（生产自托管 Supabase）

> 日期：2026-08-08 ｜ 执行：Kimi Code（SSH 命令行通道，未使用网页 Studio）
> 目标库：101.35.124.22 自托管 Supabase（supabase-db 容器，supabase/postgres:17.6.1.136）
> 凭据纪律：SSH 凭据当次使用（环境变量传入），未落地任何文件/截图/报告；执行器脚本 `backup/_sshtmp/run-sql20.js`（gitignored）不含密钥。

## 【改了什么】

生产库执行 `sql/20_task029_difficulty_tiers.sql` 全文：`boss_loot` / `dungeon_loot` 各加 `primary_tiers jsonb`、`secondary_tiers jsonb` 两列（只加列不改列），末尾 `NOTIFY pgrst` 重载 PostgREST schema 缓存。执行前已备份两表 JSON 至服务器 /tmp。执行通道与 sql/19 完全相同（sftp 上传 SQL → docker cp 入容器 → psql -f）。

## 【范围】

- 生产库结构：两表共 4 列新增，幂等（IF NOT EXISTS），可回滚（回滚语句就绪于 sql/20 文首注释，本次未执行）；
- 数据：零写入零变更，两表行数迁移前后一致（190 / 221）；
- 服务器文件：`/tmp/boss_loot_20260808.json`、`/tmp/dungeon_loot_20260808.json`（备份）、`/tmp/sql20_20260808.sql`（执行件留存备查）。

## 【验证】（执行输出全附）

### 1. 备份（执行前）

```
===== 备份前行数 (exit=0) =====
boss_loot|190
dungeon_loot|221
===== COPY boss_loot → 容器 /tmp (exit=0) =====
COPY 190
===== 宿主机备份行数 boss_loot (exit=0) =====
190 /tmp/boss_loot_20260808.json
===== COPY dungeon_loot → 容器 /tmp (exit=0) =====
COPY 221
===== 宿主机备份行数 dungeon_loot (exit=0) =====
221 /tmp/dungeon_loot_20260808.json
```

### 2. 迁移执行

```
===== 执行 sql/20 (exit=0) =====
ALTER TABLE
ALTER TABLE
ALTER TABLE
ALTER TABLE
NOTIFY
```

四条 ADD COLUMN 全部成功，末尾 NOTIFY pgrst 已发出。

### 3. 列复核（\d 输出摘关键行）

```
===== \d boss_loot =====
 primary_values   | jsonb   |
 secondary_values | jsonb   |
 primary_tiers    | jsonb   |          ← 新增
 secondary_tiers  | jsonb   |          ← 新增
===== \d dungeon_loot =====
 primary_values   | jsonb   |
 secondary_values | jsonb   |
 primary_tiers    | jsonb   |          ← 新增
 secondary_tiers  | jsonb   |          ← 新增
```

（完整 \d 输出含索引/外键/RLS 策略，与迁移前一致未受影响；dungeon_loot 唯一索引 uq_dungeon_loot_item 在场。）

### 4. 行数复核（迁移后）

```
===== 迁移后行数 (exit=0) =====
boss_loot|190
dungeon_loot|221
```

### 5. REST 复核（anon key，本机直连生产 API）

```
boss_loot    /rest/v1/boss_loot?select=primary_tiers,secondary_tiers&limit=1    -> HTTP 200  [{"primary_tiers":null,"secondary_tiers":null}]
dungeon_loot /rest/v1/dungeon_loot?select=primary_tiers,secondary_tiers&limit=1 -> HTTP 200  [{"primary_tiers":null,"secondary_tiers":null}]
```

四列均可经 PostgREST 匿名读查询（HTTP 200），schema 缓存重载生效；当前值为 null 属正常——tiers 待运营 1.0.7 采集后回填。

## 遗留与下一步

1. **回滚就绪未执行**：`ALTER TABLE boss_loot DROP COLUMN IF EXISTS primary_tiers; ...（共 4 条）+ NOTIFY pgrst`，见 sql/20 文首注释。
2. 行动卡第 2 步（生死门）：运营覆盖插件 1.0.7 → `/wjdc probe 1` → 「四档缩放实证」段截图发回，定 link 通道生死。
3. 备份文件建议运营择机从服务器 /tmp 归档（/tmp 重启即失）。
