> **模板说明**：SDD 2.0 新项目通用 `AGENTS.md` 模板。`{...}` 为占位符，创建时替换；本说明块创建时删除。

---

> **文档名称**: {项目名} 通用 Agent 项目基线 (AGENTS.md)
> **所属项目**: {项目名}
> **用途**: 项目级通用 Agent 入口；承载 SDD 2.0 opt-in、项目定位、授权备注、仓库陷阱与条件路由。
> **Owner**: project owner
> **最后更新**: {YYYY-MM-DD}（创建）
> **内容概述**: SDD 2.0 声明、项目定位、启动顺序、仓库陷阱、授权与条件路由。
> **目录索引**: SDD 声明 → 项目定位 → 启动顺序 → 仓库陷阱 → 授权备注 → 条件路由 → 导航尾部

---

# {项目名}

**SDD 版本**: 2.0（协议见 `SDD/references/sdd2/`，元指令以 `meta_order_v2.md` 为准）
**冲突覆盖**: 本项目内，凡用户级基线、平台适配器或 1.0 条款与 2.0 协议冲突，以 `references/sdd2/` 治理内核为准；project owner 当次明确指令优先。

## 项目定位

{一段话：这个项目做什么、当前目标、非目标}

## 启动顺序

1. 确认当前项目根、分支和 worktree。
2. 读取 `agent_quickstart.md` + `task_registry.md`。
3. 三行汇报项目阶段、进行中任务、异常项；首条消息有明确任务则继续执行，无任务则等待。
4. 发现状态异常时按 `SDD/references/sdd2/recovery_protocol.md` 恢复。

## 仓库陷阱

> 只写看现场不容易自行发现的坑。

- {例：某目录为外部同步目录，禁止直接修改}

## 授权备注

- project owner 点名保留的 A 类事项：{无 / 列出}
- 紧急模式默认：否（任务级声明“求一次过”时启用）
- 强编排 Skill / Subagent：仅 project owner 当次明确授权时使用，默认不询问。

## 条件路由

| 触发场景 | 参照 |
|---------|------|
| 授权归类 / 交互节奏 | `SDD/references/sdd2/interaction_protocol.md` |
| 运行时能力 / Skill / Tool / 认证 | `SDD/references/sdd2/runtime_compatibility.md` |
| Git 或状态恢复 | `SDD/references/sdd2/recovery_protocol.md` |
| {项目专属条件路由，无则删本行} | {} |

---

## 导航尾部

| 如果你需要了解… | 查阅文档 | 定位 |
|--------------|---------|------|
| 项目阶段与当前焦点 | `agent_quickstart.md` | 全文 |
| 进行中任务与 R 待审 | `task_registry.md` | 全文 |
| A 类决策 | `decision_log.md` / `important_conclusion.md` | 全文 |
| SDD 2.0 元指令 | `SDD/references/sdd2/meta_order_v2.md` | §1–§3 |
