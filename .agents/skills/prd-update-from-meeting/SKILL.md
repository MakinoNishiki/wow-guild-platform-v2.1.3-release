---
name: prd-update-from-meeting
description: 基于评审会议结构化会议纪要（飞书智能纪要或等价导出）对 PRD 评审结果做分类，产出 B 表（差异分类清单 + 优先级 D 表 + 改动量预估），交付 PM 决策后由 prd-write 增量改写 PRD。四象限分类（一致/冲突/缺口/会议未提及）+ 章节索引法定位 PRD 锚点。触发词：评审分类、会议纪要分类、PRD 评审分类、prd-update-from-meeting、B 表生成。
metadata:
  source_version: "1.0"
---

> **文档名称**: prd-update-from-meeting Skill v1.0
> **所属项目**: the organization SDD 最佳实践
> **用途**: 引导 Agent 将评审会议结构化会议纪要（飞书智能纪要或等价导出） + 现存 PRD 转化为 B 表（meeting_diff），供 PM 决策后驱动 PRD 增量改写。
> **Owner**: project owner
> **版本**: v1.0
> **最后更新**: 2026-05-15
> **上游 Skill**: prd-write v2.0（PRD 已存在）
> **下游 Skill**: prd-write v3.0（已就绪，2026-05-15 升级；承接 incremental 模式增量改写 + changelog）
> **内容概述**: §快速开始 → §启动检测 → §三阶段工作流 → §输入输出规范 → §B 表 frontmatter → §质量自检 → §文件命名 → §上下游衔接 → §不覆盖范围

---

## 目录

1. [快速开始](#快速开始)
2. [启动检测](#启动检测)
3. [三阶段工作流](#三阶段工作流)
4. [输入输出规范](#输入输出规范)
5. [B 表 frontmatter 规范](#b-表-frontmatter-规范)
6. [质量自检清单](#质量自检清单)
7. [文件命名规范](#文件命名规范)
8. [上下游衔接](#上下游衔接)
9. [不覆盖范围](#不覆盖范围)

---

## 快速开始

PRD 完成 → 召开评审会议 → 产出结构化会议纪要（飞书智能纪要或等价导出） → **本 Skill** → B 表 → PM 决策 → prd-write 增量改写

**输入**：
1. 现存 PRD：`docs/PRD_xxx.md`（任意版本）
2. 评审会议结构化会议纪要（飞书智能纪要或等价导出）：`reference/meetingRecord/*.docx`（含配套 `.txt` 文本导出，1-N 份）

**输出**：完整 B 表（默认**会话内输出**，PM 即时决策；末尾询问是否归档为文件）

```
现存 PRD + 结构化会议纪要  →  四象限分类 + D 表 + 改动量预估  →  会话内输出完整 B 表
                                                              ↓
                                                       PM 即时决策
                                                              ↓
                                              询问："是否归档为文件？"
                                                ↓ 是               ↓ 否
                                docs/prd/meeting_diff_*.md     会话即终点
```

**输出形态原则**：评审会议高频发生，全程文件落盘会拖慢推进节奏。**默认全程会话输出**，PM 在会话中直接对着 B 表决策；末尾按需归档。

**核心方法论：四象限分类驱动**

|              | 会议讨论了                       | 会议未讨论             |
|--------------|---------------------------------|-----------------------|
| **PRD 有**   | 内容一致 → ③ 一致 / 不一致 → ② 冲突 | ④ 会议未提及（提醒）  |
| **PRD 无**   | ① 缺口                          | 不入表                |

冲突类不再细化二级标签（凡需 PM 决策的都是冲突，分类不为决策本身服务）。

---

## 启动检测

启动前必须按顺序确认（不可跳步）：

```
1. 从用户输入或对话上下文确认目标 PRD 路径
2. 确认 PRD 当前版本号（读 §1.1 版本记录或 frontmatter）
3. 确认评审会议结构化会议纪要路径（默认起点 reference/meetingRecord/）
4. 若纪要为 .docx，确认是否有配套 .txt 文本导出
       Agent 解析依赖文本版本
       有 → 优先读 .txt
       无 → 提醒用户提供 .txt 导出，或确认仅靠 .docx 解析（容错降级）
5. 报告检测结果给用户确认：
       - PRD 文件路径 + 版本号
       - 结构化会议纪要文件列表（1-N 份）
       - 输出 B 表预告路径
6. 等待用户确认 → 进入阶段一
```

启动检测失败（任一项不齐）时不进入工作流，明确反馈缺少哪一项，不擅自降级。

---

## 三阶段工作流

### 阶段一：输入准备 + 预过滤

**步骤**：

1. **解析 PRD 章节树**：扫描 PRD，提取目录结构（`§1.3` / `§5.1.1` / `§5.4.7` 等层级），构建章节路由表 + 关键词反向索引
2. **解析结构化会议纪要**：按结构化会议纪要（飞书智能纪要或等价导出）的标准结构（总结 / 议题树 / 待办区 / 相关链接 / Table 附录）拆解
3. **噪声预过滤**：对每条议题做二维判定（详见 `reference.md §2.3`）
   - ① 是否涉及具体业务规则 / 字段 / 接口 / 流程 / 状态机？
   - ② 是否能映射到 PRD 章节（含潜在新建章节）？
   - 两项都为 N → 标"噪声候选"

**阶段一产出**：
- PRD 章节路由表（内部缓存，不落盘）
- 结构化会议纪要议题清单（含原文要点）
- 噪声候选清单

**阶段一确认门**：将噪声候选清单一次性呈现给 PM，PM 可勾选挑回（默认通过）。**不**逐条问 Y/N。

详细规则见 `reference.md §2 阶段一详细规则`。

---

### 阶段二：对齐 + 分类（核心）

**步骤**：

1. **原子化编号**：每条议题 / 待办独立编号 `M{NN}-{NN}`（M = meeting，第一个 NN = 会议序号，第二个 NN = 条目序号）
2. **PRD 锚点对齐**：用章节索引法（详见 `reference.md §3.2`），每条原子条目找出 PRD 锚点 `§x.y.z`，未命中标"PRD 无"
3. **四象限分类**：按决策树落定（详见 `reference.md §3.3`）
4. **会议未提及补全**：扫描 PRD 主要章节，找出会议完全未讨论的章节，补 ④ 类条目

**阶段二产出**：分类草表（四象限主表，每条含：编号 / 会议要点 / PRD 锚点 / 分类 / 建议处置）

**阶段二确认门**：草表交 PM **抽查**（不逐条核对，PM 抽 3-5 条验证分类准确度即可）。

详细规则见 `reference.md §3 阶段二详细规则`。

---

### 阶段三：收口

**步骤**：

1. **D 表（优先级提醒）抽取**：从冲突 + 缺口条目中筛出满足以下任一条件的（详见 `reference.md §4.1`）：
   - 决策结果影响 ≥ 2 个 PRD 章节
   - 决策结果会改变其他条目的分类或处置方式
   - 代表两种根本路线（如方向冲突）
2. **改动量预估**：按章节级触点 + 大致行数估算（详见 `reference.md §4.2`）
3. **会话内输出完整 B 表**：按 `reference.md §5 B 表完整模板` 在会话中直接渲染（不落盘）
4. **询问归档**：B 表输出完成后**主动询问 PM**："是否需要将本 B 表归档为文件？"
   - PM 答"是" → 落盘到 `docs/prd/meeting_diff_PRD_v{from}_{YYYYMMDD}.md`
   - PM 答"否" / 不响应 → 会话即终点，不落盘
5. **后续动作清单**（会话内输出）：列出 PM 决策 → prd-write 改写 → changelog → 拆解版本同步的衔接路径

**阶段三产出**：B 表完成稿（会话形态）+ 可选归档文件。

---

## 输入输出规范

### 输入约束

| 项目 | 约束 |
|------|------|
| PRD | Markdown 格式，9 章企业结构（与 prd-write 输出兼容）|
| 结构化会议纪要 | `.docx` / `.txt` / Markdown（至少一种可读格式）|
| 纪要数量 | 1-N 份，按会议时间顺序编号 M01 / M02 ... |
| 纪要结构 | 结构化会议纪要（飞书智能纪要或等价导出）默认结构（总结 / 议题 / 待办 / 相关链接 / Table 附录）|

### 输出约束

| 项目 | 约束 |
|------|------|
| 默认输出形态 | **会话内 Markdown 渲染**，PM 即时决策 |
| B 表内容结构 | 遵循 `reference.md §5 B 表完整模板` |
| 归档询问 | 阶段三末尾**主动询问**："是否归档为文件？" |
| 归档落盘路径（PM 答"是"时）| `docs/prd/meeting_diff_PRD_v{from}_{YYYYMMDD}.md` |
| Frontmatter | 仅归档落盘时需包含全部字段（见下节）；会话形态可省略 |

**为什么会话优先**：评审是高频活动，落盘文件适合需要事后追溯 / 跨会话引用的场景。会话内决策可压缩到几分钟内完成，无文件 IO 开销。

---

## B 表 frontmatter 规范

```yaml
---
source-prd: docs/PRD_billing_system_v4_phase1.md
source-version: v4.3-phase1
source-prd-snapshot: <commit hash 或锚定日期>
meeting-records:
  - reference/meetingRecord/<file1>.docx
  - reference/meetingRecord/<file2>.docx
meeting-date: 2026-MM-DD
target-version: TBD              # 待 PM 决策后由 prd-write 回填
status: pending-pm-review        # pending-pm-review / pm-reviewed / consumed
generated-by: prd-update-from-meeting v1.0
generated-at: 2026-MM-DD HH:MM
---
```

| 字段 | 含义 | 谁写入 |
|------|------|--------|
| source-prd | 源 PRD 文件路径 | 本 Skill 落盘时填 |
| source-version | 源 PRD 版本号 | 本 Skill 落盘时填 |
| source-prd-snapshot | PRD 锚定快照（commit hash 或日期）| 本 Skill 落盘时填 |
| meeting-records | 结构化会议纪要文件列表 | 本 Skill 落盘时填 |
| meeting-date | 会议日期（多场取最近一场）| 本 Skill 落盘时填 |
| target-version | 目标 PRD 版本号 | 占位 TBD，prd-write 回填 |
| status | B 表状态 | 占位 pending-pm-review，prd-write 流转 |
| generated-by | 生成 Skill 标识 | 本 Skill 落盘时填 |
| generated-at | 生成时间戳 | 本 Skill 落盘时填 |

---

## 质量自检清单

写完 B 表后必须逐项检查（输出通过/失败/N/A）：

### 结构完整性
- [ ] B 表包含全部六个 section：①方法论与规模 ②各场会议主表 ③会议未提及补全 ④D 表（优先级提醒）⑤改动量预估 ⑥噪声存档 + 后续动作
- [ ] 会话内输出可读性良好（Markdown 表格能正常渲染）
- [ ] 末尾**主动询问归档**："是否归档为文件？"
- [ ] **若归档**：Frontmatter 全部字段齐全 + Header 元信息齐全 + 导航尾部存在 + 路径符合命名规范 + 文件可被 Markdown 渲染器正确解析

### 分类准确性
- [ ] 每条原子条目都落定到四象限之一（一致 / 冲突 / 缺口 / 会议未提及）
- [ ] "PRD 锚点"列每条都有具体 §x.y.z 或显式标 "PRD 无"
- [ ] 噪声条目独立存档（§6），不进四象限主表
- [ ] ④ 会议未提及类别由 PRD 章节扫描产出，不与其他三类重叠

### 一致性
- [ ] 原子条目编号无跳号、无重复
- [ ] PRD 锚点引用的 §x.y.z 与 PRD 实际章节号一致
- [ ] 同一议题在主表 / D 表 / 改动量预估中的引用编号一致

### 完整性
- [ ] 结构化会议纪要的所有议题（含 Table 附录中的内容）都被处理
- [ ] 结构化会议纪要待办区的所有条目都纳入分类
- [ ] PRD 主要章节（§1-§9 + §5 二级）都被扫描会议未提及


---

## 文件命名规范

**输出文件**：
```
docs/prd/meeting_diff_PRD_v{from}_{YYYYMMDD}.md
```

示例：
- `docs/prd/meeting_diff_PRD_v4.3-phase1_20260513.md`
- `docs/prd/meeting_diff_PRD_v3.1_20260429.md`

- `{from}` = 源 PRD 版本号（与 frontmatter `source-version` 一致；含 `-phase1` 等后缀时保留）
- `{YYYYMMDD}` = 会议日期（多场会议取最近一场）

落盘目录 `docs/prd/` 与样本一致，不新建目录。

---

## 上下游衔接

```
prd-write v2.0（PRD 已存在）
        ↓
评审会议 → 结构化会议纪要（飞书智能纪要或等价导出）
        ↓
prd-update-from-meeting（本 Skill）→ B 表
        ↓
PM 决策（人工）
        ↓
prd-write v3.0 增量改写（incremental 模式）→ PRD 新版本 + changelog 条目
        ↓
prd-split（同步拆解版本）
```

**与 prd-write 衔接**：B 表的"建议动作"列即为 prd-write v3.0 增量改写模式的输入（决策回填后）。changelog 条目不在本 Skill 范围（由 prd-write 承接）。

**与 prd-review 关系**：平行。prd-review 是 PRD 自身评分（9 维度打分）；本 Skill 是会议输入驱动的修订规划。两者可独立运行，互不阻塞。

**完成后必须更新的文档**：
1. `discussion_record.md`：新增 B 表生成记录索引条目
2. `agent_handoff.md`：若 B 表表明本期 PRD 有重大修订，更新项目状态

---

## 不覆盖范围

明确声明以下不在本 Skill 范围内：

1. **其他平台或纯文本记录**：只要提供等价的总结、议题、决定和待办结构即可直接使用。
2. **非会议触发的 PRD 改动**（走查反馈 / 自检 / 临时澄清） → 直接走 prd-write 增量改写
3. **PRD 实际改写** → prd-write 或人工
4. **changelog 条目生成** → prd-write v3.0 升级承接（元指令 #15）
5. **拆解版本同步** → prd-split

---

## 导航尾部

| 如果你需要了解… | 查阅文档 | 定位 |
|--------------|---------|------|
| 详细规则与 B 表完整模板 | `reference.md` | 全文 |
| 下游 PRD 改写 Skill | `../prd-write/SKILL.md` | 全文 |
| 平行 PRD 评分 Skill | `../prd-review/SKILL.md` | 全文 |
| 元指令 #15（PRD 改动同步 changelog） | `the project governance entry` | 元指令体系 |
| Skill 资产总索引 | 项目 `Skill_Guide.md` | 全文 |
| 需求生命周期路由 | `SDD/LIFECYCLE_ROUTER.md` | §3 阶段路由表 |
