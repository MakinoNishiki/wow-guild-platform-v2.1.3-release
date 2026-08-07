# 任务书 #28-WP1 sql/19 迁移执行报告（生产自托管 Supabase）

> 日期：2026-08-07 ｜ 执行：Kimi Code（SSH 命令行通道，未使用网页 Studio）
> 目标库：101.35.124.22 自托管 Supabase（supabase-db 容器，supabase/postgres:17.6.1.136）
> 凭据纪律：SSH 凭据当次使用，未落地任何文件/截图/报告；执行器脚本 `backup/_sshtmp/run-sql19.js`（gitignored）不含密钥。

## 【改了什么】

生产库执行 `sql/19_task028_star_values.sql` 全文：`boss_loot` / `dungeon_loot` 各加 `primary_values jsonb`、`secondary_values jsonb` 两列（只加列不改列），末尾 `NOTIFY pgrst` 重载 PostgREST schema 缓存。执行前已备份两表 JSON 至服务器 /tmp。

执行方式备注：宿主机 docker 需 sudo（stdin 被密码管道占用），迁移改走文件通道——sftp 上传 SQL 至宿主机 /tmp → `docker cp` 入容器 → `psql -f` 执行；容器发现逻辑精确匹配镜像 `supabase/postgres:`（`postgrest` 前 8 字符与 `postgres` 相同，首轮曾误配 supabase-rest，已修正，未对 rest 容器造成任何影响——仅探测性 psql 调用未找到二进制即退出）。

## 【范围】

- 生产库结构：两表共 4 列新增，幂等（IF NOT EXISTS），可回滚（回滚语句就绪于 sql/19 文首注释，本次未执行）；
- 数据：零写入零变更，两表行数迁移前后一致；
- 服务器文件：`/tmp/boss_loot_20260807.json`、`/tmp/dungeon_loot_20260807.json`（备份）、`/tmp/sql19_20260807.sql`（执行件留存备查）。

## 【验证】（执行输出全附）

### 1. 备份（执行前）

```
===== 备份前行数 (exit=0) =====
boss_loot|190
dungeon_loot|221
===== COPY boss_loot → 容器 /tmp (exit=0) =====
COPY 190
===== 宿主机备份行数 boss_loot (exit=0) =====
190 /tmp/boss_loot_20260807.json
===== COPY dungeon_loot → 容器 /tmp (exit=0) =====
COPY 221
===== 宿主机备份行数 dungeon_loot (exit=0) =====
221 /tmp/dungeon_loot_20260807.json
```

两表行数与任务书预期（190 / 221）一致，备份文件已落服务器 /tmp（JSONL，每行一个 JSON 对象，含全字段）。

### 2. 迁移执行

```
===== 执行 sql/19 (exit=0) =====
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
 primary_stats    | text[]  |
 secondary_stats  | text[]  |
 primary_values   | jsonb   |          ← 新增
 secondary_values | jsonb   |          ← 新增
===== \d dungeon_loot =====
 primary_values   | jsonb   |          ← 新增
 secondary_values | jsonb   |          ← 新增
```

（完整 \d 输出含索引/外键/RLS 策略，与迁移前一致未受影响；执行留痕见本会话记录。）

### 4. 行数复核（迁移后）

```
===== 迁移后行数 (exit=0) =====
boss_loot|190
dungeon_loot|221
```

与迁移前完全一致，迁移零数据触碰。

### 5. REST 复核（anon key，本机直连生产 API）

```
boss_loot    /rest/v1/boss_loot?select=secondary_values&limit=1    -> HTTP 200  [{"secondary_values":null}]
dungeon_loot /rest/v1/dungeon_loot?select=secondary_values&limit=1 -> HTTP 200  [{"secondary_values":null}]
```

两表新列均可经 PostgREST 匿名读查询（HTTP 200），schema 缓存重载生效；当前值为 null 属正常——数值待运营游戏内 `/wjdc all` 采集后回填。

## 遗留与下一步

1. **回滚就绪未执行**：`ALTER TABLE boss_loot DROP COLUMN IF EXISTS primary_values; ...（共 4 条）+ NOTIFY pgrst`，见 sql/19 文首注释。
2. 数值回填等待运营动作：游戏内插件 1.0.5 `/wjdc all` → `/reload` → 导出文件发我转换 → 服务通道覆盖入库 → REST 复核非空率 ≥95% + 抽查 5 件对照游戏内数值。
3. 备份文件建议运营择机从服务器 /tmp 归档（/tmp 重启即失）；如需我拉取留存仓库 backup/ 可下指令。
4. 网页 Studio 未使用、旧云项目未触碰，全程 SSH 命令行为准。
