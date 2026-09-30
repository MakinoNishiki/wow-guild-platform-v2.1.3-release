# 任务书 #61-WP1 修改报告：回归锚点适配 + 挂账内务批（纯内务，无用户可见变更）

> 日期：2026-09-30 ｜ 执行：Kimi Code ｜ 状态：已实现待验收（**未 commit / 未 push，送审**）
> 性质：纯内务——回归体系信号清净 + 挂账清零，零用户可见变更、零业务代码改动、零 DB 变更、零版本串变更。

## 一、改动清单

| 文件 | 改动 | 性质 |
|---|---|---|
| `scripts/verify-task55.js` | 锚点适配 3 处（A2d / A3 / B5 登录路径）+ 头注释登记 | 仅锚点与断言期望值，被测物零改动 |
| `scripts/verify-task58-wp2-3.js` | 锚点适配 4 处（A1 / A4 / A6 / A7）+ 头注释登记 | 同上 |
| `scripts/verify-task60.js` | A6 连带适配 1 处（白名单正钉 → 冻结项反钉） | 同上（连带，理由见 §二.8） |
| `decor.html` / `data.html` | 头注释各 1 行改写（引用串 `.82` 不动） | 仅注释 |
| `scripts/log2png-task61.js` | 新增：复跑日志渲染 PNG 留证工具 | 送审留证 |
| `docs/TASK-061-WP1-修改报告.md` | 本报告 | — |

**版本串零变更实查**：index 20260923.83×15 / decor 20260923.82×5 / data 20260923.82×8（与批前逐值一致）。409 勘定结论=无需改 cloud.js（§三），故不触发 .84。

## 二、锚点适配逐条理由（适配≠删断言，逐条钉现行仓库事实）

**verify-task55.js（3 红 → 适配 3 处，断言 54 → 63 项）**

1. **A2d**（钉 server.js 旧 regex `index:[a-z]+`）：旧锚点被 #58-WP2-3 的既定修复（server.js 双 RE 放行连字符）与 #60 的 DB 对齐（sql/36）双重过时。改钉现行口径三连：server.js `ANALYTICS_PAGE_RE` 新 regex 在场 + sql/36 校验行新 regex 在场 + 旧形态在 server.js 零残留（grep 实证无 `index:[a-z]+` 字面）；其余子断言（8KB/92 天/grain 白名单/双 400 中文）原样保留。sql/34 为历史迁移原文，其旧 regex 仍由 A1d 原样钉守——一钉历史一钉现行，不矛盾。
2. **A3**（版本串钉 .71 三壳同值 15/6/8）：#56~#60 各批依规递增，且 #60 起两壳不随 index 追平（裁定在案）。改钉现行实查值：index `20260923.83`×15 / decor `20260923.82`×5 / data `20260923.82`×8 + 旧串 .70 零残留 + 各壳 `?v=` 无异版本串（按各壳自身版本钉）。
3. **B5 登录路径**（`goto /` 直填 `#authEmail`）：#59 门户化后 `#authOverlay` 默认 `display:none`，旧路径必超时。改钉现行行为：`?auth=login` 唤醒浮层 → 一级 tab「团队管理」→ 二级 pill「数据中心」（超管门禁 pill 与 `#navDatacenter` 同源，经 app 自有 `updateCloudUI()` 重跑门禁——与 #60 截图脚本同径实证）。B5a~B5i 九项断言本体零改动，适配后全部恢复运行并全绿。

**verify-task58-wp2-3.js（4 红 → 适配 4 处，断言 14 → 14 项守恒）**

4. **A1**（TRACK_EVENTS 钉 14 事件）：#59-WP1 已新增第 15 事件 `tab_click`（server.js:370 与规范 §7.2 清单表在案）。改钉 15 事件顺序逐一核对（`EVENTS_14`→`EVENTS_15`，尾追加 tab_click）。
5. **A4**（规范事件表钉 14 行）：同上，改钉 15 行与白名单一一对应；regex 口径注记等其余子断言原样。
6. **A6**（版本钉 .77 index×15/decor×6）：后续批递增 + #59-WP3 壳化使 decor 引用行 6→5 + #60 不追平裁定。改钉现行实查值 index `20260923.83`×15 / decor `20260923.82`×5 + 旧串 .76 零残留。
7. **A7**（排他白名单「改动仅限本 WP 七文件」）：送审制下任何后续批未提交文件恒破此锚（结构性失效，非漂移一次）。改钉该锚守卫目的本身——#58 全链冻结文件反向钉：`js/track.js` / `js/decorData.js` / `js/cloud.js` / `css/` 不在 diff（`app.js`/`data.html`/`sql/` 已经 #60/#61 合法改动故出列；server.js TRACK 段口径由 A1/A2 接管守卫）。

**verify-task60.js（连带 1 处，断言 13 → 13 项守恒）**

8. **A6**（diff 恰为 #60 三文件的正钉）：与上条同构——#61 文件一进工作区即恒红，且 #60 commit 后干净树（diff 为空）同样必红，属同批送审时刻锚。连带改反钉：本批冻结项 `js/track.js` / `server.js` 不在 diff（守卫目的=采集层与服务端零触碰，不变）。**申报**：此项超出任务书点名的两脚本范围，属验收条「verify-task60 复跑仍 13/13」的必要连带，若顾问不许可单行回退。

## 三、409 噪音勘定结论：**撤销挂账**（零修复点）

复核范围 = cloud.js ensureTagNum 全段（291-333）+ 两调用方 + server.js：

- **碰撞路径零 console 输出**：23505 撞号两分支（无行插入 cloud.js:304-309 / 有行缺号更新 cloud.js:317-318）均静默 `continue`，重读回退亦静默；`console.warn` 仅三处真失败（非 23505 错误 ×2、5 次耗尽 ×1、catch 异常 ×1）——业务正确告警，非噪音。
- **调用方零噪音**：cloud.js:381 登录链路 fire-and-forget `.catch(() => {})` 静默；app.js:529 `openUserCenter` await——ensureTagNum 全路径 try/catch 包裹恒 resolve（失败 return null），零异常逃逸零日志。
- **server.js 零 409 字面处理**（grep 无命中，PostgREST 错误直通）。
- **唯一残留** = 浏览器网络面板对 REST 409 的自动回显（"Failed to load resource… 409"），属浏览器固有行为而非应用 console 输出，即任务书 §0.1 界定修复触发条件（网络面板之外的 console 输出）**不存在**。
- **运行时旁证**：本批复跑 verify-task55 B5h「全程零 JS 报错零意外 4xx」实测 网络=0 报错=0——409 精确白名单滤波器本轮**零触发**，滤波器自此空转。

结论：挂账撤销，cloud.js 零改动（故不触发 index.html .84）。各 verify 脚本内 409 白名单滤波器（verify-task54/55/56）本批不点名故未拆，现已空转无害，是否拆除请顾问定（拆=一行删，此后任何 409 回显直接红）。

## 四、两壳注释 diff（仅注释行，引用串不动）

```diff
-<!-- 静态资源版本号与 index.html 同步递增（开发规范第五章第 6 条，施工负责）：20260923.82 -->
+<!-- 静态资源版本号：20260923.82（开发规范第五章第 6 条规约对象=index.html 及被其引用的 js/css；本壳引用资源变更时才随批递增，不随 index.html 联动——任务书 #61-WP1 注释统一） -->
```

decor.html / data.html 各 1 行（第 7 行），`git diff` 实证两壳各仅该注释行变更，`?v=` 引用串与版本号数字零触碰（计数守恒 5/8）。html 响应 no-cache 即时生效，无缓存风险。

## 五、验证（复跑全绿，留证 PNG）

| 脚本 | 批前 | 批后 | 留证 |
|---|---|---|---|
| verify-task58-wp2-3.js | 10/14（4 红锚点） | **14/14 全绿**（断言守恒） | `backup/2026-09-30-task61/verify-task58wp23-green-14of14.png`（日志原文 `backup/task58wp23-rerun-t61.log`） |
| verify-task55.js | 51/54（3 红） | **63/63 全绿**（B5 九项恢复运行，断言 54→63 不减反增） | `backup/2026-09-30-task61/verify-task55-green-63of63.png`（日志原文 `backup/task55-rerun-t61.log`） |
| verify-task60.js | 13/13 | **13/13 全绿**（A6 连带适配后守恒） | 终端复跑留证 |

- verify-task55 全绿要点：A 静态全段（含适配后 A2d/A3）+ B0 迁移闸 + B1 鉴权矩阵 + B2 数据正确性（含 B2k 页面筛选三态）+ B3 purge + **B5a~B5i 浏览器四态矩阵九项全绿**（新 IA 登录路径真机真点：管理员出图/自定义窗口逐字一致/今日小时/90 天周/页筛重算/就地校验零请求/断网恢复/零报错零意外 4xx/非管理员 403 占位）+ B4 限流 + C1/C2 清零。
- verify-task58-wp2-3 全绿要点：A 静态九项（含适配后 A1/A4/A6/A7）+ B1 三事件入库 / B2 `index:decor-plan` PV 不回归 / B3 负向三吞 + C1 清零。
- 版本串三壳实查：index .83×15 / decor .82×5 / data .82×8，**本批零变更**；`node --check` 两适配脚本双过；server-security 回归 5 pass（随各脚本 A 段三跑三过）。
- 红线遵守：track.js / server.js / analytics 函数 / 业务代码零改动（git diff 白名单=两 verify 脚本 + verify-task60 + 两壳注释 + 本报告/留证工具）；DB 零变更。

## 六、遗留

1. verify-task54 / verify-task56 内同款陈旧锚点（版本钉 .70/.72、409 滤波器、#59 前登录路径若有）本批不点名未动——若后续送审要求这两脚本也全绿，需同法适配（建议下个内务批收口）。
2. changelog 四维补录随 release（内务批同口径）。
3. commit 物料：待顾问终审后另发；建议标题「任务书#61-WP1：回归锚点适配（verify-task55/58-wp2-3/60）+ 409 挂账撤销 + 两壳注释统一」，三段式【改了什么】三脚本锚点适配逐条钉现行事实 + 409 勘定撤销挂账 + 两壳注释按第五章第 6 条范围改写【范围】scripts/verify-task55.js、scripts/verify-task58-wp2-3.js、scripts/verify-task60.js、decor.html、data.html、留证工具【验证】三脚本复跑 14/14 + 63/63 + 13/13 全绿、断言数不减、版本串零变更实查。
