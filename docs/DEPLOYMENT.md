# 自动部署

## 职责边界

- `.github/workflows/deploy.yml`：`master` 更新或手动触发时，通过受限 SSH 密钥唤醒中国生产部署。
- 中国 `/usr/local/sbin/deploy-wow-cn`：负责快进更新、Docker 容器重启和本机健康检查。
- 中国 Docker：容器名固定为 `wow-guild-cn`，服务 `wow.ddctl.com`。
- 中国 Caddy：将 `wow.ddctl.com` 请求转发到 `wow-guild-cn:5000`。
- 美国服务器退出自动部署链路，仅作为手动回滚备用，不再接收 Actions SSH 请求。

## 数据流

```text
master push / workflow_dispatch
  → GitHub Actions
  → 中国 SSH（HostKeyAlias 固定校验）
  → authorized_keys 强制执行 deploy-wow-cn
  → git fast-forward
  → Docker restart
  → HTTP 健康检查
```

## GitHub Secrets

| 名称 | 内容 |
|---|---|
| `CN_DEPLOY_HOST` | 中国生产服务器地址 |
| `CN_DEPLOY_PORT` | 中国生产服务器 SSH 端口 |
| `CN_DEPLOY_USER` | 中国服务器受限 SSH 密钥对应用户 |
| `CN_DEPLOY_SSH_KEY` | 中国服务器 Actions 专用私钥 |
| `CN_DEPLOY_HOST_KEY` | 中国服务器 Ed25519 主机公钥 |

密钥不得进入仓库。中国服务器 `authorized_keys` 必须通过 `command="sudo -n /usr/local/sbin/deploy-wow-cn",restrict` 限制 Actions 密钥。Actions SSH 密钥与服务器拉取 GitHub 的只读 Deploy Key 必须分离，便于独立吊销。

## 变更日志

- 2026-08-05：美国服务器退出自动部署链路，仅保留中国生产部署。
- 2026-08-05：新增 `wow.ddctl.com` 中国服务器并行自动部署任务。
- 2026-08-04：静态服务改为公开资源白名单，并收紧监听地址、请求体、CORS、Content-Type、响应头、错误输出与 service_role 代理失败关闭边界。
- 2026-08-04：新增无需连接数据库的服务端安全边界回归测试。
- 2026-07-25：新增 GitHub Actions 生产自动部署入口。
