# 任务书 #41 修改报告：问题反馈入口·QQ群（REQ-112）

> 日期：2026-08-12 ｜ 执行：Kimi Code ｜ 版本串：20260811.52 → **20260811.53**（两壳 16 引用 + 2 头部注释同步；图片为静态资源不占版本串）
> 状态：开发自测完成（verify 17/17 全绿），待运营验收（B 表 4 项）｜ 未 commit 未 push

---

## 一、改动清单（实际改动点）

| 文件 | 改动 |
|---|---|
| `index.html` | `.sidebar-footer` 内、`#appVersion` 上方新增 `.fb-entry`（按钮 `#feedbackBtn`「💬 问题反馈」+ 悬浮卡 `#feedbackCard`：二维码图/群名/群号可复制按钮/引导文案） |
| `css/main.css` | 新增 `.fb-*` 一族：按钮渐变高亮 hover（深蓝底金色微光，`background-position` 0.6s 纯 CSS 双向过渡）、悬浮卡 fixed 定位（left:10px bottom:78px，z=60，防侧栏 overflow 裁切、不遮 topbar 操作区）、白底卡托 `.fb-qr-wrap`（#fff + 6px 圆角 + 8px padding）、卡片淡入 0.2s 双向、`prefers-reduced-motion` 降级（过渡归零直呈终态） |
| `js/app.js` | 文件尾新增 `initFeedbackEntry()`：粗指针/窄屏（hover 不可用）点击切换 `.open`、点外部/ESC 关闭、aria-expanded 同步；群号点按复制（clipboard API，失败回退 toast 展示） |
| `assets/qq-group-qr.png` | 新增（运营素材入库）。**素材实情申报**：运营交付文件名为「QQ群二维码-魔兽管家用户群-1104273954.jpg」，实测为 PNG 格式（1284×2283，QQ 官方分享卡，深色底）——①server.js 静态分支不 decodeURIComponent，中文名 URL 必 404（SEC-002 拦截族之外的既有行为，本次不改 server.js）；②扩展名与真实格式不符。故引用走 ASCII 真实扩展名 `qq-group-qr.png`，原始交付文件原样保留在 assets/ 备查 |
| `index.html` / `data.html` | 版本串 .52→.53 |
| `scripts/verify-task41.js` | 新增验证脚本（17 断言） |

## 二、§1 审计单（侧栏结构与 REQ-105 同域关系）

- 按钮挂在 `.sidebar-footer`（版本号上方、版本号保持最底），**不是 `.nav-item`、无 `data-page`**——REQ-105 导航拖拽排序将来按 `.nav-menu .nav-item` 枚举重排，反馈入口与版本号均不在 `.nav-menu` 容器内，天然不参与排序、不构成可重排结构障碍（任务书 #42 WP2「问题反馈按钮与版本号区不参与排序」前置满足）。
- 悬浮卡 `position:fixed` 独立于侧栏文档流，侧栏折叠/展开、导航重排均不影响卡片定位。
- 公开壳 data.html 无侧栏，未加（A3 断言零残留）。
- 非 modal 不走 modalStack；z-index 60 仅压侧栏/内容区，不触 topbar 操作区（位于左下角）。

## 三、移动端降级口径（已知取舍申报）

真实手机 ≤768px 侧栏整体 `display:none`（项目移动封存取舍，v2 §8，bottom-nav 承接导航）——反馈按钮随侧栏在真手机上不显示，与「侧栏入口」定位一致。点击切换降级面向 **hover 不可用且侧栏可见**的环境（触屏笔记本/二合一/桌面宽触屏仿真）：`(hover: none)` 或 ≤768 判定生效，点击切换、点外/ESC 关闭均已实测。B3 运营实测时请用 DevTools 设备仿真（触控）在桌面宽度验证点击降级；如需真手机入口（bottom-nav 加项）属移动封存解封议题，另行裁定。

## 四、验证方式（verify-task41.js，17/17 全绿）

- A1 版本串两壳 .53 单一串一致；A2 素材 200 且 magic bytes 校验 PNG；A3 公开壳零残留；
- B1 按钮在 footer 内、版本号上方（rect 断言）、非导航项；
- B2/B3/B4 hover 前隐藏 → hover 显示（三要素齐：图 naturalWidth>0 可加载、群名、群号 1104273954、引导文案；卡片 rect 全程在视口内）→ 离开隐藏（双向）；
- B5/B6 §2 computed：按钮 `linear-gradient` + `background-position` 过渡在案；卡托 `rgb(255,255,255)` + 圆角；卡片圆角 8px、fixed、z=60；
- C1-C3 粗指针仿真（isMobile+hasTouch，实测 `(hover:none)=true`）：点击切换显示/aria-expanded、点外部关闭、ESC 关闭；
- D1/D2 reduced-motion：按钮与卡片 transition-duration 均 0s，hover 仍即时呈现；
- 全程零 JS 报错、零 404；T41 测试数据清零复核。

截图：`backup/2026-08-12-task41/`（desktop-hover-card.png / coarse-tap-card.png）。

回归：task27×3 / 29 / 31 / 32 / bug071 / 34 / 35 / 36 / 37 / 38 / 39 / 40 + npm test + SEC-001 全绿（结果见完工报文分段）。

## 五、遗留问题

- B4（实机 QQ 扫码）待运营手工验收。
- 素材为深色 QQ 官方分享卡（非白底二维码图）：白卡托作为哑光边框+quiet zone 保留，扫码识别率以 QQ 自产分享卡设计为准，B4 实测定音。

### commit 物料（待运营审后统一提交）
标题：「任务书#41：侧栏问题反馈入口+QQ群悬浮卡与渐变高亮（REQ-112）」
【改了什么】侧栏 footer 版本号上方加「问题反馈」按钮（渐变高亮 hover 双向纯 CSS 过渡+reduced-motion 降级）；hover 悬浮卡（QQ 群二维码白卡托+群名+群号复制+引导文案，fixed 定位不出视口）；粗指针点击切换/外点/ESC 降级。【范围】index.html、css/main.css、js/app.js、assets/qq-group-qr.png（新增素材）、两壳版本串 .53、scripts/verify-task41.js（新增）。【验证】verify-task41 17/17 全绿（位置/三要素/hover 双向/粗指针三交互/reduced-motion/computed）；回归 task27×3/29/31/32/bug071/34/35/36/37/38/39/40+npm+SEC-001 全绿；测试数据清零。
