# 自动部署

## 职责边界

- `.github/workflows/deploy.yml`：`master` 更新或手动触发时，并行唤醒美国与中国生产部署。
- 美国 `/usr/local/sbin/deploy-wow`：负责快进更新、依赖安装、PM2 重启和健康检查。
- 中国 `/usr/local/sbin/deploy-wow-cn`：负责快进更新、Docker 容器重启和本机健康检查。
- 美国 PM2：常驻运行 `server.js`，应用名固定为 `wow-guild`，服务 `ddctl.com`。
- 中国 Docker：容器名固定为 `wow-guild-cn`，服务 `wow.ddctl.com`。
- 两地 Caddy：只把各自域名的请求转发到对应 Node.js 服务。

## 数据流

```text
master push / workflow_dispatch
  → GitHub Actions
     ├─ 美国 SSH（HostKeyAlias 固定校验）
     │  → authorized_keys 强制执行 deploy-wow
     │  → git fast-forward → PM2 restart → 健康检查
     └─ 中国 SSH（HostKeyAlias 固定校验）
        → authorized_keys 强制执行 deploy-wow-cn
        → git fast-forward → Docker restart → 健康检查
```

## GitHub Secrets

| 名称 | 内容 |
|---|---|
| `DEPLOY_HOST` | 生产服务器地址 |
| `DEPLOY_PORT` | SSH 端口 |
| `DEPLOY_USER` | 受限 SSH 密钥对应用户 |
| `DEPLOY_SSH_KEY` | Actions 专用私钥 |
| `DEPLOY_HOST_KEY` | 服务器 Ed25519 主机公钥 |
| `CN_DEPLOY_HOST` | 中国生产服务器地址 |
| `CN_DEPLOY_PORT` | 中国生产服务器 SSH 端口 |
| `CN_DEPLOY_USER` | 中国服务器受限 SSH 密钥对应用户 |
| `CN_DEPLOY_SSH_KEY` | 中国服务器 Actions 专用私钥 |
| `CN_DEPLOY_HOST_KEY` | 中国服务器 Ed25519 主机公钥 |

密钥不得进入仓库。服务器 `authorized_keys` 必须通过 `command="/usr/local/sbin/deploy-wow",restrict` 限制 Actions 密钥。

中国服务器对应使用 `command="/usr/local/sbin/deploy-wow-cn",restrict`。Actions SSH 密钥与服务器拉取 GitHub 的只读 Deploy Key 必须分离，便于独立吊销。

## 变更日志

- 2026-08-05：新增 `wow.ddctl.com` 中国服务器并行自动部署任务。
- 2026-08-04：静态服务改为公开资源白名单，并收紧监听地址、请求体、CORS、Content-Type、响应头、错误输出与 service_role 代理失败关闭边界。
- 2026-08-04：新增无需连接数据库的服务端安全边界回归测试。
- 2026-07-25：新增 GitHub Actions 生产自动部署入口。
