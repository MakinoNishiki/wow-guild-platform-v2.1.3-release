# 装备分配悬浮详情与关联选择状态收尾

Written against: 63369ab（候选139）。引用《开发规范》《UI工作方法-证据规范实现验收》。

## Design language
- 审计范围：装备分配列表图标/名称；成员管理关联完成后的批量选择状态。
- 证据：运营三张截图、app.js lootRender / memberClearSelection、personAttendance.js personLinkSave、dataPublic.js itemCard、data-public.css .dp-item-*。
- 设计依据：用户要求详情与副本掉落一致；保留现有金色标题、品质边框、属性色板。
- 已知取舍：UI规范v2 §8桌面优先，移动端封存；§9禁止动画库。本批不新增依赖。

## Findings
| # | Problem | Evidence | Proposed change | Scope | Confidence |
|---|---|---|---|---|---|
| 1 | 分配表只有装备名和短摘要，无法在当前列表查看图鉴详情 | 用户截图及lootRender的纯span输出，无详情触发点 | 图标与名称作为一个详情入口，复用DPLootDrop.itemCard及dp样式 | 分配列表 | 高 |

## Improve first
按用户指定范围补详情。关联成功仍勾选属于功能缺陷BUG-124，不冒充UI审计发现；实际保存函数的最小回归已失败（成功后仍有2项选择）。

## Design decision / Changes
1. dataPublic.js为现有itemCard提供只读导出；不挂载副本页面，不触发筛选、不复制属性排序或配色。
2. 新建局部lootDetails.js控制浮层：名称/图标hover及键盘focus显示；鼠标可移入详情，Escape/点外/离开/切页关闭。fixed定位避免表格overflow裁切；1366/1920验证。
3. 字典优先官方物品ID；旧记录用名称+团本+首领唯一匹配。多候选不猜。展示本次装等/难度，与副本图鉴原始卡片分区，缺数据明确提示，不把图鉴参考数值当本次装备实际数值。
4. personLinkSave仅在cloudCrud回读哨兵成功后调用memberClearSelection；失败/取消保留选择。
5. index资源版本递增140，DESIGN登记新组件，台账/四维日志/交付报告同步。

## Validation
- BUG-124实际函数回归先红后绿，成功/失败/回读不确认/取消四态。
- 真实Chrome及隔离Supabase验证关联保存后无勾选、失败可重试；只操作合成测试用户。
- 真实Chrome验证分配表图标/名称、焦点、Escape、移入卡片、视口边界、缺失/歧义/延迟/失败、图鉴原渲染一致。
- 不修改生产、schema、认领关系、分配逻辑；不代替运营验收。
