> **文档名称**: SDD 2.0 使用指南 (Usage Guide)
> **所属**: SDD 最佳实践体系 — SDD2.0 包
> **用途**: 供使用者快速上手模型无关的 SDD 2.0：目标驱动、项目 opt-in、运行时定档、安装与配套 Skill。
> **Owner**: project owner
> **最后更新**: 2026-08-02（改为模型无关使用方式；新增 AGENTS 通用入口、运行时能力与 Git 恢复）。2026-07-28（创建）
> **内容概述**: 解决的问题、目标驱动三拍、分级授权、安装、运行时适配、配套技能和示例。
> **目录索引**: 定位 → 三拍 → 分级授权 → 安装 → 运行时适配 → 技能 → 示例 → 导航尾部

---

# SDD 2.0 使用指南

## 1. 这是什么

SDD 是一套用 AI 把一句话需求推进为可评审规格与可恢复项目状态的工作规范。2.0 解决确认过载和文档过重：目标一次说清，AI 连续推进，人只裁定关键业务决策并验收结构性产物。

## 2. 目标驱动三拍

```
定义目标：目标 + 完成判据 + 不动项
→ 连续执行：B/C 自决，R 登记后继续，A 攒批停等
→ 人工验收：R 清零 + 抽查自决清单 + 处理 A 类
```

## 3. 分级授权

| 级 | 内容 | 行为 |
|---|------|------|
| A | 业务规则、流程、数据口径、范围、外发和不可逆动作 | 事前停等 |
| R | 接口/页面划分、正向案例主干等结构产物 | 定稿登记后继续；清零才交付 |
| B | 字段、文案、常规边界 | 按规范自决并留清单 |
| C | 格式、中间文件、工具选择 | 自决，不额外打扰 |

## 4. 安装与启用

前提：获得 SDD 仓库，并有一个能读取项目文件的 Agent 运行时。

1. **新项目**：用 `templates/` 五个模板建立 `AGENTS.md`、平台 adapter、quickstart、task_registry、decision_log。
2. **已有项目**：project owner 明确批准后，使用 `sdd-upgrade-v2` 或按 `references/sdd2/migration_guide.md` 手动切换。
3. **运行时定档**：按 `references/sdd2/runtime_compatibility.md` 判断完整执行型/辅助执行型/对话参考型。
4. **受控部署 Skill**：从 `skills_download/` 权威源逐项 diff、部署和验证，不整目录覆盖。

## 5. 运行时与恢复

- 项目根 `AGENTS.md` 是通用入口；平台专属文件只负责映射。
- 正常会话读取 quickstart + task_registry。
- 更换 Agent、设备或状态异常时，按 `recovery_protocol.md` 比较本地/远端 Git 与状态文件；会话历史只兜底。
- 平台没有 Goal 功能时，任务书仍可在普通会话执行，并用 task_registry 或 PROGRESS/BLOCKED 断点续跑。

## 6. 配套 Skill

| 场景 | Skill | 说明 |
|------|-------|------|
| 文档型长任务 | `sdd-goal-doc` | 生成 A/R/B/C 任务书；仅 project owner 明确授权时使用 |
| 代码型长任务 | `sdd-goal-code` | 生成代码任务书；仅 project owner 明确授权时使用 |
| 存量项目 opt-in | `sdd-upgrade-v2` | 按迁移指引升级指定项目 |
| SDD 情境导航 | `sdd-router` | 用户手动调用 |
| PRD 主链 | `prd-prep` → `prd-write` 或 `prd-incremental-on-asis` | 任务明确进入 PRD 工作流时使用 |

## 7. 示例

1. project owner 明确说：“使用 sdd-goal-doc，为收货单 PRD 定义任务书；范围只含创建和审核。”
2. Agent 盘点 Git 和现状文档，只询问会改变任务书的 A 类事项。
3. 有 Goal 模式则由该模式持续执行；没有则在普通会话运行，进度写 task_registry 或 PROGRESS/BLOCKED。
4. 交付前 project owner 过目 R 待审区并抽查自决清单。

---

## 导航尾部

| 如果你需要了解… | 查阅文档 | 定位 |
|--------------|---------|------|
| opt-in 与双轨关系 | `README.md` | §4–§6 |
| 分级授权完整判据 | `interaction_protocol.md` | §1–§9 |
| 运行时能力和 Skill/Tool | `references/sdd2/runtime_compatibility.md` | 全文 |
| Git 优先恢复 | `recovery_protocol.md` | 全文 |
| 已有项目升级 | `references/sdd2/migration_guide.md` | 全文 |
