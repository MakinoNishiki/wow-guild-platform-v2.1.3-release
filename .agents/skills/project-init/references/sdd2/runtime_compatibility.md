> **文档名称**: SDD 2.0 运行时兼容规范
> **所属**: SDD 最佳实践体系 — SDD2.0 包
> **用途**: 定义模型无关的能力档位、项目入口、平台适配边界、Skill/Tool/认证迁移规则和兼容性验收。
> **Owner**: project owner
> **最后更新**: 2026-08-02（创建；SDD 2.0 解除 Claude 5 专用限制，改为运行时能力驱动）
> **内容概述**: 能力档位、适配器契约、当前认证状态与实测证据、强编排使用边界、Skill/Tool/认证迁移、验收清单。
> **目录索引**: 能力档位 → 适配器契约 → 当前状态与证据 → 编排边界 → 迁移规则 → 验收 → 导航尾部

---

# SDD 2.0 运行时兼容规范

## 1. 能力档位

SDD 2.0 核心协议与模型厂商、模型名称无关。运行时按能力分档，不按品牌准入。

| 档位 | 最低能力 | 可执行范围 |
|------|---------|-----------|
| 完整执行型 | 能加载项目规则、读写项目文件、识别工作树、调用必要工具、执行授权停等并持久化任务状态 | 完整执行 A/R/B/C、Goal/长任务、归档与 Git 闭环 |
| 辅助执行型 | 能读取项目状态和产出建议，但缺少安全文件操作、工具或持久状态能力 | 可遵循决策与文档规范；执行动作转人工，不宣称完整交付 |
| 对话参考型 | 只能接收人工提供的上下文 | 仅作讨论和评审参考，不承担项目状态权威或自动执行 |

能力变化时允许升档或降档；档位变化不改变项目是否 opt-in 2.0。

## 2. 适配器契约

1. 项目根 `AGENTS.md` 是跨 Agent 的项目级通用入口与 2.0 opt-in 声明权威。
2. `CLAUDE.md`、`[PLATFORM_ADAPTER_PATH]/*.mdc` 等文件是平台适配器，只负责让对应运行时读取 `AGENTS.md`、冷启动文件和 SDD 2.0 权威文档。
3. 适配器不得复制完整元指令，不得放松 A/R/B/C、路径、外发、不可逆操作和 Git Gate。
4. 平台工具名只写在适配器或本文件，不进入 `meta_order_v2.md` 与 `interaction_protocol.md` 的治理内核。
5. 运行时不识别 `AGENTS.md` 时，适配器必须显式要求先读取它；无法做到则降为辅助执行型。

## 3. 当前认证状态

| 运行时 | 项目入口 | 当前状态 | 说明 |
|--------|---------|---------|------|
| Codex | 用户级与项目级 `AGENTS.md` | 完整执行型（基础认证），2026-08-02 本机验证 | 本轮正式认证对象；业务项目专项 Tool/Skill 仍按项目逐项验收 |
| Cursor | `[PLATFORM_ADAPTER_PATH]/*.mdc` → `AGENTS.md` | 适配器已定义，待专项回归 | 不虚报完整实测 |
| Claude Code | `CLAUDE.md` → `AGENTS.md` | legacy 适配器保留，待恢复后回归 | 不再是 2.0 准入前提 |
| 其他 Agent | 项目根 `AGENTS.md` 或等价显式注入 | 未认证 | 按本文件验收后定档 |

### 3.1 Codex 本轮认证证据

- 当前任务实际加载用户级与项目级 `AGENTS.md`，并按 project owner 明确授权使用 `sdd-goal-doc` 与 Goal；未扩展到其他强编排。
- 在 `codex/sdd2-model-agnostic` 独立 worktree 中识别路径、分支、远端和 dirty 状态；既有 WIP 先审计、分主题提交并 push，改造分支未擅自 push/merge。
- `PROGRESS.md` / `BLOCKED.md` 支持中断续跑；A/R/B/C、自决清单和最终 push Gate 已实际执行。
- `project-init`、`sdd-upgrade-v2`、`sdd-goal-doc/code` 已从 Git 权威源受控同步至共享/Codex/legacy 运行时，归一化文本一致。

认证边界：这证明 Codex 的协议、文件、Git、Goal 和恢复核心链；飞书、BMS、浏览器等业务专项 Tool/Skill 不做“一次认证永久通用”的虚报，进入具体项目时仍跑各自最小用例。首个新业务 2.0 项目冷启动回归在 project owner 指定 S3 试点时重复执行并登记。

## 4. Skill 与 Agent 编排边界

- 普通分析、检索、编辑和实现优先使用模型自身推理。
- 未经 project owner 当次明确授权，不自主使用 Subagent、并行 Agent、Goal 大型编排或以下强流程 Skill，也不逐次询问：
  - `using-superpowers`
  - `brainstorming`
  - `create-subagent`
  - `leader` / `sdd-goal-doc` / `sdd-goal-code`
  - `grilling` / `grill-with-docs`
  - `retrospective` / `retrospective-codify`
- project owner 当次点名即视为该任务授权，不延伸到后续任务。
- PDF、Word、Excel、PPT、飞书、BMS 等窄领域 Skill 在任务精确匹配且确有必要时可使用。
- PRD/MRD/原型类 Skill 只在任务明确进入对应工作流时使用，不通过强编排 Skill 提前路由。

## 5. Skill、Tool 与认证迁移

| 类型 | 迁移动作 | 验收 |
|------|---------|------|
| 纯 Markdown 方法论 | 从 `skills_download/` 权威源受控部署 | 能发现、完整读取引用、触发准确 |
| 含平台路径/命令 | 抽离为适配段，不在核心规则硬编码 | 非目标运行时不会调用不存在的命令 |
| 含 Python/Node/浏览器/MCP | 先 dry-run，再做最小真实用例 | 文件范围、退出码、输出和回退可验证 |
| 含飞书/邮箱/生产系统 | 先核验身份、租户和 scope | 外发/生产写入仍为 A 类事前停等 |
| 含凭据 | 只迁移配置方式，不迁移明文值 | token、Cookie、环境变量值不进入 Git/Skill/日志 |

受控部署固定四步：更新权威源 → 逐项 diff → 部署到目标运行时 → 源与运行时一致性自检。禁止整目录盲目覆盖。

## 6. 完整执行型验收清单

- [ ] 空白会话能从 `AGENTS.md + agent_quickstart.md + task_registry.md` 正确报告项目、阶段、当前任务与异常。
- [ ] 能识别正确项目根、分支和 worktree，不跨树写入。
- [ ] A 类会停等，R 类登记后继续，B 类有自决清单，C 类不制造额外记录。
- [ ] 未获授权时不会调用强编排 Skill、Subagent 或并行 Agent。
- [ ] 对外动作、删除覆盖、生产写入和 push 冲突处置会停等。
- [ ] 最小文件修改、回退、Git diff 和断点续跑可复现。
- [ ] 所需窄领域 Skill 与 Tool 通过各自最小用例。
- [ ] 认证信息未进入项目文件或版本库。

---

## 导航尾部

| 如果你需要了解… | 查阅文档 | 定位 |
|--------------|---------|------|
| SDD 2.0 定位与 opt-in | `README.md` | §1–§5 |
| Git 优先恢复 | `recovery_protocol.md` | 全文 |
| A/R/B/C 交互规则 | `interaction_protocol.md` | §1–§9 |
| 元指令 v2 | `meta_order_v2.md` | §1–§3 |
