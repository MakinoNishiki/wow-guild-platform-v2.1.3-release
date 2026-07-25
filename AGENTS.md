# AGENTS.md - WoW 团本考勤管理系统

## 项目概览
WoW 团本考勤管理系统，暗色史诗奇幻风格（WoW 主题），基于 Supabase 云端协作。Supabase 是唯一主数据源（本地模式与飞书同步已移除）。

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
│   └── verify-authz.js # SEC-001 代理鉴权回归脚本（26 场景，自建测试用户/公会后自清理）
├── DESIGN.md           # 设计规范
└── AGENTS.md           # 项目说明
```

## 功能模块
1. **用户认证** - 邮箱注册/登录、会话管理（未登录仅见注册/登录页）
2. **公会系统** - 创建公会、邀请码加入、公会切换
3. **权限管理** - 三级权限（owner/editor/viewer）、成员角色变更、公会设置
4. **仪表盘**（page:dashboard） - 出勤率统计、排行、活动概览
5. **成员管理**（page:members） - 13个职业、专精/职责联动、出勤详情
6. **考勤记录**（page:attendance） - 日历视图/列表视图、活动CRUD、BOSS选择
7. **装备分配**（page:loot） - 103件装备库、多维筛选、分配记录
8. **心愿单**（page:wishlist） - 按成员管理、竞争概览
9. **统计报表**（page:reports） - 出勤率图表、角色分布
10. **数据管理**（page:data） - 设置、JSON导入导出、重置
11. **更新日志**（page:changelog） - 版本历史

## 云端架构
### 数据库表（Supabase PostgreSQL）
- `guilds` - 公会（name, owner_id, invite_code）
- `guild_members` - 公会成员权限（user_id, guild_id, role: owner/editor/viewer）
- `raid_members` - WoW 角色成员（guild_id, name, class, spec, role）
- `activities` - 考勤活动（guild_id, name, activity_date, raid, boss）
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
  - 代理鉴权逻辑集中在 server.js `authorizeProxyRequest()`；回归脚本 `scripts/verify-authz.js`
  - RPC 代理仅放行白名单函数（当前仅 `get_unread_notification_count`）
- 批量导入/清空属规范 1.2.2 批处理例外：循环 saveCloudData 后统一 reload 一次
- 读操作优先从云端加载，失败时回退到 localStorage 缓存

## 关键数据
- 4个团本（12.0）：虚影尖塔、梦境裂隙、进军奎尔丹纳斯、孢陨幽境
- 103件史诗装备，按槽位和BOSS掉落分配
- 13个职业（含武僧、恶魔猎手、唤魔师），每职业2-4个专精
- 3个职责：坦克、治疗、输出

## 开发命令
- 本地预览：`node server.js`
- 自动分配端口：通过 `DEPLOY_RUN_PORT` 环境变量

## 注意事项
- 数据只存 Supabase；localStorage 仅缓存，JSON 导入导出仅作备份/迁移
- 出勤率全站唯一算法源 `getAttendanceStats()`（app.js）：出勤率 = 出勤 ÷ 应到；出勤 = 出席+迟到+替补；应到 = 该成员已标记记录数；请假计入应到不计入出勤
- viewer 前端权限门：`updatePermissionUI()` 给 body 加 `viewer-mode` 类隐藏/禁用编辑入口（`.edit-only` 等），服务端代理鉴权为最终防线
- 装备分配 ↔ 心愿单联动由 `syncWishlistLinkages()` 处理（标记/取消已获取、REQ-007 自动创建心愿记录）
- 删除活动依赖 DB 外键级联删考勤（ON DELETE CASCADE），不要再加显式考勤删除调用
- 职业色遵循 WoW 官方配色
- 响应式断点：768px（移动端底部Tab导航）
- 代码为IIFE模式，所有函数全局暴露，通过 `switchPage()` 路由
- server.js 启动时解析项目根目录 .env（手写解析，零依赖），提供 `/api/supabase-config` 返回 Supabase URL 和 Anon Key
- server.js 提供 `/api/db/rest/v1/*` 代理写入接口（JWT 验证 + 公会级鉴权后，用 service_role key 写入）
- cloud.js 中写入操作通过 `dbInsert/dbUpdate/dbDelete` 代理函数，读取操作直接使用 Supabase SDK
