# AGENTS.md - WoW 团本考勤管理系统

## 项目概览
WoW 团本考勤管理系统，暗色史诗奇幻风格（WoW 主题），支持云端协作（Supabase）和本地模式（localStorage）。

## 技术栈
- HTML5 + CSS3 + Vanilla JavaScript (ES6+)
- Node.js 静态服务器（server.js，含 Supabase 配置 API）
- Supabase（云端数据库 + 用户认证 + RLS 权限）
- Supabase JS SDK（CDN 引入）
- localStorage 数据持久化（本地模式/缓存）

## 目录结构
```
├── index.html          # 入口页面（含认证界面、公会管理、主应用 DOM）
├── css/
│   └── main.css        # 全局样式（WoW 暗色主题 + 认证界面样式）
├── js/
│   ├── cloud.js        # 云端数据层（Supabase 集成：认证、公会、数据同步）
│   └── app.js          # 完整应用逻辑（7592行）
│       ├── 数据管理（loadData/saveData/initSampleData）
│       ├── 成员管理（增删改查、职业专精、职责标签）
│       ├── 考勤记录（日历视图、列表视图、活动CRUD）
│       ├── 装备分配（103件装备库、维筛选、分配记录）
│       ├── 心愿单（成员管理、全员竞争概览、飞书同步）
│       ├── 统计报表（出勤率图表、角色分布）
│       ├── 数据管理（JSON导入导出、飞书同步、数据重置）
│       └── 更新日志
├── server.js           # Node.js 静态文件服务器 + /api/supabase-config + /api/db 写入代理
├── DESIGN.md           # 设计规范
└── AGENTS.md           # 项目说明
```

## 功能模块
1. **用户认证** - 邮箱注册/登录、会话管理、本地模式入口
2. **公会系统** - 创建公会、邀请码加入、公会切换
3. **权限管理** - 三级权限（owner/editor/viewer）、成员角色变更、公会设置
4. **仪表盘**（page:dashboard） - 出勤率统计、排行、活动概览
5. **成员管理**（page:members） - 13个职业、专精/职责联动、出勤详情
6. **考勤记录**（page:attendance） - 日历视图/列表视图、活动CRUD、BOSS选择
7. **装备分配**（page:loot） - 103件装备库、多维筛选、分配记录
8. **心愿单**（page:wishlist） - 按成员管理、竞争概览、飞书同步
9. **统计报表**（page:reports） - 出勤率图表、角色分布
10. **数据管理**（page:data） - 设置、导入导出、飞书同步、重置
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
- 混合模式：云端数据加载到内存（appData），同时缓存到 localStorage
- **读操作**：直接通过 Supabase REST API（anon key + JWT），RLS SELECT 策略正常工作
- **写操作**：通过 server.js 代理（`/api/db/rest/v1/*`），server.js 验证 JWT 后使用 service_role key 写入 Supabase
  - 原因：PostgREST 的 RLS INSERT 策略存在 schema 缓存问题，通过代理绕过
  - server.js 先验证用户 JWT（调用 `/auth/v1/user`），再转发到 Supabase
- 写操作先更新本地 appData，再异步同步到云端
- 读操作优先从云端加载，失败时回退到 localStorage 缓存

## 关键数据
- 4个团本（12.0）：虚影尖塔、梦境裂隙、进军奎尔丹纳斯、孢陨幽境
- 103件史诗装备，按槽位和BOSS掉落分配
- 13个职业（含武僧、恶魔猎手、唤魔师），每职业2-4个专精
- 3个职责：坦克、治疗、输出
- 默认13个示例成员（每职业1个）、10条随机活动记录

## 开发命令
- 本地预览：`node server.js`
- 自动分配端口：通过 `DEPLOY_RUN_PORT` 环境变量

## 注意事项
- 云端模式下数据存储在 Supabase，本地模式使用 localStorage
- 职业色遵循 WoW 官方配色
- 响应式断点：768px（移动端底部Tab导航）
- 代码为IIFE模式，所有函数全局暴露，通过 `switchPage()` 路由
- server.js 提供 `/api/supabase-config` 接口返回 Supabase URL 和 Anon Key
- server.js 提供 `/api/db/rest/v1/*` 代理写入接口（使用 service_role key 绕过 RLS INSERT 问题）
- cloud.js 中写入操作通过 `dbInsert/dbUpdate/dbDelete` 代理函数，读取操作直接使用 Supabase SDK
