# ARCHITECTURE.md - WoW Guild Platform 技术架构

## 项目概览

WoW 团本考勤管理系统，暗色史诗奇幻风格（WoW 主题），支持云端协作（Supabase）和本地模式（localStorage）。

## 技术栈

- **前端**: HTML5 + CSS3 + Vanilla JavaScript (ES6+)
- **后端**: Node.js 原生 HTTP 服务器（server.js）
- **数据库**: Supabase PostgreSQL（云端）+ localStorage（本地）
- **认证**: Supabase Auth（邮箱密码）
- **UI**: 纯 CSS（无框架），WoW 暗色主题
- **部署**: 静态文件服务器 + Node.js API 代理

## 目录结构

```
├── index.html                  # 入口页面（认证界面 + 公会管理 + 主应用 DOM）
├── css/
│   └── main.css                # 全局样式（WoW 暗色主题 + 认证界面样式）
├── js/
│   ├── cloud.js                # 云端数据层（Supabase 集成）
│   └── app.js                  # 完整应用逻辑（单文件 SPA）
├── server.js                   # Node.js 静态文件服务器 + API 代理
├── package.json                # 项目配置
├── PRD.md                      # 产品需求文档
├── DESIGN.md                   # 设计规范
├── AGENTS.md                   # 项目说明
├── ARCHITECTURE.md             # 技术架构（本文件）
├── FINAL_ACCEPTANCE_REPORT.md  # 最终验收报告
├── V2.1_Data_Persistence_Stability_Fix_Report.md
├── V2.1_Loot_Record_Release_Report.md
├── V2.1.1_Stability_Fix_Report.md
├── V2.1.2_Architecture_Audit_Report.md
├── V2.1_BugFix_Report.md
├── V2.1_Data_Architecture_Stability_Fix_Report.md
├── 飞书同步集成说明.md
├── sql/
│   ├── 01_tables.sql           # 数据库表结构
│   └── 02_rls.sql              # RLS 权限策略
└── docs/
    └── ENVIRONMENT.md          # 环境变量配置说明
```

## 核心架构

### 数据流架构

```
┌─────────────────────────────────────────────────────────────┐
│                        用户浏览器                            │
│                                                             │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │  index.html │───→│  js/app.js   │───→│  js/cloud.js  │  │
│  │  (DOM/UI)   │    │  (业务逻辑)   │    │  (云端数据层)  │  │
│  └─────────────┘    └──────────────┘    └───────┬───────┘  │
│                                                  │          │
│                         ┌────────────────────────┘          │
│                         │                                   │
│                    ┌────▼────┐                              │
│                    │ appData │ (内存状态)                     │
│                    │ (内存)   │                              │
│                    └────┬────┘                              │
│                         │                                   │
│                    ┌────▼────┐                              │
│                    │localStorage│ (缓存/本地模式)            │
│                    │  (缓存)   │                              │
│                    └─────────┘                              │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      server.js (Node.js)                     │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ 静态文件服务  │  │ /api/supabase │  │ /api/db/rest/v1/*│  │
│  │ (index.html  │  │ -config       │  │ (写入代理)        │  │
│  │  /css/js)    │  │ (读取配置)     │  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                             │
│  写入流程:                                                   │
│  1. 前端发送 POST/PATCH/DELETE 到 /api/db/rest/v1/*         │
│  2. server.js 验证用户 JWT (调用 /auth/v1/user)             │
│  3. server.js 使用 service_role key 转发到 Supabase         │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Supabase PostgreSQL                       │
│                                                             │
│  guilds / guild_members / raid_members / activities         │
│  activity_attendance / loots / loot_records / wishlists     │
│  notifications / feishu_configs / user_profiles             │
│                                                             │
│  RLS 策略: 公会成员可读取，owner/editor 可写入                │
└─────────────────────────────────────────────────────────────┘
```

### 统一 CRUD 数据流

```
用户操作
  ↓
表单验证（本地）
  ↓
cloudCrud(dataType, operation, payload)
  ├── saveCloudData() → 写入 Supabase（通过 server.js 代理）
  ├── reloadData() → 从 Supabase 重新读取最新数据
  ├── saveData() → 更新 localStorage 缓存
  └── renderFn() → 重新渲染当前模块
  ↓
关闭 Modal / 显示 Toast
```

### 模式切换

- **云端模式**: 登录后自动启用，数据存储在 Supabase
- **本地模式**: 无需登录，数据存储在 localStorage，无多设备同步

## 数据库表关系

```
guilds (公会)
  ├── guild_members (公会成员权限: owner/editor/viewer)
  ├── raid_members (WoW 角色成员)
  ├── activities (考勤活动)
  │     └── activity_attendance (出勤记录 → raid_members)
  ├── loots (装备记录 - 旧表)
  ├── loot_records (装备履历 - V2.1 主表 → raid_members)
  ├── wishlists (心愿单 → raid_members, items JSONB)
  ├── notifications (通知)
  └── feishu_configs (飞书配置)

auth.users (Supabase Auth)
  ├── guild_members (用户↔公会关联)
  ├── raid_members (角色成员，可选关联)
  └── user_profiles (用户资料)
```

## 前端模块清单

| 模块 | 页面 ID | 数据来源 | 主要函数 |
|------|---------|----------|----------|
| 仪表盘 | page-dashboard | Supabase | renderDashboard() |
| 成员管理 | page-members | Supabase | saveMember/deleteMember/renderMembers |
| 考勤记录 | page-attendance | Supabase | saveActivity/saveAttendance/renderAttendance |
| 装备分配 | page-loot | Supabase | lootSave/lootDelete/lootRender |
| 心愿单 | page-wishlist | Supabase | wishlistSave/wishlistDelete/wishlistRender |
| 统计报表 | page-reports | Supabase | renderReports/getAttendanceRankings |
| 数据管理 | page-data | localStorage | saveSettings/exportData/importJSON |
| 用户中心 | - | Supabase | loadUserProfile/saveUserProfile |
| 公会管理 | - | Supabase | handleCreateGuild/handleJoinGuild |
| 更新日志 | page-changelog | 硬编码 | renderChangelog |

## 防重复提交机制

所有保存按钮均实现防重复提交：
- 按钮 ID + `xxxSaving` 全局标志
- 保存中禁用按钮 + 显示 loading 文案
- 保存完成后恢复按钮状态

涉及按钮：
- `memberSaveBtn` / `memberSaving`
- `activitySaveBtn` / `activitySaving`
- `attendanceSaveBtn` / `attendanceSaving`
- `lootSaveBtn` / `lootSaving`
- `wishlistSaveBtn` / `wishlistSaving`

## 飞书同步（备份/迁移功能）

飞书同步为离线备份功能，不参与实时数据流：
- 导出：生成 JSON 文件供飞书多维表格导入
- 导入：解析 JSON 文件写入 Supabase（merge/overwrite 两种模式）
- 装备/心愿单使用「蝮蛇」中转（飞书多维表格 ↔ JSON ↔ 本系统）

## 性能考虑

- 单文件 SPA，无路由库，display block/none 切换页面
- 所有渲染函数直接操作 innerHTML（无虚拟 DOM）
- 数据加载：进入公会时一次性加载所有数据到内存
- 分页：统计报表 20 条/页
- 心愿单/装备记录：全量加载（数据量小）
