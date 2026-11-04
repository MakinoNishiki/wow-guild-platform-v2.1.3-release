# REQ-180 现有团队流程审计与增量方案

引用：docs/开发规范.md、docs/UI工作方法-证据规范实现验收.md、DESIGN.md。

## Design language
- Audited surface: 成员管理、考勤记录、装备分配；沿用现有页面和弹窗。
- Design sources: DESIGN.md 深色变量、按钮体系；现有 .card / .btn / .form-select / details。
- Documented decisions: 用户要求整合已有能力、不建立平行功能；步骤为名单→考勤→装备。
- Governing owners and consumers: index.html 三页面及 wclSyncModal，app.js 报告发现、同步预览、活动保存。
- Explicit exceptions: UI 规范 §8 移动管理页面封存，桌面优先；不引入动画库。

## Findings
| # | Problem | Evidence | Proposed change | Scope | Confidence |
|---|---|---|---|---|---|
| 1 | 报告候选无名单核对信息，只有关联/创建 | wclRenderNewReportsBanner 输出日期与时长；用户要求确认本团队报告 | 同一候选增加按需「核对参战名单」，展示匹配、待核对、无首领战的事实，不宣称自动归属 | 考勤候选 | 高 |
| 2 | 预览把所有非缺席记录称为手动标记，实际包含旧同步记录 | buildWclSyncPreview 按状态判断；没有来源字段 | 改称「已有标记」并说明保留策略；更换报告显示新增/未再出现名单 | 同步弹窗 | 高 |
| 3 | 三个已有模块缺操作顺序说明 | index.html 三页 header 只有模块简介；用户明确要求简单指引 | 每页同款可折叠指引，当前步骤默认一行，展开说明既有入口 | 三个管理页面 | 高 |

## Improve first
先补候选核对信息。复用现有报告接口与预览弹窗，编辑活动更换报告时先预览后保存。历史考勤缺来源证据，保留所有旧状态；不自动删除。失败保留输入与可重试状态。用户已批准本范围继续实施。


## 运营验收反馈审计（2026-11-05）

已测量/用户证据：user-log-actions.png 显示 footer 的普通按钮被展开内容撑高，summary 与其他操作外观相同且无方向指示。修订为原生 details 上弹列表、显式箭头和 open 状态；同排按钮高度不变。沿用现有深色变量/6px圆角/btn状态，无新动画。

已测量/代码证据：wclSyncReports 每次都会请求，但同份结果只更新到分钟的时间，且 freshCount 没扣除本地已关联活动。修订为每次完成反馈＋相同过滤口径；Chrome 记录两次点击对应两次请求。

已测量/用户证据：user-import-tutorial.png 的默认名单页展示宏和多种格式，而用户已选择 WCL 优先。showImportMembersModal 原默认 paste；改为 wcl，移除宏，备用只保留单个中文示例。三项修订由用户本轮反馈明确授权，不另开功能模块。


.126：运营指出报告检查结果视觉过弱；源码为12px/--text-muted。按反馈改为13px/600及语义状态色/左侧线，复用全站success、danger、blue-highlight，不新增动画。
# 2026-11-05 真实联验补充审计

- 表面：活动详情 → 更换报告 → 确认保存失败后的重试按钮。
- 约束：同一弹窗在 `renderWclSyncPreview` 中明确使用「确认更换并保留已有考勤」，失败不能改变重试操作的含义。
- 证据：Chrome 真实测试库已经走通更换保存失败分支；`wclSyncConfirm` 的 finally 无条件恢复「确认写入考勤」，与当前 replacement 状态矛盾。保存失败仍保留预览和旧链接，问题局限于重试文案。
- 修正：finally 按 `meta.replacement` 恢复既有两种文案，不新增样式或交互。
- 置信度：高。范围仅现有 WCL 确认按钮；在隔离与真实数据库回归中分别增加失败后文案断言。

