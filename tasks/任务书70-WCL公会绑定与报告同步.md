# 任务书 #70

**项目**：魔兽管家（WoW Butler）
**任务名称**：WCL 公会绑定与报告同步（双轨方案：粘贴绑定 A + OAuth 授权 C）
**类型**：前端 + 后端 + 数据库
**优先级**：P1（与 #65 WP2 并行）
**关联**：任务书 #11 WCL 专项、#69 Phase 1 调研
**前置依赖**：#69 调研完成（WCL API 可用、Supabase Auth 已启用）
**版本串**：待定（完成后 bump）
**数据库**：新增字段 + 可选迁移

---

## 一、问题背景

当前 WCL 集成停留在「活动页手动粘贴报告链接」，团长每次打完后需要：
1. 打开 WCL 网站
2. 找到报告
3. 复制链接
4. 粘贴到管家活动页

目标：绑定 WCL 公会后，管家自动发现新报告并提示关联，省去复制粘贴。

---

## 二、方案总览（A + C 双轨并存）

用户在「公会设置」里看到两个绑定入口，任选其一：

| 方案 | 名称 | 用户操作 | 适用场景 |
|------|------|---------|---------|
| **A** | 粘贴 Guild ID | 复制 WCL 公会链接 → 粘贴 → 确认公会名 | 快速绑定，无需 WCL 账号 |
| **C** | WCL 账号授权 | 点击「WCL 登录」→ 弹窗授权 → 选公会绑定 | 绑定自己拥有的公会，体验更顺 |

**两条路径最终落库字段一致，后续自动同步逻辑完全共用。**

---

## 三、数据库变更

### 3.1 guilds 表新增字段

```sql
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS wcl_guild_id BIGINT;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS wcl_guild_name TEXT;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS wcl_server_name TEXT;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS wcl_region TEXT DEFAULT 'cn';
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS wcl_bind_method TEXT; -- 'paste' | 'oauth' | null
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS wcl_token JSONB; -- 仅 C 方案用：{access_token, refresh_token, expires_at}
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS wcl_bound_at TIMESTAMPTZ;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS wcl_auto_create_event BOOLEAN DEFAULT false; -- 自动创建活动开关
```

### 3.2 唯一约束

```sql
-- 一个 WCL 公会 ID 只能绑定一个管家公会（避免重复绑定）
CREATE UNIQUE INDEX idx_guilds_wcl_guild_id 
  ON guilds(wcl_guild_id) 
  WHERE wcl_guild_id IS NOT NULL;
```

---

## 四、方案 A：粘贴 Guild ID 绑定

### 4.1 前端交互

**公会设置页 → WCL 公会绑定区域：**

```
┌─────────────────────────────────────────────────────────────┐
│  🔗 WCL 公会绑定（可选）                                      │
│                                                              │
│  方式一：粘贴公会链接                                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ https://www.warcraftlogs.com/guild/id/766716       │    │
│  └─────────────────────────────────────────────────────┘    │
│  [ 检测公会 ]                                                │
│                                                              │
│  检测到公会：挽丨歌 - 金色平原                                │
│  [ 确认绑定 ]  [ 取消 ]                                      │
│                                                              │
│  💡 提示：复制你的 WCL 公会页面链接粘贴即可                   │
└─────────────────────────────────────────────────────────────┘
```

**正则提取 Guild ID：**
- 输入格式支持：
  - `https://www.warcraftlogs.com/guild/id/766716`
  - `https://www.warcraftlogs.com/guild/cn/金色平原/挽丨歌`
  - 纯数字 `766716`
- 提取逻辑：匹配 `/guild/id/(\d+)` 或 `/guild/[^/]+/[^/]+/([^/?]+)`（中文名需额外调搜索接口）

### 4.2 后端 API

**GET /api/wcl/guild-lookup**
- Query: `?id=766716` 或 `?name=挽丨歌&server=金色平原&region=cn`
- 调 WCL GraphQL（**公开查询，无需 OAuth token**）：

```graphql
query {
  guildData {
    guild(id: 766716) {
      id
      name
      server { name }
    }
  }
}
```

- 返回：`{id, name, serverName, region}`

**POST /api/wcl/bind-guild-paste**
- Body: `{guildId: 766716, name: "挽丨歌", serverName: "金色平原", region: "cn"}`
- 写入 `guilds` 表：`wcl_guild_id`, `wcl_guild_name`, `wcl_server_name`, `wcl_region`, `wcl_bind_method='paste'`, `wcl_bound_at=now()`
- 校验：当前用户是会长/管理才能绑定

---

## 五、方案 C：WCL OAuth 授权绑定

### 5.1 OAuth 流程

```
① 用户点击「WCL 账号登录」
   → 后端生成 state（防 CSRF）+ redirect_uri
   → 跳转到 https://www.warcraftlogs.com/oauth/authorize?client_id=xxx&redirect_uri=xxx&response_type=code&state=xxx

② 用户在 WCL 弹窗输入账号密码 → 点击授权
   → WCL 重定向到 https://api.ddctl.com/auth/wcl/callback?code=xxx&state=xxx

③ 后端 /auth/wcl/callback：
   - 校验 state
   - POST WCL 换 token（code → access_token + refresh_token）
   - 存 token 到 guilds.wcl_token
   - 调 WCL API 查用户所属公会列表
   - 重定向回前端：wow.ddctl.com/#/guild/settings?wcl_oauth=success

④ 前端展示公会列表：
   「检测到你在 WCL 有以下公会，选择要绑定的：」
   ○ 挽丨歌 - 金色平原
   ○ 另一个公会 - 服务器
   [ 确认绑定 ]

⑤ POST /api/wcl/bind-guild-oauth
   - Body: `{guildId: 766716}`
   - 从已存 token 调 guild API 确认
   - 写入 guilds 表（同方案 A 字段，method='oauth'）
```

### 5.2 后端 API

**GET /auth/wcl/authorize**
- 生成随机 state，存 session 或临时缓存
- 拼接 WCL OAuth URL，302 跳转

**GET /auth/wcl/callback**
- 校验 state
- POST `https://www.warcraftlogs.com/oauth/token` 换 token
- 存 token（加密存储，service_role 写入）
- 调 `userData { user { guilds { id name server { name } } } }` 查公会列表
- 公会列表临时缓存（5分钟）
- 重定向回前端 + guilds 列表 JSON（或前端再调一次 /api/wcl/user-guilds）

**GET /api/wcl/user-guilds**
- 从 `guilds.wcl_token` 取 access_token
- 若过期，用 refresh_token 自动刷新
- 调 WCL 返回用户公会列表

**POST /api/wcl/bind-guild-oauth**
- Body: `{guildId}`
- 校验当前用户是会长/管理
- 校验 guildId 在用户公会列表中
- 写入 guilds 表（method='oauth'）

### 5.3 Token 管理

| 字段 | 说明 |
|------|------|
| `access_token` | 7 天有效期，存在 guilds.wcl_token |
| `refresh_token` | 长期有效，用于换新的 access_token |
| `expires_at` | 过期时间戳，调用前检查 |
| 自动刷新 | access_token 过期时，自动用 refresh_token 换新的 |

---

## 六、自动关联报告（A/C 共用）

### 6.1 触发策略

**策略一：手动刷新（默认）**
- 活动页新增「🔄 同步 WCL 报告」按钮
- 点击即查，即时反馈

**策略二：定时同步（可选开启）**
- 用户开启后，每小时后台查一次
- 实现方式：Supabase Edge Function cron 或前端进入页面时静默查

**策略三：进入活动页自动查（默认关闭）**
- 开关控制，避免频繁调 API

### 6.2 查询逻辑

```javascript
// 伪代码
async function syncWclReports(guildId) {
  // 1. 取 token（C 方案）或直接用公开 API（A 方案）
  const token = guild.wcl_bind_method === 'oauth' 
    ? await getValidToken(guild.id) 
    : null;
  
  // 2. 查 guildReports
  const reports = await wclQuery(`
    query {
      reportData {
        guildReports(guildName: "${guild.wcl_guild_name}", 
                     serverName: "${guild.wcl_server_name}", 
                     serverRegion: "${guild.wcl_region}") {
          data { code title startTime endTime zone { name } }
          total
        }
      }
    }
  `, token); // A 方案传 null，C 方案传 token（查私有报告用）
  
  // 3. 过滤已关联的报告
  const newReports = reports.filter(r => !alreadyLinked(r.code));
  
  // 4. 返回新报告列表
  return newReports;
}
```

### 6.3 前端提示

**有新报告时（活动页顶部 banner）：**

```
┌─────────────────────────────────────────────────────────────┐
│  📋 检测到 WCL 新报告                                         │
│  「10月14日 尼鲁巴尔王宫 史诗」— 2小时34分                    │
│  [ 关联到本次活动 ]    [ 创建新活动并关联 ]    [ 忽略 ]       │
└─────────────────────────────────────────────────────────────┘
```

**无新报告时：**
```
上次同步：10分钟前 | WCL 暂无新公开报告
[ 🔄 立即刷新 ]
```

---

## 七、自动创建活动（可选开关）

### 7.1 开关位置

公会设置页 WCL 绑定区域下方：

```
☐ 自动创建活动（检测到新报告时自动创建活动并关联）
    ⚠️ 开启后，WCL 有新公开报告时管家会自动创建活动。
    自动创建的活动时间以 WCL 报告为准，可能需要手动调整。
```

### 7.2 自动创建规则

| 规则 | 说明 |
|------|------|
| 活动名 | `[日期] [副本名] [难度]`，如「10月14日 尼鲁巴尔王宫 史诗」 |
| 活动时间 | WCL 报告 startTime |
| 去重 | 同一自然日同一副本同一难度，只创建一个 |
| 关联报告 | 自动挂上 WCL 报告链接 |
| 默认状态 | 草稿/已发布？（建议草稿，团长确认后发布） |

---

## 八、简化看板（首领进度表）

### 8.1 展示位置

已关联 WCL 报告的活动页，新增「📊 团本速览」卡片：

```
┌─────────────────────────────────────────────────────────────┐
│  📊 团本速览 — 10月14日 尼鲁巴尔王宫 史诗                      │
│                                                              │
│  总用时：2小时34分    尝试首领：8/8    击杀：6/8              │
│                                                              │
│  ┌─────────────┬────────┬────────┬────────┐                 │
│  │ 首领         │ 击杀   │ 尝试   │ 最佳进度│                 │
│  ├─────────────┼────────┼────────┼────────┤                 │
│  │ 噬灭者       │ ✅     │ 1      │ 100%   │                 │
│  │ 血缚恐魔     │ ✅     │ 2      │ 100%   │                 │
│  │ 流丝之庭     │ ❌     │ 15     │ 12%    │ ← 开荒中        │
│  └─────────────┴────────┴────────┴────────┘                 │
│                                                              │
│  [ 去 WCL 看详细数据 ]                                        │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 拉取字段

```graphql
query {
  reportData {
    report(code: "XXXXXX") {
      fights {
        name
        kill
        fightPercentage
        startTime
        endTime
      }
    }
  }
}
```

**只拉：首领名、是否击杀、尝试次数、最佳进度。** 不拉玩家个人数据。

---

## 九、解绑与重绑

### 9.1 解绑

- 公会设置页显示「已绑定 WCL 公会：挽丨歌 - 金色平原」
- [ 解绑 ] 按钮
- 解绑后清空 `wcl_*` 字段（保留 `wcl_token` 可选清空）
- 已关联的报告链接保留（不解绑活动）

### 9.2 重绑

- 解绑后可重新绑（同一家或另一家）
- 绑定新公会时，旧公会关联的报告不受影响

---

## 十、权限与安全

### 10.1 权限校验

- 绑定/解绑：仅限会长和管理
- 查看 WCL 关联：全员可见
- 同步报告：会长/管理可操作

### 10.2 安全红线

- WCL token 加密存储（AES 或至少 base64），禁止明文
- OAuth state 必须校验，防 CSRF
- redirect_uri 严格限定为 `api.ddctl.com/auth/wcl/callback`
- 错误处理：WCL API 超时/失败时优雅降级（提示「WCL 服务暂不可用」）

---

## 十一、版本串与文件范围

| 文件 | 改动 |
|------|------|
| `js/app.js` | 公会设置页新增 WCL 绑定 UI + 活动页同步按钮 + 看板 |
| `server.js` | 新增 `/auth/wcl/*` 路由 + `/api/wcl/*` 路由 |
| `sql/??_wcl_guild_binding.sql` | guilds 表新增字段 + 唯一索引 |
| `docs/` | 三份调研报告（已存在） |

---

## 十二、验收标准

### 12.1 方案 A 验收

| # | 检查项 | 通过标准 |
|---|--------|----------|
| 1 | 粘贴链接 | 支持 `guild/id/xxx` 和 `guild/cn/服务器/公会名` 两种格式 |
| 2 | 检测公会 | 点击「检测」后正确显示公会名和服务器 |
| 3 | 绑定落库 | guilds 表 `wcl_guild_id`/`wcl_bind_method='paste'` 写入正确 |
| 4 | 唯一约束 | 同一个 WCL guild ID 不能绑定两个管家公会 |

### 12.2 方案 C 验收

| # | 检查项 | 通过标准 |
|---|--------|----------|
| 1 | OAuth 跳转 | 点击「WCL 登录」正确跳转到 WCL 授权页 |
| 2 | 回调处理 | 授权后正确回到管家，无报错 |
| 3 | 公会列表 | 展示用户 WCL 账号下的公会列表 |
| 4 | 绑定落库 | guilds 表 `wcl_guild_id`/`wcl_bind_method='oauth'`/`wcl_token` 写入正确 |
| 5 | token 刷新 | access_token 过期后自动用 refresh_token 刷新 |

### 12.3 共用功能验收

| # | 检查项 | 通过标准 |
|---|--------|----------|
| 6 | 手动同步 | 点击「同步 WCL 报告」正确返回新报告列表 |
| 7 | 关联提示 | 有新报告时活动页显示关联 banner |
| 8 | 简化看板 | 已关联报告的活动页显示首领进度表 |
| 9 | 自动创建开关 | 开启后新报告自动创建活动（默认草稿） |
| 10 | 解绑 | 解绑后字段清空，已关联报告保留 |

---

## 十三、红线

- 不强制用户绑定 WCL，纯可选功能
- 不改现有注册/登录/auth 体系
- 不拉取玩家个人 DPS/HPS 数据（只拉首领级聚合数据）
- 密钥永不进 git/对话
- 纯文档批（调研报告）无需开核，代码批需版本串 bump + 开核
