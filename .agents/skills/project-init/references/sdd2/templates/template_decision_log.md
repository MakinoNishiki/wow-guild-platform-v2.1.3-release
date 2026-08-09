> **模板说明**：SDD 2.0 决策日志模板（替代 1.0 discussion_record，元指令 v2 #1）。`{...}` 为占位符；本说明块创建时删除。

---

> **文档名称**: 决策日志 (decision_log.md)
> **所属项目**: {项目名}
> **用途**: 记录各会话的 A 类决策与产出索引（元指令 v2 #1）。过程性讨论不誊录；项目恢复优先使用 Git 与状态文档，只有异常或 project owner 明确要求时才定向读取平台会话。
> **Owner**: project owner
> **最后更新**: {YYYY-MM-DD}
> **内容概述**: 日期段索引，每段 < 30 行；活跃保留最近 5 段，超出归档至 decision_log_archive_YYYYMM.md。
> **目录索引**: 最近 5 个日期段 → 归档文件索引 → 导航尾部

---

# 决策日志

## {YYYY-MM-DD} {任务一句话}

**A 类决策**：
1. {决策内容}——理由：{一句话}。{已落 important_conclusion §n / 无需落档}

**产出物**：
- {相对路径}（{新建 / 修改}）

> 无 A 类决策的会话：仅记任务一句话 + 产出物，两三行即可。

> 状态恢复规则见 `SDD/references/sdd2/recovery_protocol.md`；会话历史不是任务状态权威。

---

## 导航尾部

| 如果你需要了解… | 查阅文档 | 定位 |
|--------------|---------|------|
| 当前任务状态与 R/A 项 | `task_registry.md` | 对应任务节 |
| 项目关键决策正文 | `important_conclusion.md` | 对应章节 |
| Git 优先恢复 | `SDD/references/sdd2/recovery_protocol.md` | 全文 |
