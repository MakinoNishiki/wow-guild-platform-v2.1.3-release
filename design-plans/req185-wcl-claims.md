# WCL关联接入现有我的认领

Written against: ec8abf3

## Design language
- Audited surface: index.html userCenterModal / 我的认领，app.js renderMyClaims。
- Design sources: DESIGN.md、docs/UI工作方法-证据规范实现验收.md。
- Governing owners: uc-tab、uc-character-list、btn、modal-overlay与openModal/closeModal。
- Explicit exceptions: 桌面优先，移动端封存遵循UI设计规范v2，不扩大改版。

## Findings
2026-11-06运营截图追加审计（原源码阶段结论不代表视觉验收）：
| # | Problem | Evidence | Proposed change | Scope | Confidence |
|---|---|---|---|---|---|
|1|状态/按钮/说明紧贴且候选行对齐不稳定|运营截图；app.js loadWclAccount拼接裸p/button，renderWclCandidates以inline padding堆行；规范v2 §3要求字重/行距建立层级|关联信息、操作组、说明、候选列表、确认footer分组；复用既有间距/按钮/tag/职业图标，样式限当前面板|WCL关联区域|高|
|2|候选确认按钮与原认领汇总间距缺少分区|运营截图及index.html相邻容器|面板底部统一区块间距/边界，原汇总与卡片独立保留|我的认领|高|

## Improve first
优先修正已证实的关联区域分组与候选行对齐；同步补足与原认领汇总的区块间距。

## Design decision
执行用户确认的REQ-185：在我的认领内部增加WCL关联状态与主按钮；匹配预览使用现有弹窗和职业图标。保留原跨公会认领列表。授权不自动认领，只有当前公会匹配预览确认才写入。

## Reuse
uc-character-list、btn-primary/btn-secondary、tag、现有classIconHtml；沿用CSS变量，无新色板/动画库。弹窗统一入modal栈并登记未保存勾选。

## Changes
index.html现有认领标签页增加状态区；app.js加载状态、授权返回、候选勾选与逐条结果；cloud.js衔接服务器受保护入口。实现完整未关联/已关联/无公会/加载/空名单/冲突/失败/成功/过期状态。

## Validation
真实隔离浏览器验证关联、批量确认、部分失败、解绑后已有认领保留；1366桌面与较宽窗口无横向截断；原认领列表和三档规则不退化。语法检查及隔离数据库矩阵须通过，不能以mock代替真实保存。

## Scope
不改主题、原职业色、其他模块。停止条件：需扩展已批准schema或身份规则时提出具体差异。
