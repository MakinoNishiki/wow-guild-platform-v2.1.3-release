# WoW Guild Platform - 完整源代码导出

## 项目简介

WoW 团本考勤管理系统，支持云端协作（Supabase）和本地模式（localStorage）。
暗色史诗奇幻风格，支持多公会、多成员、考勤记录、装备分配、心愿单管理。

## 快速开始

### 1. 环境准备

```bash
# Node.js 18+ 必需
node -v

# 启用密钥扫描钩子（SEC-003，克隆后必做）
git config core.hooksPath .githooks

# 安装依赖（仅原生 Node.js，无需 npm install）
```

### 2. Supabase 配置

1. 创建 Supabase 项目：https://supabase.com
2. 在 SQL Editor 中执行：
   - `sql/01_tables.sql` - 创建所有表
   - `sql/02_rls.sql` - 配置 RLS 权限策略
3. 启用 Email Auth（Authentication → Settings）

### 3. 环境变量

创建 `.env` 文件：

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DEPLOY_RUN_PORT=5000
```

详细说明见 `docs/ENVIRONMENT.md`

### 4. 启动服务

```bash
# 开发模式
node server.js

# 或使用环境变量指定端口
DEPLOY_RUN_PORT=5000 node server.js
```

访问 http://localhost:5000

### 5. 首次使用

1. 注册账号（邮箱 + 密码）
2. 创建公会或加入已有公会（邀请码）
3. 开始使用

## 项目结构

```
├── index.html                  # 入口页面
├── css/main.css                # 全局样式
├── js/app.js                   # 应用逻辑（单文件 SPA）
├── js/cloud.js                 # 云端数据层
├── server.js                   # Node.js 服务器
├── package.json                # 项目配置
├── sql/
│   ├── 01_tables.sql           # 数据库表结构
│   └── 02_rls.sql              # RLS 权限策略
├── docs/
│   ├── ENVIRONMENT.md          # 环境变量配置
│   ├── ARCHITECTURE.md         # 技术架构
│   └── KNOWN_ISSUES.md         # 已知问题
├── PRD.md                      # 产品需求
├── DESIGN.md                   # 设计规范
├── AGENTS.md                   # 项目说明
└── FINAL_ACCEPTANCE_REPORT.md  # 验收报告
```

## 技术栈

- 前端：HTML5 + CSS3 + Vanilla JavaScript (ES6+)
- 后端：Node.js 原生 HTTP 服务器
- 数据库：Supabase PostgreSQL
- 认证：Supabase Auth

## 文档索引

| 文档 | 说明 |
|------|------|
| `PRD.md` | 产品需求文档 |
| `DESIGN.md` | 设计规范 |
| `AGENTS.md` | 项目功能说明 |
| `docs/ARCHITECTURE.md` | 技术架构 |
| `docs/ENVIRONMENT.md` | 环境变量配置 |
| `docs/KNOWN_ISSUES.md` | 已知问题 |
| `FINAL_ACCEPTANCE_REPORT.md` | 最终验收报告 |
| `V2.1*_Report.md` | 各版本修复报告 |
| `飞书同步集成说明.md` | 飞书集成文档 |

## 版本历史

- V2.1.2 (当前): 架构稳定，统一 CRUD 数据流
- V2.1.1: 稳定性修复（防重复/批量操作）
- V2.1: 装备履历模型（loot_records 表）
- V2.0: 云端协作（Supabase 集成）
- V1.x: 本地模式

## 部署

### 本地开发

```bash
node server.js
```

### 生产部署

支持任何 Node.js 托管平台（Vercel/Netlify/自托管）：

1. 配置环境变量
2. 执行数据库初始化 SQL
3. 部署 server.js

## 注意事项

1. **禁止硬编码密钥**：所有敏感信息通过环境变量配置
2. **RLS 策略**：确保 Supabase 表已启用 RLS
3. **service_role key**：仅用于 server.js 代理，不要暴露给前端
4. **本地模式**：不连接 Supabase，数据仅存储在 localStorage

## 联系方式

项目问题请查阅 `docs/KNOWN_ISSUES.md`
