# 公会设置叠层疑点审计

基线：07b0f7f；只读产品审计，没有实施补丁。

## Design language
- Audited surface: 用户中心上打开公会设置。
- Design sources: 开发规范第四章弹窗栈、DESIGN.md暗色主题、UI工作方法证据分级。
- Documented decisions: 统一openModal/closeModal与modalStack，不单独写死层级；桌面优先。
- Governing owners and consumers: index.html guildSettingsModal .modal/.modal-body；main.css .modal-overlay/.modal/.modal-body；app.js openModal/modalApplyStacking。
- Explicit exceptions: 移动端沿既有<=768px底部92vh弹窗分支，不据桌面85vh规则判错。

## Findings
No supported findings were found.

## Improve first
No supported recommendation.

## 实测与限制
真实Chrome headless，加载当前index.html的完整DOM，去掉业务script及外部link，注入当前main.css、实际openModal/closeModal/modalStack函数；snapshotModalForm使用空测试替身。调用先用户中心再公会设置。未登录或读写生产，未验证真实公会保存。

| 视口 | 弹窗顶部/底部 | 内容滚动距离 | 底部保存栏在视口 |
|---|---|---|---|
| 1366×768 | 57.5/710.3 | 784px | 是 |
| 1920×1080 | 81/999 | 519px | 是 |
| 588×900 | 72/900 | 556px | 是 |

两桌面视口公会遮罩z=1004，用户中心z=1002；视口最底部命中公会遮罩，不穿透至下层。内容区具备滚动。移动分支高度828px=92vh符合当前CSS。

用户588×1755图片可能是滚动拼接截图，但无法仅凭图片证明截图工具行为。此前“弹窗过长且下层透出”的确定性判断证据不足，应予纠正。没有可复现缺陷，不改产品、不递增资源版本、不新增修复日志。若正常浏览器仍出现，需记录视口尺寸、缩放比例及是否使用长截图，沿相同路径再复现。
