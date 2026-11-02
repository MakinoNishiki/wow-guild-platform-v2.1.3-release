# 家宅图标审计与已选修复计划

Written against: d66934fab5c0865b7f6ac7247e8441abe8c66b62 + 当前未提交#83/#84工作。

## Design language
- Audited surface: index.html#/house/decor 卡片、详情，及复用iconSrc的方案单缩略图。
- Design sources: DESIGN.md、UI工作方法、UI设计规范v2§8/§9、任务书84；本轮用户认可3张模型样图并要求收尾。
- Governing owners and consumers: js/decorDict.js词表 → decorData.js iconSrc → 卡片304/详情472/抽屉784/方案单1154。
- Explicit exceptions: §8桌面优先/移动封存；§9禁动画库。均为已知取舍，不列问题。

## Findings
| # | Problem | Evidence | Proposed change | Scope | Confidence |
|---|---|---|---|---|---|
|1|26个替代图原生64px且内含品质金边，与图鉴高清模型图不一致|任务84与既有PNG、iconSrc只按FileDataID拼路径；用户已认可3张模型样图|在词表加入按record_id的已验收模型图映射，由iconSrc统一消费；原FileDataID保持回退；复杂材质未达标条目保留原图|卡片/详情/复用缩略图|高|

## Improve first
修复同一图标资源选择入口，不改变CSS/卡片排版；用户已选择该修复，不增加新视觉规则。

## Changes and validation
先在assets/decor-icons/model-previews按record_id保存通过检查的PNG。js/decorDict导出映射与原物品图ID；decorData iconSrc优先新的官方目录图，其次映射模型图，再旧图/占位。模型失败回旧图，旧图失败回占位。浏览器实测卡片→详情、两级失败回退、非目标不变，1366与1920两档；只读夹具代替生产DB，报告注明。js改动递增index资源串。复杂VFX模型未通过则不上映射，不伪报26全替换。
