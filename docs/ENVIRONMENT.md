# 环境变量配置说明

## 必需环境变量

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `SUPABASE_URL` | Supabase 项目 URL | `https://your-project.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase 匿名公钥（前端读取用） | `eyJhbGciOi...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 服务角色密钥（服务端写入用） | `eyJhbGciOi...` |
| `DEPLOY_RUN_PORT` | 服务监听端口 | `5000` |

## Supabase 配置步骤

### 1. 创建 Supabase 项目

1. 访问 https://supabase.com 创建新项目
2. 记录 Project URL 和 API Keys

### 2. 执行数据库初始化

在 Supabase SQL Editor 中依次执行：

```sql
-- 1. 执行表结构
\i sql/01_tables.sql

-- 2. 执行 RLS 策略
\i sql/02_rls.sql
```

或直接在 SQL Editor 中粘贴执行。

### 3. 启用邮箱认证

在 Supabase Dashboard → Authentication → Settings 中：
- 确保 Email Auth 已启用
- 可选：配置 Email Templates

### 4. 配置环境变量

创建 `.env` 文件或在部署平台配置：

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
DEPLOY_RUN_PORT=5000
```

## 数据流说明

### 读取操作
- 前端通过 Supabase JS SDK（anon key + JWT）直接查询
- RLS 策略确保用户只能读取所属公会数据

### 写入操作
- 前端调用 `/api/db/rest/v1/*` 代理接口
- server.js 验证用户 JWT（调用 `/auth/v1/user`）
- server.js 使用 service_role key 转发到 Supabase REST API
- 原因：PostgREST 的 RLS INSERT 策略存在 schema 缓存问题

### 认证流程
- 用户注册/登录：Supabase Auth（email + password）
- 会话管理：Supabase JS SDK 自动处理 JWT refresh
- 本地模式：不使用 Supabase，数据存储在 localStorage
