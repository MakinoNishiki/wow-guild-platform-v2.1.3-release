# REQ-193 拾取转分配闭环

## Design language
- Audited surface: #/team/loot，拾取表、核对弹窗、分配表。
- Design sources: docs/开发规范.md、docs/魔兽管家UI设计规范v2.md §4.1/4.5/4.6/4.9、DESIGN.md 品质边框。
- Governing owners: app.js lootDropsRenderTable/lootDropReviewOpen/lootEdit，index.html lootDropReviewModal；使用现有 modal/form-group/form-select/btn/tag 类。
- Explicit exceptions: v2 §8 桌面优先，移动端封存；不新增动画库或主题。

## Findings
No supported findings were found. 本次截图与源码证明功能链路缺口，不伪装为视觉缺陷。用户已明确要求补齐该链路，审计结束后进入功能实现。

## Improve first
No supported recommendation.

## 已授权实现范围
已核对单件拾取增加“转分配”，已有来源分配显示“查看分配”。用现有弹窗组件表达：装备/拾取人/原始首领只读摘要；最终获得者明确选择（默认未选）；状态默认待分配；活动可空、可稍后补；分配首领可人工更正，保留原采集证据。普通成员可读、不能分配。

复用 loot_records.source_drop_id 唯一约束和来源触发器，无新增数据库结构；服务端新专用入口验证当前权限、公会/成员/活动归属及已核对单件来源。创建重试返回已有分配而不覆盖；修改必须指明分配ID，来源不可变。未确认不会凭拾取人自动认定最终获得者。既有编辑入口识别来源后打开同一表单；不覆盖人工分配。

拟改文件：lib/lootObservationRoutes.cjs 专用分配端点；js/cloud.js 写通道与读映射；js/app.js 来源分配表单/状态/引导；index.html 弹窗及资源版本；测试/台账/报告。不改插件采集、不写生产、不提交Git。

验收：真实Chrome与隔离Supabase走无活动转待分配→修改最终获得者→刷新→补关联活动；同名两件、重复提交、网络响应丢失重试、越权/跨公会、未核对/数量非1拒绝、删除后可重建；装等/品质图标/来源守恒。错误保留表单，保存禁用防重复，空态明确下一步。1366与1920检查弹窗、表格溢出；390公开页不改。

边界：交易自动采集和REQ-192完整性清单仍独立待真机证据；本次让采集→人工确认最终去向→分配保存可完整验收，不声称已自动识别游戏交易。
