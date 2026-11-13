# Collector 无命令日常操作面板

## 1.0.4 信息核验追加审计（2026-11-13）

- Contract：用户真机截图显示5条错误数据可入库；本次修复要求未确认装等/绑定记录保留，但不得作为正常记录导出。
- Runtime：core.GetState → ui.RefreshUI 的既有计数只显示记录/等待/失败，按钮也只判断总数；无法说明“保留但未导出”的差额。
- Finding（高置信）：总记录数和导出数出现差额却没有对应文案，旧记录更会显示正常状态。
- Correction：复用既有计数区，另起一行明确可导出/待核对；待核对时常驻解释旧版或信息不全不纳入导出。导出按钮仅可导出数大于0时启用；不新增步骤、弹窗或视觉体系。
- Verify：模拟控件验证旧记录保留、混合导出排除、空可导出禁用；真实游戏排版与新拾取仍待用户验证，不把模拟几何当真机。


Written against: b869565 + REQ-189 未提交的 1.0.1 补丁。2026-11-12 用户同意保留插件并继续交付，包含上一轮建议的面板与按钮。

## Design language
- Audited surface: addon/WoWButlerCollector/core.lua 的命令入口和导出窗口。
- Design sources: 用户本轮明确要求降低命令门槛；现有 BasicFrameTemplateWithInset、游戏原生字体与按钮；docs/UI工作方法-证据规范实现验收.md。
- Documented decisions: 默认自动采集，仅团本史诗及以上；拾取不代表最终分配。网站视觉规范不直接用于游戏 Lua 控件。
- Governing owners and consumers: core.lua 事件/状态/导出，toc 加载顺序，zhCN.lua 文案。
- Explicit exceptions: 本任务为游戏插件，CSS、浏览器断点与网站 modalStack 不适用；真实游戏视觉与事件仍需本人验收，模拟控件不冒充真机。

## Findings
| # | Problem | Evidence | Proposed change | Scope | Confidence |
| --- | --- | --- | --- | --- | --- |
| 1 | 日常查看和导出只有命令入口 | 用户明确反馈命令门槛高；core.lua SlashCmdList.WBC 唯一调用导出框 | 游戏设置插件页加状态/开关/导出，小地图入口打开同一设置页 | Collector | 高：源码+用户反馈 |
| 2 | 等待和失败只打印聊天，无法在面板持续核对 | core.lua pendingCount 仅 count/export 文案，加载失败 print 后无状态 | 面板同步展示记录/等待/本次登录失败数与最近错误 | Collector | 高：源码 |

## Design decision / Reuse
复用原导出和二次确认清空；新 ui.lua 只消费 core 状态和动作，不复制采集或 JSON 编码。原生 Settings Canvas、UICheckButtonTemplate、UIPanelButtonTemplate 与 GameFont 字体；无外部 UI 库。原命令保留兼容，空命令打开面板，help 才列命令。

布局：标题与版本 → 开启自动采集勾选 → 状态与计数 → 最近记录/错误 → 导出主按钮 → 三步指引与覆盖边界 → 分隔后的清空。横向边距24，区块间16，按钮高28；采用原生按钮 hover/pressed/disabled，状态文字兼有颜色；不加动画。

## Changes / Scope
- core.lua：设置独立 SavedVariables，不改历史记录数组；公开窄状态/动作接口，暂停只停止新事件，已接收队列完成；导出空态/等待态拦截，JSON 控制字符转义，保留清空确认。
- ui.lua：游戏设置页、可拖动且可隐藏的小地图入口，隐藏后仍从 ESC 设置进入；原生导出窗口明确复制与网站粘贴步骤。
- toc/语言包/CHANGELOG/README：版本1.0.2，加载与说明同步。
- 验证脚本：真实Lua5.1执行core+ui，模拟游戏事件和控件交互，覆盖暂停、恢复、空导出、清空取消/确认、重开、设置保留、错误/等待反馈、导出JSON；与真实游戏验证严格区分。
- 不改网站/数据库，不自动分配，不实现伴生程序，不宣称团队成员事件全覆盖。真实游戏采集与站内隔离导入仍是块1最终门槛。

## Validation / Stop conditions
离线行为回归与旧静态回归；安装前检查已装文件等于上一版留证哈希，备份后升级并逐文件比对；SavedVariables只读不改写。遇到真实游戏交互/拾取样本依赖时交给本人最少操作，代理负责后续读文件。不运行战斗或假造事件作真机证据。

## Design documentation
实现后将本审计附到REQ-189报告；运行结果据实填写，不以安装成功宣布验收通过。

## 1.0.3 难度范围追加审计（用户已指定）

- Contract：运营要求普通、英雄、史诗分开记录，随机团不采集、不计数。
- Runtime：core.GetState 原来只有 inRaid，ui.RefreshUI 在任何 raid 中都显示绿色“等待团本拾取”；语言包空态也未区分团本难度。
- Finding（高置信）：新范围下随机团仍显示可采集状态，和用户确定的范围矛盾。采集过滤属于功能改动，不作为额外 UI 审计问题。
- Correction：复用原状态文字，支持难度显示“普通/英雄/史诗”，随机团显示“随机团队 · 不采集、不计数”；其他特殊/未知难度显示不采集，绿色仅用于支持的难度；暂停状态优先。最近完成记录附带难度。
- Scope：core.lua 的状态与采集入口、ui.lua 的已有状态和最近记录、zhCN.lua 文案；不增加筛选面板或新操作步骤。
- Verify：Lua 模拟难度切换状态与记录/导出字段；真实游戏文字布局与采集仍待运营实测。旧记录不清除。
