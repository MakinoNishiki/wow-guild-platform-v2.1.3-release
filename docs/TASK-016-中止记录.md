# TASK-016 中止记录（前端迁移至国内服务器）

> 编号：TASK-016 / REQ-065　状态：**已取消（2026-08-02 运营拍板）**
> 取消原因：宿主机 8080 端口被朋友 yunting-backend 容器占用（安全组放行≠端口可用），为避免朋友侧任何变更，前端继续由美国服务器托管，国内机仅承担后端 API（`https://101.35.124.22:8443`，#15 已上线）。

## 一、中止前已完成的工作（全部保留备查）

1. **前端整包核验（S1 完成）**：index.html / js / css / assets 全量 31 文件；grep 无旧项目 ref（wbsulgzzrkumcdkiqhkw）、无 supabase.co 业务配置（唯一命中为 Supabase SDK 库内部 `*.supabase.co` 通配字符串，无害）；**Supabase JS SDK 由 jsdelivr CDN 改为本地内嵌** `assets/vendor/supabase-js-2.js`（国内访问 jsdelivr 不稳，此改动对美国站同样有益，index.html 仅改 script src 一行）。
2. **服务器侧部署（已停用但文件留存）**：
   - `/opt/frontend/site/` 整包已部署（保留，今后若重启 #16 可直接复用）；
   - Caddy `:8080` 站点配置已写好并实测通过，停用前存档于 `/opt/supabase/volumes/proxy/caddy/Caddyfile.8080.bak`（静态站点 + `/api/*` 反代 server.js + gzip + 缓存头 + try_files 回退）；
   - `wow-frontend-api`（server.js 容器，承接 /api）曾上线验证，中止后已停止并移除容器；`/opt/frontend/server.js`、`.env`（600）文件保留；
   - 当前 Caddy 已恢复 8443-only 形态，8443 后端全程零影响；yunting-backend 未做任何改动。
3. **真浏览器主链路实测（通过 SSH 隧道绕开端口占用，playwright chromium）**：
   - 首页打开+登录表单渲染 ✅；注册→建公会（`/api/db` 写代理全链）✅；老账号登录→主应用 ✅；
   - 网络审计：请求仅页面源 + `101.35.124.22:8443`，**零 supabase.co、零 4xx/5xx、零 JS 错误**；
   - **冒烟数据已清理**：`ksmoke%@163.com` 用户与「冒烟公会%」全链路删除，复核 `auth.users=10`、公会 0 残留（2026-08-02 23:35 实测）。

## 二、交付物

- **前端整包 zip**：`C:\Users\56424\Desktop\wow-guild-frontend-v3.2.0-domestic-20260802.zip`（31 文件，即上述已核验版本：cloud.js 经 `/api/supabase-config` 注入指向 `https://101.35.124.22:8443`，无 supabase.co，SDK 已内嵌）——运营按照旧流程发布至美国服务器。

## 三、今后前端更新流程（不变）

前端更新一律发美国服务器（ddctl.com 现有流程）；国内服务器只承载后端 API + 数据库 + 备份。若未来重启 #16：先与朋友确认 8080（或改用其他已放行端口），`/opt/frontend/site` 与 `Caddyfile.8080.bak` 可直接复用。

## 四、仓库侧改动（随本次保留）

- `index.html`：Supabase SDK 引用 CDN → 本地 `assets/vendor/supabase-js-2.js`（一行）；
- `assets/vendor/supabase-js-2.js`：新增（supabase-js@2 官方 UMD，210KB）；
- `js/app.js`：更新日志补录（REQ-035 迁移条目 + 本条 SDK 内嵌条目）；
- 未提交 git（验收纪律）。
