# REQ-189 拾取误录删除补充（BUG-119）

遵循开发规范、UI工作方法；2026-11-13，基线 b869565 加当前 Collector 候选。用户已要求处理导入后无法删除。

## Design language
- Surface：团队管理 → 装备分配 → 拾取记录。
- Sources：DESIGN.md、UI规范v2 §4.1/4.6/7、相邻分配记录 lootDelete 的确认及反馈。
- Owners：app.js lootDropsRenderTable / cloudCrud；cloud.js syncLootDrop 已支持delete；server.js已有owner/editor鉴权。
- Exceptions：桌面优先，移动封存为§8已知取舍；不新增组件或改主题。

## Findings
功能缺口（非视觉缺陷）：列表只有8个数据列，没有操作入口；用户误录无法撤回。只修这一已选缺口。
呈现要求：第9列复用btn btn-danger btn-sm/edit-only，文字“删除”；确认列明装备、拾取人和时间。执行中“删除中…”禁用，失败中文提示且保留行；取消不请求。复用相邻装备分配原生确认，不新增弹窗体系。

## Scope and validation
- app.js：拾取行删除、权限/公会守卫、防重复、cloudCrud写后回读、成功/失败反馈；拾取加入既有哨兵集合。
- index.html：操作列及缓存版本同步。不改schema、不删除生产数据，不提前实现转换或自动分配。
- 真实Chrome+隔离Supabase：导入→取消删除→故障注入→重试删除→刷新确认；viewer入口及服务器拒绝、跨公会拒绝、分配/考勤未受影响、1366/1920页面截图。未完成这条主链路不宣称交付完成。
