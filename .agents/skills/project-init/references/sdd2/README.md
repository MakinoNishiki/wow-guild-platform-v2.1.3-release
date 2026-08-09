> **文档名称**: SDD 2.0 入口说明 (README)
> **所属**: SDD 最佳实践体系 — SDD2.0 包
> **用途**: SDD 第二代交互协议与记忆体系入口；说明模型无关原则、项目 opt-in、运行时能力分级、包内容和双轨关系。
> **Owner**: project owner
> **最后更新**: 2026-08-03（SDD 母项目经 project owner 单独裁定转正到2.0；1.0根文件冻结为历史）。2026-08-02（模型无关化、通用AGENTS入口与Git恢复）。2026-07-27（S1创建）
> **内容概述**: 定位、模型无关原则、包内容、项目级 opt-in、能力条件、母项目转正状态、1.0历史关系和路径原则。
> **目录索引**: 定位 → 模型无关原则 → 包内容 → opt-in → 能力条件 → 母项目与1.0历史 → 路径原则 → 导航尾部

---

# SDD 2.0

## 1. 定位

SDD 2.0 是第二代**交互协议 + 记忆体系**。它解决两个长期问题：

| 痛点 | 1.0 现状 | 2.0 方案 |
|------|---------|---------|
| 交互密度低 | 每步授权、全量上报 | A/R/B/C 四级授权 |
| 记忆负重高 | discussion_record / quickstart / handoff 三连改 | task_registry + decision_log，handoff 降为低频交接 |

操作原则：治理内核不动、授权颗粒度上调、补偿机制退役、冗余降级。第零原则见 `interaction_protocol.md §0`。

## 2. 模型无关原则

SDD 2.0 不以模型厂商或模型名称作为准入条件。运行时按能力分为完整执行型、辅助执行型、对话参考型；只有通过对应验收，才可宣称完整执行 2.0。详见 `references/sdd2/runtime_compatibility.md`。

- 治理内核：A/R/B/C、任务基线、路径、外发、不可逆操作、Git 与文档闭环。
- 平台适配：指令入口、工具名、Skill 安装路径、会话与认证方式。
- 平台适配器不得修改或放松治理内核。

## 3. 包内容

| 文件 | 用途 |
|------|------|
| `meta_order_v2.md` | 元指令 v2 + 冲突裁定 + 启动协议 |
| `interaction_protocol.md` | A/R/B/C、第零原则、漂移补偿、交互节奏 |
| `references/sdd2/runtime_compatibility.md` | 能力档位、平台适配、Skill/Tool/认证与验收 |
| `recovery_protocol.md` | Git 优先恢复、会话兜底边界 |
| `templates/` | 新项目五模板：AGENTS / CLAUDE legacy adapter / quickstart / task_registry / decision_log |
| `references/sdd2/migration_guide.md` | 存量项目 opt-in 与回退 |
| `usage_guide.md` | 快速上手与配套 Skill |

## 4. 启用方式（项目级 opt-in）

项目根 `AGENTS.md` 是通用声明权威，加入：

```markdown
**SDD 版本**: 2.0（协议见 `SDD/references/sdd2/`，元指令以 `meta_order_v2.md` 为准）
**冲突覆盖**: 本项目内，凡用户级基线、平台适配器或 1.0 条款与 2.0 协议冲突，以 `references/sdd2/` 治理内核为准；project owner 当次明确指令优先。
```

平台不直接加载 `AGENTS.md` 时，由 `CLAUDE.md`、`[PLATFORM_ADAPTER_PATH]/*.mdc` 或等价适配器显式要求先读取它。无声明 = 默认 1.0。存量项目切换必须由 project owner 逐项目批准。

## 5. 适用条件

- 项目已由 project owner 明确 opt-in。
- 运行时能定位 SDD 权威包并确认版本。
- 完整执行必须通过 `references/sdd2/runtime_compatibility.md §6`；不足时按能力降档，不阻止读取和参考协议。
- SDD 母项目已由 project owner 于 2026-08-03 单独裁定转正；其项目根 `AGENTS.md` 是生效声明，运行时按完整执行型清单验收。

## 6. 母项目与 1.0 历史

- SDD 母项目已结束1.0/2.0双轨，现行治理权威为本包；根 `meta_order.md` 与 `discussion_record.md` 冻结保留用于历史审计。
- 项目是否升级只看本项目 opt-in，不跟随当前使用的 Agent 自动变化。
- 回退时移除项目 2.0 声明和平台适配声明；task_registry / decision_log 保留，不删除历史。
- 存量子项目仍须由 project owner 明确批准；可以逐项目批准，也可以像2026-08-03一样对列明清单做一次批量批准。

## 7. 路径原则

包内及模板内引用一律使用相对路径：锚点 = SDD 仓库根或项目根。运行时专属绝对路径只能出现在本机配置或部署记录，不进入核心协议。

---

## 导航尾部

| 如果你需要了解… | 查阅文档 | 定位 |
|--------------|---------|------|
| 元指令与启动协议 | `meta_order_v2.md` | §1–§3 |
| 四级授权 | `interaction_protocol.md` | §0–§9 |
| 运行时能力与适配 | `references/sdd2/runtime_compatibility.md` | 全文 |
| Git 优先恢复 | `recovery_protocol.md` | 全文 |
| 存量项目切换 | `references/sdd2/migration_guide.md` | 全文 |
