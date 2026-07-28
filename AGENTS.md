# AGENTS.md - 魔兽管家（WoW Butler）

## 项目概览
魔兽管家（WoW Butler）——面向 WoW 公会的团本考勤管理平台，暗色史诗奇幻风格（WoW 主题），基于 Supabase 云端协作。Supabase 是唯一主数据源（本地模式与飞书同步已移除）。

## 品牌与资源（任务书 #13）
- 品牌名：魔兽管家 WoW Butler（侧边栏/登录页/页签/更新日志统一）
- `assets/brand/`：logo_B_主标.png、logo_B_256.png、logo_B_64.png、favicon-32/16.png
- `assets/icons/`：16 枚本地自绘 SVG（13 职业 + 3 职责，单色职业色，文件名用 classMap/roleTypeMap 英文 key），应用位置：成员列表、考勤名单、智能导入预览（图标+文字，不替换文字）；不使用暴雪官方素材/外链

## 技术栈
- HTML5 + CSS3 + Vanilla JavaScript (ES6+)
- Node.js 静态服务器（server.js，含 Supabase 配置 API）
- Supabase（云端数据库 + 用户认证 + RLS 权限）
- Supabase JS SDK（CDN 引入）
- localStorage 仅作数据缓存

## 目录结构
```
├── index.html          # 入口页面（含认证界面、公会管理、主应用 DOM）
├── css/
│   └── main.css        # 全局样式（WoW 暗色主题 + 认证界面样式）
├── js/
│   ├── cloud.js        # 云端数据层（Supabase 集成：认证、公会、数据同步）
│   └── app.js          # 完整应用逻辑（约7700行）
│       ├── 数据管理（loadData/saveData/cloudCrud）
│       ├── 成员管理（增删改查、职业专精、职责标签）
│       ├── 考勤记录（日历视图、列表视图、活动CRUD）
│       ├── 装备分配（103件装备库、维筛选、分配记录）
│       ├── 心愿单（成员管理、全员竞争概览）
│       ├── 统计报表（出勤率图表、角色分布）
│       ├── 数据管理（JSON导入导出、数据重置）
│       └── 更新日志
├── server.js           # Node.js 静态文件服务器 + /api/supabase-config + /api/db 写入代理（含公会级鉴权）
├── scripts/
│   └── verify-authz.js # SEC-001 代理鉴权回归脚本（30 场景，自建测试用户/公会后自清理）
├── DESIGN.md           # 设计规范
└── AGENTS.md           # 项目说明
```

## 功能模块
1. **用户认证** - 邮箱注册/登录、会话管理（未登录仅见注册/登录页）
2. **公会系统** - 创建公会、邀请码加入、公会切换
3. **权限管理** - 三级权限（owner/editor/viewer）、成员角色变更、公会设置、公会资料（REQ-025：简介/分配制度/规则说明，仅 owner 可编辑）
4. **仪表盘**（page:dashboard） - 出勤率统计、排行、活动概览
5. **成员管理**（page:members） - 13个职业、专精/职责联动、职责列（按专精推导）、出勤详情、智能导入（REQ-023：双宏教程、多格式解析+时间戳清洗、名字/名字-服务器双形态查重、预览确认，专精占位"待补充"；REQ-032：「从 WCL 链接导入」标签页，复用同一预览确认链路，subType→中文职业映射、server 参与同服查重）、软删除与恢复（REQ-042：单个/批量删除 = status 置「离队」不真删行，历史考勤/心愿/装备记录全保留；列表默认隐藏离队成员，「显示已离队」开关灰显；REQ-002 查重只针对活跃成员，撞离队同名弹确认恢复优先于新建——DB 有 (guild_id,name) 唯一索引无法新建同名；装备分配/考勤详情中离队成员灰色「已离队」标记）
6. **考勤记录**（page:attendance） - 默认列表视图/日历视图（按 userId+guildId 记忆，BUG-023）、活动CRUD、BOSS选择、WCL 日志链接（REQ-014）、WCL 同步考勤（REQ-033：已挂 WCL 链接的活动可一键同步，预览三分区——全勤绿/部分参战黄默认出席/未匹配红，不覆盖手动标记，幂等，成功后写 activities.wcl_snapshot 快照）、筛选条（REQ-018：成员/状态多选/时间范围/含已取消开关+出勤率小计，本赛季=最近90天）、考勤详情勾选批量标记（REQ-017-A）、活动列表勾选批量删除（REQ-017-B）、WCL 已导入提示条（REQ-037：快照存在且非全员已标记时显示，N 取快照 imported 字段）、活动状态（REQ-020：正常/已取消，已取消灰显+徽标、考勤区禁编辑、其考勤不计入任何出勤率，可恢复；status 服务端白名单 normal/cancelled）、团队标签与冲突检测（REQ-028：team_tag 自由文本，同标签同日时段交叉只警告不禁止，冲突活动列表黄色高亮）、团本下拉（REQ-029：datalist 可手输，最近 3 个按公会置顶，清单为 js 常量待 REQ-003 主数据切换）
7. **装备分配**（page:loot） - 103件装备库、多维筛选、心愿独立列、Roll 点循环输入（1-100）、分配记录
8. **心愿单**（page:wishlist） - 按成员管理、竞争概览
9. **统计报表**（page:reports） - 出勤率图表、角色分布
10. **数据管理**（page:data） - 设置、JSON导入导出、重置
11. **更新日志**（page:changelog） - 版本历史

## 云端架构
### 数据库表（Supabase PostgreSQL）
- `guilds` - 公会（name, owner_id, invite_code, description, loot_rule_type, loot_rule_text）
- `guild_members` - 公会成员权限（user_id, guild_id, role: owner/editor/viewer）
- `raid_members` - WoW 角色成员（guild_id, name, class, spec, role）
- `activities` - 考勤活动（guild_id, name, activity_date, raid, boss, wcl_url, wcl_report_code, wcl_snapshot, status, team_tag）
- `activity_attendance` - 出勤记录（activity_id, member_id, status）
- `loots` - 装备分配（guild_id, item_name, member_id, boss, raid）
- `wishlists` - 心愿单（guild_id, member_id, items JSONB）

### RLS 权限策略
- 公会成员（任何角色）：可读取所属公会数据
- owner/editor：可增删改公会数据
- owner：可管理公会成员权限
- 认证用户：可创建公会

### 数据同步机制
- Supabase 是唯一主数据源；云端数据加载到内存（appData），同时缓存到 localStorage（仅缓存）
- **读操作**：直接通过 Supabase REST API（anon key + JWT），RLS SELECT 策略正常工作
- **写操作**：统一走 `cloudCrud()` 入口（Save DB → Load DB → Update State → Render），底层经 server.js 代理（`/api/db/rest/v1/*`）
  - 代理先验证用户 JWT（调用 `/auth/v1/user`），再做公会级鉴权（owner/editor 可写业务表，viewer 只读；个人表限本人），最后用 service_role key 写入
  - 性能缓存（任务书 #10）：JWT 按 token 缓存 60s、公会角色按 user+guild 缓存 120s；guild_members/guilds 写成功即清空角色缓存（即时生效）；行归属联查不缓存
  - 代理鉴权逻辑集中在 server.js `authorizeProxyRequest()`；回归脚本 `scripts/verify-authz.js`
  - RPC 代理仅放行白名单函数（当前仅 `get_unread_notification_count`）
- 批量导入/清空属规范 1.2.2 批处理例外：循环 saveCloudData 后统一 reload 一次
- 读操作优先从云端加载，失败时回退到 localStorage 缓存

### WCL 集成（任务书 #11，REQ-032/033）
- 凭证：`WCL_CLIENT_ID` / `WCL_CLIENT_SECRET` 仅存服务端环境变量（.env），前端 js/ 禁止出现
- 端点（server.js，JWT + 公会角色鉴权，owner/editor 可用，viewer 403）：
  - `POST /api/wcl/report-summary` `{ reportCode, guildId }` → 标题/时间/Boss 战场次/玩家列表（name/server/subType/参战场次），reportCode 支持完整 URL 或纯 code
  - `POST /api/wcl/attendance-snapshot` `{ reportCode, activityId, guildId }` → 同上 + 已存快照状态
- token 管理：进程内缓存 access_token，提前 60s 刷新；**报告数据本身不缓存**（用户可能刚传完 log 就要同步）
- 速率限制：WCL V2 GraphQL 免费档 3600 points/小时，单次同步远低于额度；错误中文透传（429 超限 / 504 超时 10s / 502 报告不存在或私有或服务暂不可用）
- 回归脚本：`scripts/verify-wcl-api.js`（API 连通性）、`scripts/verify-wcl-endpoints.js`（端点端到端冒烟，需传入 WCL 凭证环境变量）

## 关键数据
- 4个团本（12.0）：虚影尖塔、梦境裂隙、进军奎尔丹纳斯、孢陨幽境
- 103件史诗装备，按槽位和BOSS掉落分配
- 13个职业（含武僧、恶魔猎手、唤魔师），每职业2-4个专精
- 3个职责：坦克、治疗、输出

## 开发命令
- 本地预览：`node server.js`
- 自动分配端口：通过 `DEPLOY_RUN_PORT` 环境变量

## 注意事项
- 版本号单一常量：`APP_VERSION`（js/app.js 顶部），发布时只改这一处，侧边栏自动显示
- 数据只存 Supabase；localStorage 仅缓存，JSON 导入导出仅作备份/迁移
- 出勤率全站唯一算法源 `getAttendanceStats()`（app.js）：出勤率 = 出勤 ÷ 应到；出勤 = 出席+迟到+替补；应到 = 该成员已标记记录数；请假计入应到不计入出勤；**已取消（status='cancelled'）活动的考勤不计入应到与出勤（REQ-020，函数内统一过滤，禁止别处另写）**
- viewer 前端权限门：`updatePermissionUI()` 给 body 加 `viewer-mode` 类隐藏/禁用编辑入口（`.edit-only` 等），服务端代理鉴权为最终防线
- 装备分配 ↔ 心愿单联动由 `syncWishlistLinkages()` 处理（标记/取消已获取、REQ-007 自动创建心愿记录）
- 删除活动依赖 DB 外键级联删考勤（ON DELETE CASCADE），不要再加显式考勤删除调用
- 职业色遵循 WoW 官方配色
- 响应式断点：768px（移动端底部Tab导航）
- 代码为IIFE模式，所有函数全局暴露，通过 `switchPage()` 路由
- server.js 启动时解析项目根目录 .env（手写解析，零依赖），提供 `/api/supabase-config` 返回 Supabase URL 和 Anon Key
- server.js 提供 `/api/db/rest/v1/*` 代理写入接口（JWT 验证 + 公会级鉴权后，用 service_role key 写入）
- cloud.js 中写入操作通过 `dbInsert/dbUpdate/dbDelete` 代理函数，读取操作直接使用 Supabase SDK
