# 任务书 #2：数据库 Schema 定版（产出最终建表 SQL）

> 使用方式：复制本文件全部内容，粘贴到 Kimi Code 输入框发送。
> 本任务**纯产出 SQL 文件**，不连接任何数据库、不执行任何写操作。

---

## 背景

项目即将迁移到全新的自建 Supabase 数据库。旧库（Coze 托管）经数据抢救确认：实际存在 11 张表（含 `loots` 和 `loot_records` 两张并存的装备表，均空），业务数据仅 3 行，无需迁移数据，**新库从零建表即可**。

项目 zip 中的 `sql/01_tables.sql`、`sql/02_rls.sql` 是 V2.0 时代的旧版，与后迭代的代码（v3.1.0，含用户中心、通知等）可能不一致。你的任务是**定版一份与当前代码完全匹配的最终建表 SQL**。

## 任务内容

### 1. 摸清代码真实需求（以代码为准，不以文档为准）

通读 `js/cloud.js`、`js/app.js`、`server.js`，列出代码中实际读写过的所有：
- 表名
- 每张表用到的字段名、类型、必填/可空、默认值
- 表之间的关联（外键）

注意甄别：`app.js` 中可能存在历史残留代码引用了已废弃的表/字段，以 `cloud.js` 的数据访问层和 `server.js` 的代理转发为准。发现歧义不要猜，列进报告的"待确认问题"。

### 2. 产出定版建表 SQL

生成 `sql/schema_baseline_v1.sql`，要求：

1. **文件头部注释写明**：本文件为全新部署的唯一基线，取代 `01_tables.sql` 与 `02_rls.sql`（旧文件保留作历史，不删除）；
2. 包含且仅包含代码实际使用的表（预期 10 张：guilds、guild_members、raid_members、activities、activity_attendance、loot_records、wishlists、notifications、user_profiles、user_characters；`loots` 已废弃，**不要建**）；
3. 每张表：主键 uuid 默认生成、created_at 等时间字段带默认值、外键与删除行为（如公会删除时成员/活动如何级联）显式声明；
4. 常用查询字段（如各表的 guild_id、activity_id、user_id）建索引；
5. **包含完整 RLS 策略**，规则：
   - 启用所有表的 RLS；
   - 公会成员（owner/editor/viewer 任一）可读所属公会数据；
   - owner/editor 可增删改所属公会业务数据；
   - 仅 owner 可管理公会成员角色、修改公会设置、删除公会；
   - 任何登录用户可创建公会、可读写自己的 user_profiles/user_characters/notifications；
6. SQL 必须可以在 Supabase SQL Editor 一次性执行成功（注意执行顺序：先建表再建策略；策略函数如需要可辅助的 SECURITY DEFINER 函数避免递归）。

### 3. 静态检查

- 用 `psql` 不可用，则以人工逐行审查代替，重点检查：语法、表名与代码拼写一致性、RLS 策略是否存在无限递归（guild_members 自引用是常见坑，需用 SECURITY DEFINER 辅助函数规避）。

### 4. 输出报告

1. 代码实际使用的表/字段清单（与第 1 步对应）；
2. 与 `01_tables.sql` 旧版的主要差异点；
3. 发现的歧义与待确认问题（如有）；
4. SQL 文件路径，以及给运营的一句话执行说明。

## 验收标准

- `sql/schema_baseline_v1.sql` 存在且完整覆盖代码用到的全部表和字段；
- 表名字段名与代码逐字一致（这是上次 `supabase` vs `supabaseClient` 事故的教训）；
- RLS 无递归风险设计；
- 运营粘贴进 SQL Editor 一次跑通。

## 完成后

由运营负责人到 Supabase 后台执行该 SQL（见《指引 02》第 3 步），执行结果反馈后再进入任务书 #3（P0 修复）。
