> **模板说明**：SDD 2.0 新项目 Claude Code legacy adapter 模板。`{...}` 为占位符；创建时替换并删除本说明块。通用项目规则必须写在同级 `AGENTS.md`，本文件不维护副本。

---

> **文档名称**: {项目名} Claude Code Legacy Adapter (CLAUDE.md)
> **所属项目**: {项目名}
> **用途**: 在 Claude Code 运行时加载项目根 `AGENTS.md` 与 SDD 2.0 权威文件；不承载通用规则副本。
> **Owner**: project owner
> **最后更新**: {YYYY-MM-DD}（创建）
> **内容概述**: 通用入口、SDD 2.0 声明、Claude Code 专属补充。
> **目录索引**: 通用入口 → SDD 声明 → Claude 专属补充 → 导航尾部

---

# {项目名} Claude Code Legacy Adapter

## 通用入口

进入项目后的第一步是完整读取同级 `AGENTS.md`；项目定位、启动顺序、仓库陷阱、授权和条件路由均以该文件为准。本文件不得复制这些内容。

## SDD 声明

**SDD 版本**: 2.0（通用声明权威见同级 `AGENTS.md`；协议见 `SDD/references/sdd2/`）
**冲突覆盖**: 平台适配内容与 `AGENTS.md` 或 SDD 2.0 治理内核冲突时，以后两者为准；project owner 当次明确指令优先。

## Claude Code 专属补充

- 用户级 Claude Code 配置只提供平台能力，不覆盖项目治理规则。
- 会话恢复优先按 `SDD/references/sdd2/recovery_protocol.md` 读取 Git 与状态文档，不依赖平台会话列表。
- {无专属补充 / 列出必须保留的平台差异}

---

## 导航尾部

| 如果你需要了解… | 查阅文档 | 定位 |
|--------------|---------|------|
| 项目通用规则 | `AGENTS.md` | 全文 |
| 当前任务 | `task_registry.md` | 全文 |
| SDD 2.0 运行时规范 | `SDD/references/sdd2/runtime_compatibility.md` | 全文 |
