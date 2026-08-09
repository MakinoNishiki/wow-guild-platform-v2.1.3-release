> **文档名称**: project-init 1.0 Legacy 参考文档
> **所属**: SDD project-init Skill
> **用途**: 保留 SDD 1.0 文件模板与初始化质量检查清单；不作为 SDD 2.0 入口。
> **Owner**: project owner
> **最后更新**: 2026-08-02（明确全文件为 1.0 legacy；2.0 改用五模板与通用 AGENTS）
> **内容概述**: 1.0 legacy 模板、占位符、初始化步骤和质量检查。
> **目录索引**: 适用边界 → 1.0 模板 → 初始化步骤 → 质量检查 → 导航尾部

---

# project-init 1.0 Legacy 参考文档（文件模板 + 质量检查清单）

> **适用边界（2026-08-02）**：本文档只保留 SDD 1.0 legacy 模板与历史结构。2.0 项目必须使用 `references/sdd2/templates/` 五模板和 `references/sdd2/runtime_compatibility.md`，不得从本文档拼装。所有出现的 Claude Code 路径和完整 CLAUDE.md 均是 1.0 legacy 兼容内容，不构成 2.0 的平台准入条件。
>
> 本文档供 Agent 初始化 1.0 项目时参照。所有模板中的 `[占位符]` 均需替换为实际内容。
> 占位符说明：
> - `[项目名]`：英文项目名（如 excel_automation）
> - `[项目中文名]`：项目的中文描述性名称（如 销售报表自动化）
> - `[一句话描述]`：project owner 提供的项目描述
> - `[日期]`：今日日期，格式 YYYY-MM-DD
> - `[起始阶段]`：需求探索 / MRD 生成 / PRD 生成
>
> **路径锚点（不写死绝对路径）**：
> - `SDD/`：SDD 仓库根锚点，各设备按本机实际挂载点解析（当前工作机 = `[SDD_ROOT]`）。
> - `{GITLOCAL_ROOT}/`：本机项目仓库根，当前默认 `[PROJECTS_ROOT]`，跨设备以本机实际挂载点为准。
>
> **1.0 模板类型（2026-06-25 混合化）**：
> - **引用型**（§2 CLAUDE.md / §3 agent_handoff.md / §7 agent_quickstart.md）：结构基准取自 SDD 当前活样板，从根上避免模板漂移；SDD 不可达时回退下方兜底骨架并显式告警。
> - **内嵌型**（§1 / §4 / §5 / §6 / §9）：结构稳定的小文件，模板直接内嵌。

---

## §1 .gitignore 模板（内嵌型）

```gitignore
# OS
.DS_Store
Thumbs.db
desktop.ini

# Editor
.vscode/settings.json
*.swp
*.swo

# Temp
*.tmp
*.bak
~$*

# Python（如项目涉及脚本）
__pycache__/
*.pyc
*.pyo
.env

# 保留 .cursor/ 下的 rules（项目规则需要版本管理）
# 不忽略 [PLATFORM_ADAPTER_PATH]/
```

---

## §2 CLAUDE.md 模板（1.0 Legacy Adapter）— 引用型 + 兜底

**生成方式（引用型，优先）**：本文件的**结构基准 = SDD 当前活样板**。实例化时：
1. 读取 `SDD/CLAUDE.md`，以其 header 五字段、tail 导航格式、章节骨架为**结构标准**；
2. 套用到新项目：保留结构，仅替换项目专属内容（项目名 / 定位 / 当前状态 / 起始阶段）；
3. **不照搬 SDD 自身的项目专属内容**（SDD 的定位与状态是 SDD 项目自己的）。

**兜底**：若 `SDD/` 不可达，按下方最小骨架生成，并在文件顶部 + 向 project owner 的报告中显式告警：`⚠️ 兜底模板生成，可能与当前 SDD 文档标准漂移，请对齐 meta_order / header-tail 规范`。

<details><summary>兜底最小骨架（SDD 不可达时使用）</summary>

```markdown
> **文档名称**: [项目中文名] 项目 Claude Code 基线 (Project CLAUDE.md)
> **所属项目**: [项目中文名]
> **用途**: Claude Code 在本项目目录下自动加载的项目基线。补充用户级 `the project governance entry` 中未覆盖的项目专属上下文。
> **Owner**: project owner
> **最后更新**: [日期]
> **内容概述**: 项目定位、当前状态、核心文档优先阅读顺序（含 agent_quickstart.md）、模型切换检测。

---

# [项目中文名]

> 元指令体系（以 meta_order.md 为准）、project owner 沟通方式、Agent 协作要点见用户级基线：`the project governance entry`

## 项目定位

[一句话描述]

- **与 SDD 的关系**：本项目过程中积累的实践可反哺 SDD 方法论（副产品，非目标）

## 当前状态（[日期]）

| 事项 | 状态 |
|------|------|
| 项目初始化 | ✅ 已完成 |
| [起始阶段] | ⏳ 待启动 |

## 核心文档优先阅读顺序

| 优先级 | 文档 | 用途 |
|--------|------|------|
| 🚀 | `agent_quickstart.md` | **冷启动入口**（~50行，新 Agent 优先读此）|
| 1️⃣ | `Skill_Guide.md` | Skill 资产索引 |
| 2️⃣ | `agent_handoff.md` | 项目全貌、完整元指令（见 meta_order.md）、下一步重点 |
| 3️⃣ | `important_conclusion.md` | 关键设计决策（随项目推进填入）|
| 📁 | `discussion_record.md` | 审计轨迹（按需查阅，保留最近 5 个日期段）|

## 模型切换检测

如发现对话风格断点，请主动读取 `model_switch_checkpoint.md` 和 `agent_handoff.md`，并向用户确认是否发生了模型切换。

## 导航尾部

| 如果你需要了解… | 查阅文档 | 定位 |
|--------------|---------|------|
| 完整元指令和 Agent 协作规范 | `the project governance entry` | 全文 |
| 项目全貌和下一步重点 | `agent_handoff.md` | §7 当前状态 |
| 已确认的设计决策 | `important_conclusion.md` | 全文 |
| 生命周期阶段导航 | `SDD/LIFECYCLE_ROUTER.md` | §3 阶段路由表 |
```

</details>

---

## §3 agent_handoff.md 模板 — 引用型 + 兜底

**生成方式（引用型，优先）**：结构基准 = `SDD/agent_handoff.md`。读取其当前 header、目录骨架、各节标题与 tail 格式作为标准，套用到新项目（替换项目专属内容，不照搬 SDD 自身状态）。元指令体系一律**以本项目 `meta_order.md` 为权威，不在 handoff 内重复条文**。

**兜底**：若 `SDD/` 不可达，按下方最小骨架生成并显式告警（同 §2）。

<details><summary>兜底最小骨架（SDD 不可达时使用）</summary>

```markdown
> **文档名称**: Agent 交接文档 (Handoff Document)
> **所属项目**: [项目中文名]
> **用途**: 新 Agent 的唯一入口文档。阅读本文档后应能完全接续项目，无需额外上下文。
> **Owner**: project owner
> **最后更新**: [日期]
> **内容概述**: 项目定位、元指令体系（以 meta_order.md 为准）、目录结构、模型切换协议、当前状态、下一步重点。

---

# Agent 交接文档 (Handoff Document)

> 项目路径: {GITLOCAL_ROOT}/[项目名]
> 目标: 使新 Agent 在无其他上下文的情况下，以最小偏差接续本项目全部工作。

---

## 目录

1. [项目定位](#1-项目定位)
2. [元指令体系](#2-元指令体系)
3. [目录结构](#3-目录结构)
4. [模型切换协议](#4-模型切换协议)
5. [当前项目状态](#5-当前项目状态)
6. [SDD 知识库索引](#6-sdd-知识库索引)

---

## 1. 项目定位

[一句话描述]

- **与 SDD 的关系**：本项目过程中积累的实践可反哺 SDD 方法论（副产品，非目标）

---

## 2. 元指令体系

完整继承自用户级基线，以本项目根目录下的 `meta_order.md` 为权威来源，不在本文档重复。

> 新 Agent 需了解完整元指令时，直接读取 `meta_order.md`。冲突处理见 `meta_order.md §2`。

---

## 3. 目录结构

```
[项目名]/
├── CLAUDE.md                     # 项目 Claude Code 基线（自动加载）
├── agent_quickstart.md           # 跨工具冷启动卡（~50行，含SDD路径索引）
├── agent_handoff.md              # 完整交接文档（含SDD路径索引节）
├── Skill_Guide.md                # 从SDD原文复制（可追加项目级Skill）
├── meta_order.md                 # 从SDD原文复制（元指令权威，不可手动改条数）
├── LIFECYCLE_ROUTER.md           # 从SDD原文复制（阶段路由）
├── important_conclusion.md       # 关键设计决策记录
├── discussion_record.md          # 讨论记录（索引制，按需查阅）
├── model_switch_checkpoint.md    # 模型切换检查点（切换时生成）
├── .gitignore
├── AGENTS.md                     # Codex 支持（可选）
├── [PLATFORM_ADAPTER_PATH]/[项目名].mdc    # 平台 adapter（仅当占位符已映射到运行时自动发现目录）
└── reference/                    # SDD 副本（仅供参考）
```

---

## 4. 模型切换协议

模型切换协议的权威来源是 SDD 项目文档 `SDD/mode_switching_protocol.md`（注：模型切换/模式切换规则按 SDD 裁定**走项目文档，不做成 Skill**）。

**信任链**：`model_switch_checkpoint.md`（实时快照）> `agent_handoff.md`（定期更新）> 项目规则（稳定基线）

---

## 5. 当前项目状态

| 事项 | 状态 |
|------|------|
| 项目初始化 | ✅ 已完成（[日期]）|
| 元指令体系（见 meta_order.md） | ✅ 完整继承 |
| [起始阶段] | ⏳ 待启动 |

### 下一步重点

1. 使用 `project-scope-breakdown` Skill 开始需求探索（如从需求探索阶段启动）
2. 参考 `LIFECYCLE_ROUTER.md` 确认当前阶段的必读文档和使用 Skill

---

## 6. SDD 知识库索引

> SDD 锚点：`SDD/`（按本机挂载点解析；当前工作机 = `[SDD_ROOT]`）
> ⚠️ 若锚点不可达，在会话中反馈并要求 project owner 人工指定；不指定则标记告警"可能与 SDD 规范偏离"。

| 资源 | 锚点路径 | 说明 |
|------|---------|------|
| SDD_tools/ | `SDD/SDD_tools/` | Tool 文件 |
| skills_download/ | `[SDD_ROOT]/skills_download/` | 云端 Skill 源文件 |
| Skill_Guide.md（权威） | `SDD/Skill_Guide.md` | 全量 Skill 索引 |
| meta_order.md（权威） | `SDD/meta_order.md` | 元指令权威 |

> 本项目的 meta_order.md / Skill_Guide.md / LIFECYCLE_ROUTER.md 均从上述锚点原文复制。需获取最新版时从 SDD 重新拉取覆盖。

---

## 导航尾部

| 如果你需要了解… | 查阅文档 | 定位 |
|--------------|---------|------|
| 完整元指令和冲突裁定规则 | `meta_order.md` | §1-§2 |
| 生命周期阶段路由和相位门 | `LIFECYCLE_ROUTER.md` | §3、§4 |
| 已确认的设计决策 | `important_conclusion.md` | 全文 |
| 完整讨论过程 | `discussion_record.md` | 按日期段查 |
| 模型切换/模式切换协议 | `SDD/mode_switching_protocol.md` | 全文 |
```

</details>

> 说明：引用型生成时，handoff 的具体章节（沟通方式 / 协作要点等）以 `SDD/agent_handoff.md` 当前版本为准，本兜底骨架仅保留最小可用集，避免内嵌副本随 SDD 演进而漂移。

---

## §4 important_conclusion.md 模板（内嵌型 · 空文档）

```markdown
> **文档名称**: 关键设计决策记录 (Important Conclusions)
> **所属项目**: [项目中文名]
> **用途**: 记录项目推进过程中形成的关键设计决策和核心共识。本文档中的每项结论均经过充分讨论并获得 project owner 确认。后续功能设计依赖本文档中的结论。
> **Owner**: project owner
> **最后更新**: [日期]
> **内容概述**: （本文档将在项目推进中填入，当前为初始化空文档）

---

# 关键设计决策记录 (Important Conclusions)

## 目录

（随项目推进填入）

---

（本文档将在项目推进中逐步填入。每次确认重要设计决策后，立即在此新增条目。

条目格式：
## [序号]. [决策标题]
> 确认日期: YYYY-MM-DD | 讨论来源: discussion_record.md §[日期段]
[决策内容]
）

---

## 导航尾部

| 如果你需要了解… | 查阅文档 | 定位 |
|--------------|---------|------|
| 完整讨论过程 | `discussion_record.md` | 按日期段查 |
| 项目全貌和元指令 | `agent_handoff.md` | 全文 |
| 生命周期阶段导航 | `SDD/LIFECYCLE_ROUTER.md` | §3 阶段路由表 |
```

---

## §5 discussion_record.md 模板（内嵌型）

```markdown
> **文档名称**: 讨论记录 (Discussion Record)
> **所属项目**: [项目中文名]
> **用途**: 记录项目推进过程中的沟通内容，确保讨论过程和决策依据可追溯。采用索引制（任务来源 / 关键分歧决策摘要 / 产出文档 / 待确认项），活跃记录保留最近 5 个日期段。
> **Owner**: project owner
> **最后更新**: [日期]
> **内容概述**: 本文档记录 [项目中文名] 项目从初始化阶段开始的全部对话记录（索引制）。

---

# 讨论记录 (Discussion Record)

## 目录

- [[日期] 项目初始化](#[日期]-项目初始化)

---

## [日期] 项目初始化

### Agent 操作记录 1

使用 `project-init` Skill 完成项目初始化：
- 创建项目目录：`{GITLOCAL_ROOT}/[项目名]/`
- 创建标准文件集
- git 初始化并完成首次 commit
- 在 `project_registry.md`（可选） 注册本项目（项目清单权威源）

项目描述：[一句话描述]
起始阶段：[起始阶段]

---

## 导航尾部

| 如果你需要了解… | 查阅文档 | 定位 |
|--------------|---------|------|
| 已确认的设计决策（提炼版） | `important_conclusion.md` | 全文 |
| 项目全貌和元指令 | `agent_handoff.md` | 全文 |
| 生命周期阶段导航 | `SDD/LIFECYCLE_ROUTER.md` | §5 概念速查表 |
```

---

## §6 可选平台 adapter 模板（先把 [PLATFORM_ADAPTER_PATH] 映射到真实运行时目录）

```yaml
---
description: [项目中文名] 项目基线上下文
alwaysApply: true
---

# [项目中文名]

## 项目身份

[一句话描述]。本项目过程中积累的实践可反哺 SDD 方法论（副产品，非目标）。

## 元指令体系

本项目完整继承用户级基线的 **元指令体系（以 meta_order.md 为准）**，完整清单见 `agent_handoff.md §2`。

关键约束摘要：
- 每一步操作须经 Owner (project owner) 授权（元指令 #3）
- 新 Agent 启动时，优先读 `agent_quickstart.md` 作为冷启动卡（元指令 #6）
- 始终关注项目是否存在 `important_conclusion.md`，若无则立即创建（元指令 #7）
- 会话结束时同步更新 `agent_quickstart.md`（元指令 #9）

## 新 Agent 启动协议（必须执行，不可跳过）

```
1. 读取 agent_quickstart.md（~50行冷启动卡）→ 掌握项目背景、进度、核心决策
2. 读取 Skill_Guide.md → 识别本项目 + 官方 Skill 资产
3. 向 project owner 主动报告：当前阶段 / 继承规则数 / 下一主线任务
4. 等待 project owner 确认后，再开始正式工作
```

> 按需扩展：完整元指令 → `agent_handoff.md §2`；设计决策 → `important_conclusion.md`

## 核心文档索引

| 优先级 | 文档 | 用途 |
|--------|------|------|
| 🚀 | `agent_quickstart.md` | **冷启动入口**（~50行，优先读此）|
| 1️⃣ | `Skill_Guide.md` | Skill 资产索引 |
| 2️⃣ | `agent_handoff.md` | 项目全貌、完整元指令（见 meta_order.md）、下一步重点 |
| 3️⃣ | `important_conclusion.md` | 关键设计决策锚点 |
| 📁 | `discussion_record.md` | 讨论记录（索引制，保留最近 5 个日期段）|
| 📁 | `model_switch_checkpoint.md` | 模型切换检查点（如存在）|

## 交互语言

默认使用简体中文回复，UTF-8 字符集。

## 模型切换检测

如发现对话风格断点，请主动读取 `model_switch_checkpoint.md` 和 `agent_handoff.md`，并向用户确认是否发生了模型切换。
```

---

## §7 agent_quickstart.md 模板（冷启动卡）— 引用型 + 兜底

**生成方式（引用型，优先）**：结构基准 = `SDD/agent_quickstart.md`。读取其当前 header、协作模式声明节、当前状态表、核心决策速查、SDD 路径索引、按需扩展阅读等骨架作为标准，套用到新项目（替换项目专属内容）。**协作模式声明为强制项**，默认 `精密（默认） | 可启用快速模式：否`。

**兜底**：若 `SDD/` 不可达，按下方最小骨架生成并显式告警（同 §2）。

<details><summary>兜底最小骨架（SDD 不可达时使用）</summary>

```markdown
> **文档名称**: Agent 快速启动卡 (Agent Quickstart Card)
> **所属项目**: [项目中文名]
> **用途**: 新 Agent 冷启动入口。读完本文档（~50行）即可掌握项目背景、当前进度和核心决策，其余文档按需查阅。
> **Owner**: project owner
> **最后更新**: [日期]
> **内容概述**: 项目背景、协作模式声明、当前阶段与下一步、核心设计决策速查、Skill 资产索引、按需扩展阅读。

---

# Agent 快速启动卡

## 项目背景

**[项目中文名]**。[一句话描述]
项目路径：`{GITLOCAL_ROOT}/[项目名]/`

---

## 协作模式声明

**模式可用性**：精密（默认） | 可启用快速模式：**否**

> 完整模式切换协议见 SDD 权威源：`SDD/mode_switching_protocol.md`。如需启用快速模式，请先评估本项目偏移代价，再将上行手改为"是"。

---

## 当前状态（[日期]）

| 已完成 ✅ | 进行中 / 下一步 ⏳ |
|----------|-----------------|
| 项目初始化 | **[起始阶段]**（当前主线任务）|

---

## 核心设计决策速查

（随项目推进填入，每次确认新决策后同步更新本表）

| # | 决策 | 核心结论 |
|---|------|---------|
| - | - | 暂无（项目刚启动）|

> 完整决策见 `important_conclusion.md`

---

## SDD 知识库索引

> SDD 锚点：`SDD/`（按本机挂载点解析；如不可达请人工指定）

| 资源 | 锚点路径 |
|------|---------|
| SDD_tools/ | `SDD/SDD_tools/` |
| skills_download/ | `[SDD_ROOT]/skills_download/` |

---

## 按需扩展阅读

| 如果你需要… | 读哪里 | 定位 |
|-----------|--------|------|
| 完整元指令 + 沟通方式 + 协作要点 | `agent_handoff.md` / `the project governance entry` | 相关节 |
| 已确认的完整设计决策（含背景） | `important_conclusion.md` | 全文 |
| 最新讨论进展与决策摘要 | `discussion_record.md` | 最近日期段 |
| Skill 官方清单 | `Skill_Guide.md` | 全文 |
| 模型切换后恢复上下文 | `model_switch_checkpoint.md` | 全文 |

---

## 导航尾部

| 如果你需要了解… | 查阅文档 | 定位 |
|--------------|---------|------|
| 项目全貌、元指令体系、文档索引 | `agent_handoff.md` | 全文 |
| 关键设计决策完整版（含背景和推导） | `important_conclusion.md` | 全文 |
```

</details>

---

## §8 Skill_Guide.md（原文复制，非模板）

> Skill_Guide.md **从 SDD 原文复制**（`SDD/Skill_Guide.md`），不使用模板生成。
> 复制后，本项目可在"本项目专属"节追加项目级 Skill，其余内容保持 SDD 原文。
> ⚠️ 结构与官方 Skill 数量以 SDD 当前 `Skill_Guide.md` 为准；本参考文档不再内嵌其结构快照，避免随 SDD 演进而漂移。

---

## §9 AGENTS.md 模板（1.0 通用入口，必建 · 内嵌型）

```markdown
# [项目中文名]

> 项目路径：`{GITLOCAL_ROOT}/[项目名]/`
> Owner：project owner | 最后更新：[日期]

## Agent 启动协议

1. 读取 `agent_quickstart.md`（~50行冷启动卡）— 掌握项目背景、当前进度和核心设计决策。
2. 读取 `Skill_Guide.md` — 了解本项目可用的 Skill 资产。
3. 向 project owner 主动确认：当前阶段 / 继承规则数 / 下一主线任务。
4. 等待 project owner 确认后，再开始正式工作。

## 核心规则

- 每一步操作须经 project owner 授权（元指令 #3）
- 口头确认不算数，写进文档才算确认（文档闭环主义）
- 遇歧义必须主动提问，不自行假设
- 会话结束时同步更新 `agent_quickstart.md`（元指令 #9）
- 完整元指令体系（以 meta_order.md 为准）见 `agent_handoff.md §2`

## 核心文档索引

| 文档 | 用途 |
|------|------|
| `agent_quickstart.md` | **冷启动入口**（优先读此）|
| `Skill_Guide.md` | Skill 资产索引 |
| `agent_handoff.md` | 项目全貌、完整元指令 |
| `important_conclusion.md` | 关键设计决策 |
| `discussion_record.md` | 讨论记录（索引制）|
```

---

## §10 质量检查清单（初始化完成后使用）

执行完阶段 2 后，逐项核对：

### 文件完整性
- [ ] `.gitignore` 存在
- [ ] `CLAUDE.md` 存在（项目根目录，含项目定位、当前状态、文档索引）
- [ ] `agent_quickstart.md` 存在（含 SDD 路径索引节 + 协作模式声明节，默认"精密（默认） | 可启用快速模式：否"）
- [ ] `agent_handoff.md` 存在（含 SDD 路径索引节）
- [ ] `Skill_Guide.md` 存在（从 SDD 原文复制）
- [ ] `meta_order.md` 存在（从 SDD 原文复制）
- [ ] `LIFECYCLE_ROUTER.md` 存在（从 SDD 原文复制）
- [ ] `important_conclusion.md` 存在（内容可为空，但文件必须存在）
- [ ] `discussion_record.md` 存在，有今日日期段（索引制格式）
- [ ] 可选平台 adapter 存在，alwaysApply: true
- [ ] `reference/` 文件夹存在，含 CLAUDE.md 和 AGENTS.md（SDD 副本）
- [ ] `AGENTS.md` 存在于项目根目录（所有运行时共享入口，不可跳过）

### 内容规范性
- [ ] 引用型文件（CLAUDE.md / agent_handoff.md / agent_quickstart.md）：若走兜底骨架生成，已写入"模板可能漂移"告警
- [ ] 所有文件 header 包含：更新日期、用途、owner、内容概述、目录索引
- [ ] 所有文件 tail 使用"如果你需要了解…→查阅→定位"格式
- [ ] `agent_handoff.md` 的项目路径与实际路径一致
- [ ] SDD 锚点已验证可达（或写入告警标记）
- [ ] 所有模板文件中的 `[占位符]` / `{GITLOCAL_ROOT}` 均已替换为实际值，无遗留

### Git 状态
- [ ] `git status` 显示 `nothing to commit, working tree clean`
- [ ] `git log --oneline` 显示 1 条初始化 commit

### 全局注册
- [ ] `project_registry.md`（可选） 已新增本项目一行（项目清单权威源；用户级 `the project governance entry` 自 2026-06-09 起不再内联项目表，无需改）

---

## 导航尾部

| 如果你需要了解… | 查阅文档 | 定位 |
|--------------|---------|------|
| 现行 project-init 流程 | `SKILL.md` | §1–§8 |
| SDD 2.0 五模板 | `references/sdd2/templates/` | 全目录 |
| SDD 2.0 运行时与适配 | `references/sdd2/runtime_compatibility.md` | 全文 |
