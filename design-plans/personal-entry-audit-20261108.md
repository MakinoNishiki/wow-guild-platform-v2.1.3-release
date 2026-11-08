# 个人块环节1：进入个人空间审计

基线07b0f7f。仅核对登录后个人入口、无公会入口与团队边界；不推进环节2，不改产品。

## Design language
- Audited surface: 首页顶部用户中心、用户中心弹窗、无公会team-guide。
- Design sources: AGENTS.md 2026-11-08分块验收规范、docs/个人块-流程与分块验收.md、开发规范、UI工作方法、DESIGN.md。
- Documented decisions: 个人角色与方案不要求公会；团队功能要求加入公会；复用现有用户中心，不新增个人主页。
- Governing owners and consumers: index.html iaUserCenterBtn/openUserCenter及page-team-guide；app.js iaSyncTopRight/iaApplyRoute/iaRenderTeamGuide/openUserCenter。
- Explicit exceptions: 桌面优先、移动端封存；本轮未扩移动适配。

## Findings
No supported findings were found.

## Improve first
No supported recommendation.

## 当前证据
- iaSyncTopRight仅按登录态显示用户中心，不要求公会。
- team-guide明确“考勤记录、装备分配、心愿单、成员管理、统计报表等团队功能”需要公会；未把个人角色包含在内。
- 公会引导已有“个人角色与家宅方案无需加入公会”的说明。
- 用户中心保留个人资料、我的角色入口；团队入口与个人入口没有出现直接矛盾。

## 真实Chrome入口检查
使用当前完整index.html DOM、main.css、实际openModal/closeModal/openUserCenter/iaSyncTopRight/iaRenderTeamGuide/iaApplyRoute函数；模拟登录会话，无公会。资料加载、快照函数为空替身；路由绘制和switchPage使用最小测试替身记录实际路由判定。不测真实认证、保存或数据库。

1366×900五项通过：
1. 游客用户中心按钮不可见。
2. 模拟登录且无公会后，真实点击顶部用户中心按钮，弹窗打开。
3. 进入#/team/members时实际路由函数判定team-guide。
4. 登录后team-guide加入按钮可用。
5. 返回#/home时实际路由函数判定home。

初轮测试夹具错误引用不存在的app节点，未进入产品断言；去除该夹具语句后五项通过。无产品修改，不新增资源版本和更新日志。

## 运营验收边界
本轮支持环节1交现状验收，不能替代用户本人验收，更不能据此宣布个人块完成。后续在真实登录状态检查顶部入口、无公会进入个人中心、团队引导与返回首页；角色CRUD属于环节2，不在此展开。
