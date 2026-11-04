# REQ-183 保存异常核对与名单说明

基线：4dabeb1 + 已验收未提交REQ-182；引用开发规范、UI工作方法、现有REQ-180审计。

## Design language
- Surface: 创建活动、WCL候选报告核对、同步预览。
- Governing owners: app.js saveActivity/cloudCrud/wclCheckSummaryHtml/renderWclSyncPreview；cloud.js syncActivity；原toast/details/form样式。
- Evidence: 运营522与名单截图；verify-req183.cjs在写成功后模拟522，旧版断言失败“已保存却仍显示失败并停留创建表单”。
- Explicit exceptions: 桌面优先，移动封存。

## Findings
| # | Problem | Evidence | Proposed change | Scope | Confidence |
|---|---|---|---|---|---|
| 1 | “待核对”让用户误以为必须处理所有名单 | 用户明确表示这些人都不需要；wclSyncConfirm本就排除unmatched | 改为“未匹配团队名单，默认不计入考勤”，保留核实/手动添加入口 | WCL核对/预览文案 | 高 |

## Improve first
修正文案与实际写入规则的差异，不替用户判断未匹配者必然属于野团，不删除其团队成员。

## Implementation scope
- app.js：活动保存错误由调用点统一提示一次；异常后从云端重读，区分已保存/考勤未齐/未保存/结果未知。创建尝试固定UUID，相同弹窗重试复用，避免请求延迟产生重复记录。切会/关闭重开保护异步结果。
- cloud.js：仅活动新增透传预生成id，利用已有主键唯一约束，不改schema、不用盲重试POST或覆盖考勤。
- index.html：资源版本129；changelog/台账/测试文档同步。
- 已存在活动或考勤状态不做恢复覆盖；初始化未完成时转入现有活动详情，提示核对并同步/保存考勤。读失败不当作“库内不存在”。
- 不处理跨窗口并发同报告唯一约束，不宣称解决522网络根因。

## Validation
先红后绿的浏览器反馈循环；独立数据库模拟HTTP522在到库前/写库后/考勤写入前/全部保存后；读失败+重试、取消关闭重开、切会安全；原考勤及成员导入回归。生产零写。
