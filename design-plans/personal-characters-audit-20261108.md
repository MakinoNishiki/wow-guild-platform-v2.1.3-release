# 环节2：管理本人角色审计与删除文案计划

Written against: 07b0f7f。仅我的角色列表、添加/删除及WCL同步状态；不推进展示设置或公会认领改造。

## Design language
- Audited surface: 用户中心→我的角色，loadUserCharacters、saveCharacter、deleteCharacter、loadWclAccount。
- Design sources: AGENTS分块验收规范、开发规范、UI工作方法、REQ186用户层/团队层解耦决策。
- Documented decisions: user_characters为本人角色，raid_members.user_id为团队认领单一真源，不相互替换或删除历史。
- Governing owners and consumers: app.js生成角色卡并绑定deleteCharacter；cloud.js deleteUserCharacter只删除user_characters，过滤本人user_id和角色id。
- Explicit exceptions: 桌面优先；公开个人主页未开放；本环节不新增编辑能力。

## Findings
| # | Problem | Evidence | Proposed change | Scope | Confidence |
|---|---|---|---|---|---|
| 1 | 删除确认没有表达用户已要求区分的个人记录/团队认领边界 | app.js deleteCharacter当前仅“确定要删除这个角色吗？”；同页WCL区域明确个人角色与公会认领独立；cloud.js实际仅删除user_characters | 保留原confirm，明确只从个人角色列表移除，不解除公会认领、不影响团队历史 | 个人角色删除确认文案 | 高（源码证据） |

## Improve first
补齐删除确认的作用范围，复用现有confirm与危险按钮，不新建弹窗或视觉体系。

## 排除与现状
- loadUserCharacters已分别渲染“WCL 已验证／待重新验证／WCL 已解绑”与“手动添加 · 未验证归属”，不存在两来源混为已验证的文案问题。
- WCL账号区已显示保存数量、无角色重新授权指引和同步不自动加入/认领说明，暂无需再造。
- 角色卡确实没有编辑入口；没有找到本环节已批准新增编辑的具体字段/验证规则，因此不据此扩展功能。
- saveCharacter/deleteCharacter使用alert显示部分错误属于既有实现，不仅凭风格偏好立UI问题。
- 功能核查另报主代理：deleteUserCharacter异常返回false，而调用方不检查；这不是视觉缺陷，应在环节2功能验证处理，不能仅换文案掩盖。

## 实施交接
另一个实施代理可修改app.js deleteCharacter的确认文案：“仅从你的个人角色列表移除该角色，不会解除公会认领，也不会删除团队考勤或装备记录。确定移除吗？”
保持取消零写入，删除仍为本人个人记录，不改展示隐私与团队表。WCL再同步是否恢复角色由既有同步规则决定，本轮不新增永久屏蔽逻辑。

验证：实际Chrome点击角色卡删除，取消后列表及数据不变；确认后仅个人角色移除；数据库独立核对团队认领和历史保持。若本批同时修复功能异常，补失败后保留角色与错误提示。不得拿函数模拟测试冒充DB保存链路。

本审计只读产品、没有实际删除或真实账号操作；没有新增产品版本。实施后由执行代理登记台账、更新日志与版本串，运营验收前不提交。
