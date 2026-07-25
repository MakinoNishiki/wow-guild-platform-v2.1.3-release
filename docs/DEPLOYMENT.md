# 自动部署

## 职责边界

- `.github/workflows/deploy.yml`：`master` 更新或手动触发时，通过受限 SSH 密钥唤醒生产部署。
- `/usr/local/sbin/deploy-wow`：服务器唯一部署入口，负责快进更新、依赖安装、PM2 重启和健康检查。
- PM2：常驻运行 `server.js`，应用名固定为 `wow-guild`。
- Caddy：将 `ddctl.com` 的 HTTP 回源请求转发到 `127.0.0.1:5000`。

## 数据流

```text
master push / workflow_dispatch
  → GitHub Actions
  → SSH（HostKeyAlias 固定校验）
  → authorized_keys 强制执行 deploy-wow
  → git fast-forward
  → PM2 restart
  → HTTP 健康检查
```

## GitHub Secrets

| 名称 | 内容 |
|---|---|
| `DEPLOY_HOST` | 生产服务器地址 |
| `DEPLOY_PORT` | SSH 端口 |
| `DEPLOY_USER` | 受限 SSH 密钥对应用户 |
| `DEPLOY_SSH_KEY` | Actions 专用私钥 |
| `DEPLOY_HOST_KEY` | 服务器 Ed25519 主机公钥 |

密钥不得进入仓库。服务器 `authorized_keys` 必须通过 `command="/usr/local/sbin/deploy-wow",restrict` 限制 Actions 密钥。

## 变更日志

- 2026-07-25：新增 GitHub Actions 生产自动部署入口。
