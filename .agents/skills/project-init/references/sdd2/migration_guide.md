> **文档名称**: 存量项目切换指引 (migration_guide.md)
> **所属**: SDD 最佳实践体系 — SDD2.0 包
> **用途**: 存量 1.0 项目按项目级 opt-in 切换到 2.0，并建立通用入口、轻量记忆与平台适配。
> **Owner**: project owner
> **最后更新**: 2026-08-02（改为模型无关五步切换；AGENTS.md 为声明权威；增加运行时验收与 Git 优先恢复）。2026-07-27（S1 创建）
> **内容概述**: 前提、切换五步、运行时验收、回退、注意事项。
> **目录索引**: 前提 → 切换五步 → 运行时验收 → 回退 → 注意事项 → 导航尾部

---

# 存量项目切换指引

## 1. 前提

- project owner 已对目标项目明确批准升级；这项 A 类批准不自动扩展到其他项目。
- 已确认项目真实根路径、正确 worktree、Git 状态和 SDD 仓库版本。
- 运行时至少能显式读取项目根 `AGENTS.md`；完整执行型还须通过 `references/sdd2/runtime_compatibility.md §6`。

本指引可由 `sdd-upgrade-v2` 驱动，但 Skill 只能在 project owner 明确触发后运行。

## 2. 切换五步

1. **建立通用声明**：按 `templates/template_AGENTS.md` 创建或更新项目根 `AGENTS.md`，加入 `README.md §4` 两行 opt-in 声明。
2. **建立平台适配**：已有 `CLAUDE.md`、`[PLATFORM_ADAPTER_PATH]/*.mdc` 等入口时，只添加读取 `AGENTS.md` 和 2.0 权威文件的适配说明，不复制完整协议。
3. **建任务注册表**：按模板新建 `task_registry.md`；把 quickstart 当前状态和 handoff 未完成状态中的活跃条目迁入。原文不删，各加“任务状态已迁移至 task_registry.md，此处停止维护”。
4. **建决策日志**：按模板新建 `decision_log.md`；存量 `discussion_record.md` 及归档原样冻结，顶部加“2.0 起新增记录写入 decision_log.md，本文件冻结为历史”。
5. **重定位 handoff**：顶部声明“跨人 / 跨设备交接文档，仅 project owner 触发交接时更新”。

## 3. 运行时验收

- [ ] `AGENTS.md` 两行声明与 `README.md §4` 一致。
- [ ] 平台适配器只做入口映射，没有复制或放松治理规则。
- [ ] quickstart + task_registry 冷启动能正确报告项目、任务和异常。
- [ ] task_registry 唯一权威、decision_log、discussion 冻结、handoff 重定位均在位。
- [ ] 按 `references/sdd2/runtime_compatibility.md §6` 完成目标运行时验收并如实定档。
- [ ] 用 `recovery_protocol.md` 做一次 Git 状态恢复演练。

## 4. 回退

删除 `AGENTS.md` 的两行 2.0 声明及各平台适配器的 2.0 声明即回 1.0。task_registry / decision_log 和冻结历史保留，不删除。

## 5. 注意事项

- 存量历史文档只冻结不删除，确保审计链与回退。
- 文内引用使用相对路径；跨仓库引用锚点为 SDD 仓库根，写作 `SDD/...`。
- 本地与远端分叉、dirty 归属不明、需要覆盖删除时，按 `recovery_protocol.md` 停止并登记 A 类。
- 升级不等于自动提交、合并或 push；按项目 Git 规则单独授权。

---

## 导航尾部

| 如果你需要了解… | 查阅文档 | 定位 |
|--------------|---------|------|
| opt-in 声明 | `README.md` | §4 |
| 运行时能力与验收 | `references/sdd2/runtime_compatibility.md` | §1–§6 |
| Git 恢复 | `recovery_protocol.md` | 全文 |
| 新项目模板 | `templates/` | 全部文件 |
