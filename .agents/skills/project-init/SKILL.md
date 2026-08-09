---
name: project-init
description: 初始化一个继承 SDD 方法论的新项目。创建通用 AGENTS.md、冷启动与决策文档、必要的平台 adapter、Git 仓库，并按目标项目治理规则登记到项目注册表（若存在）。触发词：新项目、项目初始化、project setup、project-init。初始化前由 project owner 明确项目名、目标、起始阶段和 SDD 版本；2.0 必须逐项目 opt-in，不默认升级。
metadata:
  source_version: "2.0"
---

# 新项目初始化 (Project Init)

> Version: 2.0 | Language: 简体中文 | License: Authorized portable distribution
>
> 2026-08-02：通用入口改为 `AGENTS.md`；支持 SDD 1.0/2.0 明确选择；2.0 使用 `references/sdd2/templates/`；平台文件降为 adapter；恢复与远端同步采用 Git 优先协议。

## 1. 适用与边界

- 新项目的第 0 步，在任何需求/PRD/代码 Skill 前执行。
- 必须由 project owner 明确触发；不得批量初始化或替其他项目做 2.0 opt-in。
- 项目目录非空、已有 Git 历史或存在同名项目时停止，改走存量项目流程。
- `AGENTS.md` 是所有新项目的通用入口，不能省略。
- SDD 2.0 不是默认值；未获明确选择时停在信息确认阶段。

## 2. 一轮确认四项

1. **项目名称**：英文/拼音，避免空格和特殊字符。
2. **一句话目标**：做什么、当前非目标是什么。
3. **起始阶段**：需求探索 / MRD / PRD / 实现 / 其他。
4. **SDD 版本**：1.0 或 2.0；选择 2.0 即该项目的 A 类 opt-in 批准。

Agent 自动确认：项目绝对路径、SDD 根锚点或随包参考目录、今日日期、Owner=project owner、默认精密模式、当前运行时能力档位。路径或 SDD 锚点不可达时报告，不猜盘符。

## 3. 先验检查

- 确认目标绝对路径与当前工作树一致；目标目录不存在或为空。
- 若父目录有 Git，确认不会误建嵌套仓库。
- 若目标治理提供 `project_registry.md`，读取它检查项目名和路径；不存在时跳过中央注册，不创建全局依赖。
- 2.0 项目完整读取 `references/sdd2/README.md`、`references/sdd2/migration_guide.md`、`references/sdd2/runtime_compatibility.md` 和五个模板。
- 1.0 项目使用 `reference.md` 的 legacy 模板，并读取根 `meta_order.md`。

## 4. 标准文件集

### 4.1 所有版本必建

- `.gitignore`
- `AGENTS.md`（项目通用入口）
- `agent_quickstart.md`
- `agent_handoff.md`
- `important_conclusion.md`
- `Skill_Guide.md`
- `LIFECYCLE_ROUTER.md`
- 目标运行时明确需要时才创建可选平台 adapter
- `CLAUDE.md`（薄 legacy adapter；用于未来兼容，不复制共享规则）
- `reference/AGENTS.md`、`reference/CLAUDE.md`（创建时的 SDD 入口快照）

### 4.2 1.0 项目增加

- `meta_order.md`（从 SDD 根 1.0 权威复制）
- `discussion_record.md`
- quickstart/handoff 按 1.0 维护规则

### 4.3 2.0 项目增加

- `task_registry.md`
- `decision_log.md`
- `AGENTS.md` 两行 opt-in 声明与 `references/sdd2/README.md §4` 一致
- quickstart/task_registry/decision_log/CLAUDE adapter 使用 `references/sdd2/templates/`
- 不新建 discussion_record；如项目有存量历史才按 migration_guide 冻结

## 5. 创建顺序

1. 创建并再次确认项目根路径。
2. 创建 `.gitignore`。
3. 创建 `AGENTS.md`；1.0 写项目定位与启动入口，2.0 用 `template_AGENTS.md`。
4. 创建 `CLAUDE.md` 与 platform adapter 薄 adapter，指向 `AGENTS.md`。
5. 创建 quickstart、handoff、important_conclusion。
6. 按所选版本创建 discussion_record，或 task_registry + decision_log。
7. 从 SDD 权威源受控复制 Skill_Guide、LIFECYCLE_ROUTER、必要元指令；记录 SDD Git SHA。
8. 创建 reference 入口快照；明确“仅供参考，不覆盖项目权威”。
9. 在项目注册表注册项目（仅当目标治理已提供该文件），字段包含路径、SDD 版本、阶段和入口 `AGENTS.md` / quickstart。
10. 运行文件、占位符、路径、header/tail 和版本声明自检。

## 6. Git 初始化

1. `git init`，确认默认分支名；按组织实际约定设置，不臆造 main/master。
2. 敏感信息与生成物扫描通过后再 `git add`。
3. `git diff --cached --check` 与文件清单通过后提交初始化 commit。
4. 是否创建 remote、是否 push 属 A 类；project owner 明确授权后执行。
5. 远端已存在时不得强推；按 `references/sdd2/recovery_protocol.md` 比较提交图。

## 7. 验收

- [ ] 项目路径、项目名和 registry 唯一
- [ ] `AGENTS.md` 在根目录且为共享权威
- [ ] CLAUDE/Cursor adapter 只映射入口，无完整规则副本
- [ ] SDD 版本与 project owner 选择一致；2.0 声明逐字一致
- [ ] 对应版本的状态文档齐全，另一版本文件没有误建
- [ ] important_conclusion 存在，quickstart 能完成冷启动
- [ ] 所有 header、tail、相对路径和占位符检查通过
- [ ] Git 初始化 commit 可复现，凭据未入库
- [ ] 已记录 SDD 源 SHA 与运行时能力档位
- [ ] 2.0 项目通过 `references/sdd2/runtime_compatibility.md §6` 最小验收

## 8. 交付

报告项目路径、SDD 版本、运行时档位、文件清单、Git SHA、registry 位置、未决 A 类和建议下一阶段。未获授权不 push。

## 与上下游衔接

```
project-init → project-scope-breakdown → mrd-generation → [mrd-integration] → prd-prep → prd-write
```

- 无上游；本 Skill 是项目结构起点。
- 下游按 `LIFECYCLE_ROUTER.md` 和 project owner 指定起始阶段选择。
- 1.0→2.0 存量升级使用 `sdd-upgrade-v2`，不重新运行 project-init。
