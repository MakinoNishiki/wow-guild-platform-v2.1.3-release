# 多人提交拾取与核对状态

基线5fe21f1；2026-11-13运营已确认数据结构和隔离实现。完成审计阶段后进入实现，本计划不单独要求再次批准。

## Design language
- Surface: #/team/loot，拾取列表及lootDropImportModal。
- Sources: DESIGN.md、UI规范v2、UI工作方法；main.css已有form-group/form-select/data-table/tag/btn样式。
- Owners: index.html骨架、app.js拾取区、cloud.js写后回读。
- Exceptions: UI规范v2 §8桌面优先/移动封存，§9零依赖动效；本批不扩大移动布局。

## Findings
No supported findings were found. 本批为已确认业务扩展，没有从源码臆断视觉缺陷。当前“确认入库”是旧业务的准确文案；新增全员提交后须改为“提交并匹配”，否则把预览误表述为正式落库结果。

## Improve first
No supported recommendation. 按运营已选范围复用现有界面。

## Changes
- 导入按钮对公会成员开放，分配、删除、核对仍为edit-only。
- 导入弹窗增加已有活动选择，可留空进入待核对；说明提交不会自动分配。沿用form-group/form-select，不新增颜色或字体规则。
- 预览显示角色服务器与“待匹配/本批重复/缺字段”；提交loading禁重复，失败保留文本，成功显示新增/归并/重复/忽略数量，不把归并计为新掉落。
- 列表装备列内增加现有tag状态与来源数；不新增宽列。查看核对详情使用既有modal，原始来源只给本人或管理者读；全员可读归并后公会记录。
- 管理者可确认、忽略；疑似重复可明确选择已有记录归并。忽略保留证据防重传恢复，默认隐藏，可勾选查看。
- 核对弹窗支持更正所属活动，保存后重新标为待核对；采用既有表单间距，保存失败保留输入。
- 保留现有物品品质边框、主色、职业色及装备分配表。拾取转分配本期仅建立来源约束，操作入口按阶段计划留下一块。

## Validation
真实Chrome+隔离Supabase：普通成员提交、重复提交、双账号并发、管理者核对/忽略、刷新、失败重试、跨公会拒绝；1366和1920视口截图。状态default/hover/focus/active继承既有按钮；selected复用select；disabled/loading/error/empty由交互验证；expanded只适用既有导入弹窗，不新增折叠组件。

## Scope
改动sql新增迁移、lib专用路由、server鉴权接入、cloud/app/index及采集仓库版本；不改生产、不安装游戏文件、不开放普通成员通用写接口。输入不可信、并发及写后回读失败是重点风险。

2026-11-13验收证据：37项隔离浏览器/数据库联验通过，evidence/req191-20261113/verification.json；review-1366.png、list-1366.png、list-1920.png。人工查看核对弹窗和1366列表，无操作列重叠，活动更正和重复提交均实际保存回读。运营验收仍待完成。
