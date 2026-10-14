# 任务书 #70 补充：SSH 执行 sql/41 指令

**执行人**：Code（接收 SSH 凭据后直连自建服务器）
**执行内容**：sql/41 DDL 在生产自建实例上落地
**纪律**：SSH 凭据仅本次使用，零留痕

---

## 一、SSH 安全纪律（强制）

1. **凭据不进任何文件**：SSH 密码/key 不写入 .env、不写入脚本、不写入任何本地文件
2. **终端历史禁用**：执行前 `unset HISTFILE` 或 `export HISTSIZE=0`，防止 bash history 记录凭据
3. **零打印**：脚本里不写 `console.log(password)`，不打印连接串
4. **执行完立即销毁**：DDL 跑完后退出 SSH，清除终端历史，凭据从内存释放
5. **不进 git**：任何包含凭据的文件（即使临时）不 add、不 commit

---

## 二、执行步骤

### 步骤 1：SSH 登录自建服务器

```bash
# 凭据由用户私聊提供，本文件不写入具体值
ssh <user>@101.35.124.22
# 或使用 key：ssh -i <temp_key> <user>@101.35.124.22
```

### 步骤 2：禁用终端历史

```bash
unset HISTFILE
export HISTSIZE=0
```

### 步骤 3：进入 Postgres 执行 sql/41

```bash
# 方式一：如果服务器上有 psql 且能直接连
psql -h localhost -U postgres -d postgres -p 5432

# 方式二：如果通过 docker
# docker exec -it <supabase_postgres_container> psql -U postgres -d postgres
```

进入 psql 后执行：

```sql
-- 增量 SQL 41：任务书 #70 WCL 公会绑定
-- 幂等，可重复执行

ALTER TABLE guilds ADD COLUMN IF NOT EXISTS wcl_guild_id BIGINT;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS wcl_guild_name TEXT;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS wcl_server_name TEXT;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS wcl_region TEXT DEFAULT 'cn';
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS wcl_bind_method TEXT;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS wcl_token JSONB;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS wcl_bound_at TIMESTAMPTZ;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS wcl_auto_create_event BOOLEAN DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_guilds_wcl_guild_id
  ON guilds(wcl_guild_id) WHERE wcl_guild_id IS NOT NULL;

REVOKE SELECT (wcl_token) ON guilds FROM authenticated, anon;

NOTIFY pgrst, 'reload schema';

-- 确认输出
\d guilds
```

### 步骤 4：退出 psql 和 SSH

```sql
\q
```

```bash
exit
```

### 步骤 5：清除终端历史

```bash
history -c
history -w
```

---

## 三、执行后验证（Code 用 PostgREST 测）

SSH 退出后，用你本地的 service_role key 调生产 REST：

```bash
# 验证列可见
curl -s "https://101.35.124.22:8443/rest/v1/guilds?select=id,wcl_guild_id&limit=1" \
  -H "Authorization: Bearer <service_role_key>" \
  -H "apikey: <anon_key>"

# 期望返回 200 + JSON（不再是 42703）

# 验证 wcl_token 对 anon 不可见
curl -s "https://101.35.124.22:8443/rest/v1/guilds?select=wcl_token&limit=1" \
  -H "Authorization: Bearer <anon_key>"

# 期望返回 400 或 42703（列不可见 = REVOKE 生效）
```

---

## 四、验证通过后补跑 B/C/D/E 组

REST 确认列可见后，立即执行：

- **B 组**：真实 WCL 调用 roundtrip（绑定 → 同步 → 看板 → 解绑）
- **C 组**：REVOKE 加固复核（anon 访问 wcl_token 被拒）
- **D 组**：真浏览器主链路实测
- **E 组**：修改报告补实测证据

---

## 五、红线重申

- SSH 凭据**仅本次使用**，执行完立即销毁
- 不写入任何文件（包括 .env、脚本、笔记）
- 不打印凭据到终端输出
- 不进入 git 历史
- DDL 只加列不改存量值，风险可控
