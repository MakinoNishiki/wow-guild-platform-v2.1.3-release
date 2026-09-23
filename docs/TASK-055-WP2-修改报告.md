# 任务书 #55 WP2 修改报告：访问统计看板前端（REQ-141）

> 日期：2026-09-23 ｜ 执行方：Kimi Code ｜ 状态：**已实现待验收（verify 63/63 全绿）** ｜ git：未 commit 未 push（搭车项见 §一）

---

## 一、WP1 开核两条尾巴（本包搭车）

1. **WP1 报告 §〇.4 措辞订正**：docs/TASK-055-WP1-修改报告.md「运营已自行更换」→「运营已知情并决定不更换，事件结项」，随本 WP2 diff 一并提交，不再单独 diff。
2. **生产日志 90 天滚动清理实证**（docker logs wow-guild-cn --timestamps，2026-09-23 取）：
   ```
   2026-09-22T16:15:40.588965124Z [analytics] 90 天滚动清理完成，删除行数=0
   2026-09-22T17:02:30.939784330Z [analytics] 90 天滚动清理完成，删除行数=0
   ```
   首跑+次跑两行在场；删除行数=0 符合事实——表 09-22 才建，无任何 ≥90 天旧行（server.js 版调度：启动 10 分钟首跑，两行对应容器两次启动的首跑）。

## 二、侦察闸 1 结论（tab 机制，WP2 相关项）

- 数据中心页 = `switchPage('datacenter')`（超管门禁 app.js:2399），tab 体系 = `#mdTabs .view-tab[data-mdtab]` + `mdSwitchTab(tab)`（app.js:12557）→ `renderDatacenter()` renderers 映射分发（app.js:12563）。
- **定案（按书倾向落地）**：「访问统计」tab 复用现有体系零新造——index.html `data-mdtab="analytics"` 挂 specs 之后末位（index.html:723），renderers 映射加 `analytics: mdRenderAnalytics`（app.js:12573 区）。
- 闸 2/5（JWT helper 复用 / verify 登录路径复用）WP1 已落地，WP2 直接消费：前端 `CloudSync.getAccessToken()` + fetch（wclApiPost 同款先例）；verify 复用 WP1 双测试用户 + ANALYTICS_ADMIN_UIDS 注入通道。

## 三、改动清单（WP2 全新件=0，全部为既有件编辑）

| 文件 | 改动 |
|---|---|
| `index.html` | 「访问统计」tab 挂载行（mdTabs 末位，注释钉来源） |
| `js/app.js` | +看板模块约 330 行：anxState 状态机 / mdRenderAnalytics（控制条+惰性首查）/ anxSetRange / anxQuery（JWT+四态+防重）/ anxRenderBody（loading/403 整块/错误条+重试/空态分发）/ anxChartHtml+anxBindChart（SVG 手写双线+hover 参考线浮层）/ anxBarsHtml+anxTableHtml+anxPanelsHtml（四面板）/ anxPageLabel（中文页签名映射）；renderers 注册一行；changelog 补录一条（新增功能维度） |
| `css/main.css` | 末尾追加 .anx- 作用域样式段（控制条/三卡/趋势图/四面板/四态条；查询按钮 :active scale(0.97) 100ms；reduced-motion 降级；≤768 单列） |
| `scripts/verify-task55.js` | WP2 扩展：A3 版本串 .71 口径+A5 九项前端锚点+A4 加 app.js；B5 浏览器四态矩阵九项（B4 限流之前跑）；C 加测试公会清理 |
| `docs/TASK-055-WP1-修改报告.md` | 尾巴①措辞订正 |
| 版本串 | 三壳 .70→.71 全量递增（index×15/decor×6/data×8，无新增引用行，计数守恒已复核） |

**实现要点对齐任务书**：总览/单日监控同一套组件（范围=今天+粒度=小时即单日逐时线，非两套实现）；趋势图零依赖手写 SVG（PV 金 var(--gold)/UV 青 #39c5cf）；X 轴桶标签按粒度格式化（直接切 +08:00 ISO 串，零时区二次换算）；hover 参考线+浮层只动 display/属性；就地校验（起>止 / >92 天）红字不发请求；403 整块占位不反复请求（B5i 请求数=1 实证）；REQ-052 动态日期输入走 zhWrapDateInput 包裹。

## 四、验证（scripts/verify-task55.js，输出全文 backup/2026-09-23-task55-wp2/verify-output.txt）

**63/63 全绿，0 红 0 阻塞，exit 0。**

- A 静态 27/27：sql/34 与 server.js WP1 锚点全绿回归；版本串 .71 三壳计数 15/6/8 + 旧串 .70 零残留 + 无异版本串；A5a-i 前端锚点九项（挂载位/renderers 注册/控制条/四态/趋势图/四面板/REQ-052 包裹/CSS 三锚/changelog）；node --check ×3 + server-security 回归。
- B1 curl 矩阵 8/8（401/403/200 六键/三个 400/anon 双 RPC 401）。
- B2 数据正确性 11/11（东八区跨日/补零桶/uv 口径/nav 剔 login/refs 归并/页面筛选三态）。
- B3 purge 实证（91 天旧行删、近行保留）。
- **B5 浏览器四态矩阵 9/9（真机真点）**：B5a 惰性首查三卡+图+四面板；B5b 自定义种子窗口出图、抽首/中/末 3 桶与接口回放逐字一致（实测桶 pv=[0,5] uv=[0,4]）；B5c 今日+小时 X 轴 HH:mm；B5d 近90天+周 ≥13 桶；B5e 主站筛选重算（63→32，page=index 实证）；B5f 起>止红字零请求；B5g 断网错误条+重试恢复；B5h 全程零 JS 报错零意外 4xx；B5i 非管理员 403 整块占位且仅 1 次请求。
- B4 限流（200×13/429×27）；C 清零双复核零残留。

**排障留痕（三轮打回修复）**：① 测试用户无公会登录落创建遮罩侧栏整隐 → B5 建测试公会（#54 先例）；② Playwright fill 不发 change 事件致自定义日期未落 state + 旧图残留期 waitForSelector 假到位 → 日期值 evaluate 落 state + anxQueryAndWait 统一改「等响应+等 loading=false」；③ badNet 模板串 `r.status` 漏调括号致 409 白名单失配 → 修调用+断网段噪音清零后置（B5g 独立断言后清空数组，注释钉明）。

**版本串三壳计数复核（送审自报）**：index×15 / decor×6 / data×8，旧串 .70 零残留，无异版本串（A3 断言在案）。

## 五、遗留与边界

- 管理员 uid 白名单已在服务器 .env（WP1 配置）；看板「访问统计」tab 对所有超管可见，非白名单超管见 403 占位（B5i 实证形态）。
- 末位恒零桶（当前小时/当天桶未满）：按终审备案处理——补零桶是设计行为（折线不断），末位桶随时间自然填实，不做特殊标注。
- 事件 TOP 当前仅 page_view（WP3 挂点自定义事件后自然丰满，书载不做额外处理）。

## 六、送审物料

| 物料 | 位置 |
|---|---|
| diff 全文（984 行；WP2 全新件=0，均为既有件编辑，无需 git add -N） | backup/2026-09-23-task55-wp2/diff.txt |
| verify 全量输出（63/63） | backup/2026-09-23-task55-wp2/verify-output.txt |
| 本报告 | docs/TASK-055-WP2-修改报告.md |
| sha256 index.html | f26a9aea47b421f71833eabdbaca597ab7dbfd5ecf87a76ad81c3f58b3ac7803 |
| sha256 css/main.css | 9fe664566525ff6eca64303b6921b2c21371256498e7034fa4730eb8418db49a |
| sha256 js/app.js | 886d25b49fc839f943138ea46becad7860613fea3aa7c38daf559b5c15f99f94 |
| sha256 scripts/verify-task55.js | 90c547f1f19e5299ada535dde8c4942538d49a80b30f330b327ff7c2bd28b82d |

> WP2 无新件，新件 sha256 项按实申报为零；改附四枚改动核心件 sha256（生成于 diff 之后，#54 立规沿用）。
