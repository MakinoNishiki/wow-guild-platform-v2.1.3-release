# 任务书 #51-补丁 修改报告：观感四项 + 回归基建

> 日期：2026-09-21 ｜ 执行：Kimi Code ｜ 性质：纯前端只读（零 schema/零数据写入、零依赖零构建、图标文件零更换）
> 验收：`scripts/verify-task51.js` **41/41 全绿**（重建 28 项 + 补丁新增 13 项）；截图 `backup/2026-09-18-task51-wp1/`（12 张 + cards/ 局部 11 张）
> 前置自查：《开发规范》V1.0 已通读在案；任务书原文逐节照办；WP2（76cabf2）已入库事实与任务书「施工中」前置表述有出入，本补丁按其共享层「一次改动两壳同效」口径执行并对 WP2 回归件做了影响取证（见第六节）。

---

## 〇、前置自查（开工基线）

- HEAD 中 `scripts/verify-task51.js` 实为 7 字节事故件（内容 `index.h`），按任务书第五节重建。
- 重建件首跑 = **27 绿 + B3 预期红（首卡 487 → 期望 718）**，与任务书「合格基线」逐字吻合；B3 期望 718 = RPC 实测装饰序第 61 件（取数口径：anon REST 全量拉取 → `entry_type!==2` 过滤 → 序内第 61 件 record_id，与 UI 排序同语义）。
- 任务书列明触碰文件=decorData.js / decor-public.css / verify-task51.js（+闸 c 成立时 decorDict.js 一名词）。**口径申报**：任务书第四节验收明令「词表 ENV_OPTIONS 同步改」，ENV_OPTIONS 实体在 `js/decorDict.js`——按「一切口径以任务书为准」执行了 decorDict.js 的 ENV_OPTIONS 三档化（仅该词表段+数据依据注释，未加任何显示名词）；闸 c 显示名词未加（命中虽 ≥18/20，但任务书要求「顾问定夺后」才动详情弹窗，故停手）。

## 一、第五节 verify-task51.js 重建（施工前置，最先做）

- 按 WP1 修改报告 28 项清单一一重建（A1-A6 / B1a-d / B2a-f / B3 / B4×7 / B5 / B6 / B7 / 清理复核），风格对齐 verify-task51-wp2.js（127.0.0.1 BASE、ANON_H 头、注释体例）。
- 重建相对 WP1 原件的三处合法偏差（均为现实跟进，非口径发明）：
  1. **B3 直接写新口径**（任务书明令）：装饰序第 61 件=718，注释注明「2026-09-18 排序口径变更：装饰在前房间沉底」；
  2. **A3 跟进 WP2 既成事实**：data.html 已含 WP2 互链一行（76cabf2），断言由「零 decor 引用」改为「仅互链一行 href="decor.html"，零 decorData/decorDict/decor-public 引用越界」；
  3. B7 白名单沿用 WP1 定版（user_profiles 409 首登竞态）。
- **重建件 ↔ WP1 报告 28 项对应表**：A1-A6=A 组静态 6 项；B1a-d=首页四态；B2a-f=六维筛选对库；B3=翻页；B4×7=基准六件+texture 件；B5=空态；B6=768 窄屏；B7=零报错；清理复核=T051 清零——28/28 全覆盖无缺项。

## 二、第一节 默认排序：装饰在前、房间沉底

- `js/decorData.js` `filteredRows()`：filter 后统一 `.sort((a,b)=>(a.entry_type===2?1:0)-(b.entry_type===2?1:0))`（稳定排序，组内保 REST 原生 record_id asc；不加排序选择器）。
- **RPC 直连实测定基准**（anon REST `select=record_id,entry_type&order=record_id.asc` 全量 2062 行，内存过滤 entry_type!==2）：
  - 新序第 1 页首卡 = **80**（装饰序第 1 件）；
  - 新序第 2 页首卡 = **718**（装饰序第 61 件）。
- verify 断言同步：B3 改新口径（见上）；**B1d 连带更新**（任务书未预见的连带面，如实申报）：首页占位图期望由旧序 39 → 新序 0（缺图标 41 件中 39 件为低 record_id 房间，沉底后首屏装饰件图标齐备）；新增 B1e（首页 60 卡零房间卡+首卡=80）。
- **完工判据达成：B3 由预期红转绿**（首卡=718=期望）。

## 三、第二节 图标放大（CSS 已做；换图走闸，未动手）

- CSS：网格 `minmax(150px,1fr)`→`minmax(190px,1fr)`；卡片图标 img 64→**96px**（128 源图 1.33x，未换图源）；详情弹窗图标→**128px**（源图原生显示零缩放）；768 档网格 `minmax(132px,1fr)`、图标 img 56→**72px**（容器 80px）。
- 放大后检查（截图留证）：名称两行截断不破位、品质色名/容量徽标不遮挡图标、1366/1920 两档正常（1920 档 8 列）。
- **侦察闸 a：原生 400×400 导出件不在本机磁盘**——`scripts/decor/out/` 实存仅 decor_catalog.json + decor_seed.sql；`icons-native/`（resize_icons.py 头注释「原生件留此可复跑再生」）与 icons_manifest.json 均已不在；全盘 PNG 目录盘点（backup/scripts/assets）无第二处图标库。
- **侦察闸 b（按「闸 a 不在」分支停手）**：需重新导出（export_icons.js 管线重跑，约 5 分钟，依赖 wow.export 源码+Node≥24，头注释有依赖清单）。**预计体积（有依据的推断，非实测）**：128 版实测 20,186,046B（19.25MB/2022 张）；256×256 像素 4×，PNG 此类扁平游戏图标经验系数约 2.6~3.5× → **估算约 52~68MB，大概率超 50MB 红线**——若定夺换图，备选=详情弹窗单独配 256 大图或服务器静态目录托管（不入 git）。**未执行任何导出/换图，等顾问定夺。**

## 四、第三节 卡片信息扩充（WoWDB 式摘要行）

- `cardHtml()` 名称下方新增两行：`.dh-cat` 分类路径行（主类 · 子类，多分类取第一个主类+第一个子类；34/35 经词表已显父类名且与主类同名去重；房间件=「房间」；无子类仅主类名）+ `.dh-src` 来源摘要行（`sources[0]` 复用详情弹窗同款 `sourceText()` 措辞，CSS 单行截断省略号；sources 空且 source_text 非空 → 剥离控制码取首行截 24 字+…；全无 → 灰字斜体「来源未知」）。
- 既有元素零改动：品质色名/容量徽标/房间·可放宠物 badges/点击开详情/onerror 双保险；PAGE_SIZE=60 不动；收藏/清单/3D 按钮不做（红线）。
- **侦察闸 c（can_customize=dyeable 语义对拍）**：等距抽样 20 件 can_customize=true，与 WoWDB `?dyeable=true` 清单（269 件全 12 页抓取）+逐件详情页 `Dyeable:` 属性行核对（2 件 can_customize=false 对照件正确显示 No，方法可靠）——**命中 19/20 ≥ 18/20，语义成立**；唯一分歧件=23710 螺旋木制楼梯（WoWDB 标 No，建议单独对一次 DB2 原始字段：可能为官方标记版本变动）；9265「银龙鱼」经 item_id 253244 精确映射=Lunar Celebrant's Aquarium（zhCN 命名差异不影响）。**按任务书「未得定夺前详情弹窗不动」：弹窗未加「可染色」行、decorDict.js 未加显示名词，停手等定夺。** 附线索：WoWDB 269 vs 我方 226 差集 ~43 件可作下一轮反向抽查入口。

## 五、第四节 摆放环境 chip 三档化

- `js/decorDict.js` ENV_OPTIONS：砍「室内」（=全部 2062 无筛选价值）与「均可」（与「室外」恒等 2020=2020），留 **全部 2062 / 可放室外 2020（outdoors=true）/ 仅室内 42（indoors=true AND outdoors≠true）**，注释注明数据依据（顾问 RPC 实测：indoors 全 true、仅室外=0）。
- `js/decorData.js` 环境组「全部」档同样带计数（2062）；组名「摆放环境（单选）」、默认全部不动。
- verify：B9a 三档计数=2062/2020/42（RPC 对拍）；B9b 选「仅室内」→ 恰 42 件且含 9144/10952/14583（39 房间+两前门+浑天仪）。

## 六、第六节 :focus-visible 补登

- `css/decor-public.css` 新增：`.dh-chip / .dh-pager button / .dh-modal-close / .dh-filterbar .btn / .dh-empty .btn / .dh-error .btn` 的 `:focus-visible`（outline 2px var(--gold)、offset 2px；卡片既有规则保留）；纯轮廓无动画，:hover/:active 零改动。
- 实测（B10）：chip/分页钮/卡片三处键盘焦点 computed = `2px / rgb(240, 192, 96)`；截图 09/10/11 三帧。

## 七、统一验证与影响面

- `node --check`：decorData.js / decorDict.js / verify-task51.js 全过。
- **verify-task51.js 41/41 全绿**（A1-A7d 静态 10 + B 组真浏览器 30 + 清理复核 1；全量输出见送审附件/本报告末节摘要）。
- **双壳影响取证（申报，未触碰 WP2 文件）**：本补丁改的是共享层（decorData.js/decor-public.css），公示壳 decor.html 同效。复跑 `verify-task51-wp2.js` = **36/39**，3 红全部为本补丁口径变更的同源预期红，非功能回归：D4 占位图 39→0（=B1d 同源）、D7 翻页 487→718（=B3 同源）、D12 图标 72/56→104/80（=B6 同源）；公示壳功能项（三态/2062 对库/基准六件/筛选/互链/零报错零≥400）全绿。按红线未触碰 verify-task51-wp2.js，**建议顾问定夺后将该三处期望值随 WP2 下一批同步（39→0、487→718、72/56→104/80）**。
- **版本串未递增（申报）**：开发规范第五章 6 要求改 js/css 递增 ?v=，但本补丁红线禁碰 index.html/decor.html（版本串载体），两令相权从红线；建议下个允许触碰两壳的版本窗口统一递增（当前两壳引用停留 20260918.65，CDN/浏览器缓存下旧脚本可能短期残留）。
- console 零红字（全量 2062 渲染无报错，B7）；T051 测试用户/公会清零复核=0。

## 八、防再犯：送审件 sha256 清单（任务书第五节钉版，长期有效）

| 文件 | sha256 |
|---|---|
| scripts/verify-task51.js | 0f8c46253149dbc5982521dbce7162251a42b111cc85ef5e75880ee336c06f12 |
| js/decorData.js | e366ef3dd30706775ba0963b86eaf7cfedf04d8af39e6aa51595fac567e16bb2 |
| js/decorDict.js | 7230ce96e01706df9b13229e969e359e5529831dfa4fd004030306a3e600e397 |
| css/decor-public.css | f7f8e63b08ec35c366e0f6ffb5e840badb6ffe5ed4e35321062ab8c1045453af |

运营 commit+push 后，Code 将执行 `git show HEAD:<path> | sha256sum` 逐件回证与上表一致。

## 九、截图清单（backup/2026-09-18-task51-wp1/）

01 导航入口 / 02 **1366 首页**（排序后首屏全装饰带图标+卡片三行） / 03 **详情弹窗**（128 图标） / 04 空态 / 05 **768 移动态**（展开） / 06 768 收起 / 07 「仅室内」42 件网格 / 08 排序后第 2 页首卡（718） / 09-11 focus-visible 三帧（chip/分页钮/卡片） / 12 **1920 首页**（8 列） / cards/ 来源局部 11 张（vendor/drop/quest/achievement/profession/shop/treasure/event/festival_note/texture/来源未知）。

## 十、遗留问题

1. 换图（256 版）等闸 b 定夺（估算 52~68MB 超线，备选方案见第二节）；
2. 「可染色」展示等闸 c 定夺（19/20 语义已成立；23710 分歧件建议 DB2 复核）；
3. verify-task51-wp2.js 三处期望值待随 WP2 批同步（第七节）；
4. 版本串 20260918.65 未递增（红线所制，第七节申报）；
5. `diff-task51-wp1.txt` 保持不动（顾问对拍物料，未入 git、未删除）。

**零写入声明**：无 SQL、无库变更、图标零更换；不 commit、不 push，commit 物料格式「任务书#51-补丁：…」三段式备妥待终审。

---

# 补丁2 追记（2026-09-21，终审必修一批，四项全做）

## ① 版本串两壳全量递增 20260918.65→20260919.66

- index.html ×14 处（注释+13 引用）、decor.html ×5 处（注释+4 引用）全量 sed 递增，旧串零残留（grep 复核 0）。
- **data.html 不递增（口径钉版）**：其引用的 main.css/data-public.css/dataPublic.js/lootTaxonomy.js 本批零改动，按规范第五章 6「凡改动 js/css 才递增」不触碰，停留 20260918.65 ×7——verify-task51-wp2.js B2 断言同步改钉此口径。

## ② verify-task51-wp2.js 期望值同步 + 复跑 39/39

- D4 占位期望改新序口径（装饰序首 60 件，REST `entry_type=eq.1&order=record_id.asc&limit=60`）：39→**0**；
- D7 翻页期望改装饰序第 61 件（REST `entry_type=eq.1&offset=60&limit=1`）：487→**718**；
- D12 图标双态改放大后口径：72/56→**104/80**；
- 连带修正（必修①版本串递增而起，如实申报）：A6 版本串断言原为硬编码旧串正则（VER 常量改了它没改）改动态 VER 插值；B2 标签/口径改钉 data.html 停留 20260918.65（见①）。
- **复跑 39/39 全绿**（输出见送审附件）；verify-task51.js 同步 VER=20260919.66 后复跑 **41/41 全绿**。

## ③ 三条取数口径补齐

**B8c「来源未知 59」vs 顾问双空实测 75——两数皆对、口径不同**：
- 顾问 75 = **全库口径**：sources 空数组（76 件）中 source_text 亦空（双空）者 = 75，构成 = **36 装饰（entry_type=1）+ 39 房间（entry_type=2）**（另 1 件非双空 = 25546 佩佩，source_text 非空走原文兜底）。
- B8c 59 = **窗口口径**：断言目标是「来源未知筛选结果集在新排序（房间沉底）下首屏 60 卡窗口内渲染『来源未知』的卡数」。窗口构成 = 37 装饰（36 双空 + 佩佩）+ 23 房间（全双空）= **59**。
- verify 脚本库侧计算式（与 UI 同语义）：
  ```js
  ordered().filter(r => !Array.isArray(r.sources) || !r.sources.length)   // 无来源 76 件，房间沉底序
    .slice(0, 60)                                                          // 首屏窗口
    .filter(r => !r.source_text || !r.source_text.trim()).length           // 双空 = 59
  ```
- SQL 复核全库 75：`select count(*) from decor_catalog where (sources is null or sources = '[]'::jsonb) and (source_text is null or btrim(source_text) = '');`（构成：`and entry_type=1` → 36；`entry_type=2` → 39）。

**546（分类「家具」）取数口径**：
- JS（verify-task51.js cnt.catFurniture）：`dbRows.filter(r => Array.isArray(r.category_ids) && r.category_ids.includes(1)).length`（主类 id 1=家具，一件可多主类，含即计）；
- SQL 复核：`select count(*) from decor_catalog where category_ids @> '[1]'::jsonb;`

**988（资料片「至暗之夜」）取数口径**：
- JS（cnt.expMidnight）：`dbRows.filter(r => r.tags && r.tags['110']).length`（tags 为 {tagID:中文名} 对象，键 '110'=至暗之夜，键在即计）；
- SQL 复核：`select count(*) from decor_catalog where tags ? '110';`

## ④ sha256 清单重报（补丁2 后，七件）

| 文件 | sha256 |
|---|---|
| scripts/verify-task51.js | 82a68fb6ff332ee425db12660603f66987722168f131c53bdd084c20b5c9f5fd |
| js/decorData.js | e366ef3dd30706775ba0963b86eaf7cfedf04d8af39e6aa51595fac567e16bb2 |
| js/decorDict.js | 7230ce96e01706df9b13229e969e359e5529831dfa4fd004030306a3e600e397 |
| css/decor-public.css | f7f8e63b08ec35c366e0f6ffb5e840badb6ffe5ed4e35321062ab8c1045453af |
| index.html | 5c7af2867ec35ca3a7f3c2a1b81b46d026f6ec0b5561235b6766759baf88a33a |
| decor.html | 10d3c810bcf0724a601a846cb51665c10bd8deb1a43eacc0469760e0255a1f13 |
| scripts/verify-task51-wp2.js | cbfcaa94b00ebc9f221e526d3a8cdff08034639982a1f0bca3eb443120ba1193 |

补丁2 维持：不 commit、不 push；screenshots/diff 物料不动；不顺手加功能。
