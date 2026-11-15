# 拾取分配入口、职业色与装备中文信息

Written against: c5cb50e

## Design language
- 审计表面：#/team/loot 拾取表、确认装备分配弹窗、分配表。
- 依据：运营2026-11-16四张截图、DESIGN.md职业色与表格规范、UI工作方法状态矩阵。
- 所有者：app.js lootDropsRenderTable / lootAllocationOpen / lootRender；index.html对应DOM；main.css职业类。
- 已知取舍：UI规范v2 §8桌面优先、移动封存；不将原生控件的系统选中底色当作本轮缺陷。

## Findings
| # | Problem | Evidence | Proposed change | Scope | Confidence |
|---|---|---|---|---|---|
| 1 | 未核对行转分配位置空白，首领破折号不解释 | 用户图1；lootDropsRenderTable仅confirmed渲染按钮，boss空直接— | 显示“先核对，再分配”；核对弹窗提供明确的确认后打开分配表单入口，首领空显示“未采集”并允许分配表单补充 | 拾取表及核对弹窗 | 高 |
| 2 | 最终获得者下拉丢失现有职业色 | 用户图2；lootAllocationOpen普通option；同页lootInitMemberSelect已用职业色 | 复用main.css .class-*给option和选中成员着色，文字继续保留职业与服务器 | 分配弹窗 | 高 |
| 3 | 分配列表显示内部代码，装等隐藏在次级小字 | 用户图3；distMethodMap缺roll_rule，slot直接输出 | 部位复用LOOT_DROP_INVTYPE_ZH，分配方式完整中文词表；新增独立装等列，保留既有难度列 | 分配表与方法选择 | 高 |

## Improve first
先处理第1项，让用户能够理解并继续完成当前晚拾取记录。

## Reuse
- 复用btn/toolbar/form-select/data-table、IconMap.classColor及.class-*职业色、LOOT_DROP_INVTYPE_ZH、cloudCrud、既有核对和分配接口。原生option的通用颜色规则优先级高于class，故用既有IconMap色值设置inline color；不复制色板。
- 保留人工确认最终获得者、单件/已核对门禁、来源不改、权限及幂等。
- 不改主题色，不引入依赖或动效。CSS若增加仅用于本表辅助说明和数字列。

## Changes
1. app.js：不以首领是否存在决定能否分配；确认核对成功后可打开原分配弹窗；取消和失败不继续。
2. app.js/index.html：原生select使用已有class-*，选中值同步着色；表单继续按成员ID保存。
3. app.js/index.html：中文映射和装等列；现存英文数据直接显示兼容，不批量改生产历史数据。

## Validation
- 隔离Chrome+Supabase：待核对且首领空→确认并转分配→选最终获得者→保存→刷新、再编辑；失败及取消不跳转。
- 1366×768、1920×1080；长文字、空态、loading/error/disabled、按钮hover/focus/active和select展开。
- INVTYPE_WAIST/LEGS/CHEST及roll_rule旧值正确显示；344/史诗对应同一记录；跨服同名仍用ID。
- scripts/verify-req194-real.cjs；沿用REQ193主链路验证，不把测试夹具当游戏真机。

## Stop conditions
公会、用户上下文变化中止；未核对、来源读取失败或多件不允许进入自动延续。第4项团员考勤独立结构方案登记REQ195，不能在本显示修复中静默改变历史统计。

## Design documentation
验收报告登记原生选中底色限制；词表与职业色复用既有单一来源。
