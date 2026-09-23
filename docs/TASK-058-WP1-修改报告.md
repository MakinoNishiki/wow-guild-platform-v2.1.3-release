# 任务书 #58-WP1 修改报告：家宅方案单——数据底座 + 组单抽屉（形态A）+ 导出文字链路

> 日期：2026-09-23 ｜ 执行方：Kimi Code ｜ 状态：**已实现待验收（sql/35 已执行，verify 43/43 全绿）** ｜ git：未 commit 未 push（按书分两次提交：sql 迁移一次 / 二三四节前端一次）

---

## 〇、开工审计（improve-ui，任务书/AGENTS 铁律）

- 审计面：家宅图鉴双壳（decorData.js + decor-public.css @ cc9e20c）；设计源：魔兽管家UI设计规范v2、ui设计参考、开发规范、#51 系列修改报告。
- **存活发现 1 项（登记不施工，出任务书范围）**：图鉴面可点控件（.dh-card/.dh-chip/.dh-pager button）缺 `:active` 按下反馈——契约=v2 §1「按钮 :active 按下即反馈最高优先级」，runtime=decor-public.css:71-83/42-53/174-185 仅定义 hover/focus；修法=补 :active transform 一族。**处置：登记待另行指令**（本任务红线「不顺手加功能」；新增控件——抽屉/＋按钮/步进/复制——已全量自带 :active，不复制该缺陷）。
- **已知取舍不计入**：详情弹窗/抽屉挂 document.body 写死 z-index（1150-1250 段） vs 规范 4.7 modalStack——公开壳无 app.js 弹窗体系，#51 双壳自足架构在案；本任务沿用同段层级（抽屉 1150/1155/1160＜详情 1200＜导出 1210＜toast 1250），层序文档化于 CSS 注释。

## 一、数据底座（sql/35，已执行 2026-09-23）

- 迁移四步：备份 `backup/2026-09-23-task58-wp1/pre-migration-backup.sql`（public schema 7095 行）→ SSH+sudo docker exec psql（supabase_admin，ON_ERROR_STOP=1）→ 输出逐行 `CREATE TABLE×2 / CREATE INDEX×2 / ALTER TABLE×2 / CREATE POLICY×8 / NOTIFY` → 文末 NOTIFY 已执行。
- 复核①：`\d decor_plans` / `\d decor_plan_items` 结构输出在案（列/索引/UNIQUE(plan_id,record_id)/CHECK qty≥1/FK 级联/八策略逐字）。
- 复核②**口径申报**：任务书预期 anon REST「401/403」，实态 = anon **GET 200 `[]`**（RLS 零可见行，PostgREST+RLS 标准行为，与 #54 analytics_events 实证同款）+ anon **POST 401**（42501 RLS 违例）——「anon 无任何权限」实质达成，按实申报。
- 复核③：双临时账号实证——U1 写 1 头+2 明细（201）、U1 读己 1 行、U2 读 U1 头/明细均 0 行、U2 越权写 U1 明细 400/401；U1 删己方案 204 级联明细，service_role 复核双表零残留，账号已删。

## 二、数据层注册与方案单模块

- `js/cloud.js`：双 switch 注册 `decorPlan`；`reloadDecorPlan`（updated_at 倒序取 1 → appData.decorPlan）；`syncDecorPlan('save')` 幂等（无方案 INSERT 头 / 有方案 UPDATE 头 name+updated_at；明细差集 = 批量 delete `.in(record_id)` + 批量 upsert `onConflict: 'plan_id,record_id'`，禁逐行）。**写通道申报**：decor_plans 系用户行级 RLS 表（无 guild_id，/api/db 代理公会级鉴权不适用）——读写 SDK 直连、RLS 为最后防线，user_profiles 制式先例（任务书 §一.9 钦定制式）；verify-task47 A7 grep 面（saveCloudData 直调/fetch('/api/db）零新增。
- `js/app.js`：`saveDecorPlan()` 走 `cloudCrud('decorPlan','save',…)` 全流程；`ensureDecorMounted` 注入 `DecorCatalog.planBridge`（isLoggedIn/loadCloud/save）——公示壳无 bridge 恒未登录（D2 实现枢轴）；`modalDirtyChecks.decorPlanExport` 登记（规范 4.6，判定函数桥取 decorData 侧 dirty 态）。
- 容量合计纯前端 `Σ placement_cost×qty`（图鉴内存索引零请求）；`DECOR_PLAN_CAPACITY_REF=2000` 注释钉「游戏内实际预算随住宅等级变化，此处仅参考」，超限仅 `.over` 标红不阻断。

## 三、组单抽屉·形态A（渲染入 decorData.js，双壳同源）

- 卡片「＋」按钮（图标左下，与右上容量角标错位，stopPropagation 不触发详情）；右下固定入口按钮带总件数徽标实时更新；抽屉 380px 右侧固定（768 全宽覆盖）、头（标题+总件数）/行（图标+品质色名+−/＋步进+移除）/底（容量合计+保存+导出）；空态引导文案；scrim/× 关闭；150-250ms transform/opacity 动效 + reduced-motion 降级；全控件 :active 按下反馈。
- D2：草稿 `wb_decor_plan_draft` 双壳同 key 每次变更自动暂存；公示壳点保存 → toast「保存方案单需要登录，登录后组单内容不丢」→ 跳 index.html；合并三分支（草稿空→云端 / 云端空→草稿 / 皆非空→草稿优先+一次性提示「已还原你上次未保存的组单，保存后覆盖云端」）；保存成功清草稿。
- 抽屉非弹窗、自动暂存无丢失，**不登记 modalDirtyChecks**（判定：规范 4.6 管「未保存编辑内容」，抽屉内容每次变更即落 localStorage 不存在丢失面；导出弹窗含 textarea 编辑则照章登记+二次确认）。

## 四、导出文字链路（WP1 仅文字模式）

- 抽屉底部入口（未登录可用）；弹窗标题「导出方案单」+ 提示条「改动只影响本次导出，不回写方案单数据」+ 可编辑 textarea（默认所见即所得）+ gold「复制文本清单」；格式逐行按书规格（头行/明细行/分隔线/合计行/尾行固定挂 `https://wow.ddctl.com/decor.html` 唯一链接）；clipboard 不可用降级全选+提示；编辑后遮罩/ESC/× 二次确认（native confirm 双壳自足 + app 壳 modalDirtyChecks 登记双保险）；图片模式/皮肤未碰（WP2 红线）。

## 五、埋点与配套

- server.js `TRACK_EVENTS` 一处扩列至 11 事件——**申报：#56 七事件当时未扩白名单（线上一直被 204 吞）**，本次按「清单表↔白名单一一对应」原则将 #56 七事件与 #58 三事件一并补齐，B6c 实证三事件真实入库（#56 七事件同批解锁，回填累积自此开始）；docs/开发规范.md 埋点纪律章事件表 +3 行并加白名单对应注记。
- 版本串：index.html×15 + decor.html×6 → `20260923.73`（当日日期+计数递增）；**data.html 停留 20260919.72×8**（引用资产本任务零改动，#51-补丁2 先例）。

## 六、验证（scripts/verify-task58.js，输出全文 backup/2026-09-23-task58-wp1/verify-output.txt）

**43/43 全绿，0 红，exit 0。**

- A 静态 20/20：sql/35/cloud.js/decorData.js/app.js/server.js/规范章锚点、版本串三壳口径、红线零改动（track.js/dataPublic.js/data.html/decorDict.js/sql 既有件）、node --check ×5 + server-security 回归。
- B 浏览器 20/20（真机真点）：
  - **B1 D2 三红线**：公示壳加 3 件（抽屉 3 行/徽标 3/草稿 3 行）→ 点保存跳登录（草稿未丢）→ 登录切图鉴抽屉 3 件齐全+还原提示（硬验收）；
  - **B2 DB-first**：保存→service_role 复核 1 头 3 明细→**明细写请求 ≤2**（非逐行实证）→刷新云端还原+草稿已清+无提示；
  - **B3 合并三分支**：草稿优先覆盖云端（27043×5 vs 云端 3 件）+提示，保存后库内=草稿内容（差集 delete+upsert 实证）；
  - **B4 容量**：合计=手工核算（cost×qty 逐字），构造 2,005/2,000 → `.over` 标红 + 步进/移除不阻断；
  - **B5 导出**：文本逐行一致（3 明细行+合计+尾行链接）→ 编辑后遮罩点击二次确认（取消不关/确认才关，dialog×2 实证）→ 授权剪贴板复制 toast+内容一致；降级路径经权限拒绝分支审查（catch→select+提示文案锚点 A3d）；
  - **B6 埋点**：三事件 payload 键 ⊆ 登记键集 + 204×17 + **库内三事件在场**（白名单扩列实证）；
  - **B7** 768 抽屉宽=100vw；**B8** ＋不弹详情/卡片本体照常弹详情；**B9** 双壳抽屉骨架 id 全一致；**B10** 全程零 JS 报错零意外 4xx。
- C 清零 3/3：测试事件行/方案单行（头+明细级联）/测试公会+账号四清零复核零残留。

**打回留痕（两轮）**：① B1③ 登录壳抽屉不开——根因=抽屉挂 document.body 而 `$` 查找是 root(#page-decor) 作用域，公开壳 root=document 故单壳假绿；修法=方案单模块全域改 `$doc`=document.getElementById（注释钉根因）；② B4b 判据误用（qty≥99 时＋按设计上限制禁用）改判 −/移除可用 + B6a 捕获数组被导航重置改 localStorage 持久日志。

## 七、遗留与边界

- WP2 红线全守：无方案单独立页/批量管理/多方案 UI/图片模式/皮肤/分享卡；decor_catalog 零触碰；图鉴既有筛选/详情逻辑零改动（B8 回归实证）。
- 多方案能力表级预留（无唯一约束），WP1 口径=updated_at 最新一条，多行并存时以最新为准。
- 埋点 #56 七事件随本次白名单补齐开始入库，09-23 前的七事件数据为空白期（吞掉不可追），看板解读时注意。

## 八、送审物料

| 物料 | 位置 |
|---|---|
| diff 全文（1664 行，git add -N 新件=verify-task58.js+sql/35+任务书存档） | backup/2026-09-23-task58-wp1/diff.txt |
| verify 全量输出（43/43） | backup/2026-09-23-task58-wp1/verify-output.txt |
| 迁移前备份 | backup/2026-09-23-task58-wp1/pre-migration-backup.sql |
| sha256 复算命令+输出（**diff 生成之后**，硬性纪律） | backup/2026-09-23-task58-wp1/sha256-after-diff.txt |
| sha256 sql/35_task058_decor_plans.sql（新件） | 45c024b1a9cfbe73c9e8e8723473e374add06ff4ca41e5c277f6d712a89095e6 |
| sha256 scripts/verify-task58.js（新件） | 2f91f9f3b4d8a4e6f8d8c062017fdb08ed3daa1555213516dfe96afec444f060 |
| sha256 js/decorData.js | 41201a410b4ec87db2634bd6a9962db0c87cdbfd76ee130bf7c65a78a1923c15 |
| sha256 js/cloud.js | da7e106d509c5efd84b823ec8db6b9566141292a28fa0bbbb14cc8948e01a8d9 |
| sha256 js/app.js | 8b65d970c2ba58485afe2ef2c2aafa5094b9e47f38fb3520ab64a243584f510d |
| sha256 server.js | 0f73c8f0d4980048deb48b718547af1358c70eec545a96af4612917c56d7e57e |
| sha256 css/decor-public.css | 47cbbc3ab166373bce5e10aad4fda450681a957dd761cdc83d96bd2f888eab24 |
| sha256 index.html（版本串 20260923.73 ×15 在案） | 42f5326df4baf3829eb02fb31b0d334dc8ce8424d302e67da757b14a344ca471 |
| sha256 decor.html（版本串 20260923.73 ×6 在案） | 5e97226f57bf31ecdacd625ac2a452311710355be3f853436339db5954acef7a |

> 补记（顾问查问）：两壳版本串确已按当日递增 `20260919.72 → 20260923.73`（index×15/decor×6，A6 断言+头部注释行与全部 ?v= 在案，旧串零残留），首轮 sha 清单漏列这两件，已补算补录；data.html 引用资产零改动停留 .72×8（#51-补丁2 先例）。

复算命令（diff 生成后执行，输出原件随附）：
```
$ sha256sum sql/35_task058_decor_plans.sql scripts/verify-task58.js js/decorData.js js/cloud.js js/app.js server.js css/decor-public.css
45c024b1a9cfbe73c9e8e8723473e374add06ff4ca41e5c277f6d712a89095e6 *sql/35_task058_decor_plans.sql
2f91f9f3b4d8a4e6f8d8c062017fdb08ed3daa1555213516dfe96afec444f060 *scripts/verify-task58.js
41201a410b4ec87db2634bd6a9962db0c87cdbfd76ee130bf7c65a78a1923c15 *js/decorData.js
da7e106d509c5efd84b823ec8db6b9566141292a28fa0bbbb14cc8948e01a8d9 *js/cloud.js
8b65d970c2ba58485afe2ef2c2aafa5094b9e47f38fb3520ab64a243584f510d *js/app.js
0f73c8f0d4980048deb48b718547af1358c70eec545a96af4612917c56d7e57e *server.js
47cbbc3ab166373bce5e10aad4fda450681a957dd761cdc83d96bd2f888eab24 *css/decor-public.css
```
