# 任务书 #28 WP3-v3 体验修订 + 数据修复整包 修改报告（R1–R10）

- 日期：2026-08-08 ｜ 站点版本串：**20260808.26**（双头 index.html 8 处 + data.html 6 处，旧串零残留）
- 范围：运营指令 WP3-v3（R1–R10 整包，以此版为准）
- 状态：完工待验收。**未 commit、未 push**（铁律：验收通过前不提交）

---

## 一、R1–R10 逐条落地

| 项 | 内容 | 落地 | 证据 |
|---|---|---|---|
| R1 | 星标裁切修复 | 根因 = `.dp-item-stats` 的 `overflow:hidden` 把角部外溢的 ⭐SVG（top:-5px/right:-4px）切半；修复 = 放开 overflow + `margin-top:6px` 留净空间（css/data-public.css:236） | verify WP3-11 星标边界盒断言（svg 10×10 完整落在卡片内，四边距均 >0）+ `v3-star-1366.png` |
| R2 | 占位行废止 | itemCard 只渲染有数据的行（js/dataPublic.js:283-322），行序固定 名称/meta/主属性(如有)/副属性(如有)/特效(如有)/来源 | verify WP3-12/12b/12c：永恒虚空之歌项链、圣光纽带（无主属性→副属性行紧跟 meta）、上古饥渴之心（无副属性→特效行紧跟主属性行）、全页零 `.dp-item-stats:empty` + 三张锚点卡特写 |
| R3 | 行内自适应等高 | 删除全部固定/占位行高（name/meta/stats/preview/src），内容驱动 + grid 原生 stretch 行内等高，零 JS 测高；390 单列同样生效 | verify WP3-3（同 grid 行分组比高，uneven=0）+ WP3-3b（CSS 文本断言无固定行高）+ `v3-cards-390.png` |
| R4 | hover 续文展开 | 隐藏镜像（`fxMirror`）同宽同字体二分实测「连…恰好装满 2 行」的最长前缀；预览=`slice(0,lo)+'…'`，展开层只放 `slice(lo)` 续文（**前缀+续文===全文**，逐字接续）；absolute 定位不推挤布局；resize 防抖 150ms 重算；reduced-motion 降级保留 | verify ① 三张长特效卡逐字比对（捕魂者的咒符/暮色怨灵的低语/艾林先知的凝视：预览截…、hover 后预览保持可见、展开层=续文、拼接===数据源全文）+ 1920 档同款 + `v3-hover-continuation-1366.png` |
| R5 | 来源 chip 间距 | 来源组值 chip 包进 `.dp-chip-sub`，与主/副属性组完全同一 gap（6px） | verify §3 来源组 chip 间距实测 6px ✔ |
| R6 | 来源单选联动折叠 | render() 内 `showRaids = state.source!=='dungeon'`、`showDungeons = state.source!=='raid'`，对应 `<section>` 整段（含分组标题）条件渲染；「全部」均展开；与搜索/属性筛选叠加不变 | verify §4 三断言块：选团本→大秘境区块整段不渲染且 cards===nRaid；选大秘境→团本区块整段不渲染；回全部→两区块均展开还原全集 |
| R7 | 特效未溢出零 hover | measureEffectOverlays 实测未溢出 → 移除 has-effect 与展开层、预览还原全文（无 … 无 hover） | verify ①R7/R4 全页不变量断言：未溢出卡 N 张零 … 零展开层、溢出卡 M 张截…+续文逐字=全文（上古饥渴之心为未溢出实例，截图在案） |
| R8 | 饰品特效数据链取证与回填（BUG-061） | 见 §二 取证定位与三栏对账；sql/23 回填 3 条（只补缺不覆盖） | 三栏对账 36=36=36；台账已登记 |
| R9 | 装饰品/幻化排除 | sql/22：`get_public_loot_detail` 增排 `item_type IN ('装饰品','幻化')`（备份→SSH+docker exec→NOTIFY pgrst→回滚注释，纪律同 sql/19/20/21）；套装兑换物（鸣响虚空珍玩）保留不排除 | anon REST 复核：全集 342 / **S1 340 = 团本 136 + 大秘境 204** / 装饰品 0 行，与给定基线逐字一致；verify 三脚本期望值同口径 |
| R10 | 约束与文档 | 零依赖零构建；版本串 .25→.26 双头；台账 BUG-061 登记；changelog 四维补录（功能优化 + 修复BUG 两条，js/app.js changelogData 头部）；`docs/公示页筛选系统设计规范.md` 回写 R5/R6/R9（基线 343→340 口径作废）；`docs/魔兽管家UI设计规范v2.md` §4.4 全信息装备卡条款回写 v3 口径（恒占恒高废止/占位行废止/hover 续文展开/装饰品排除/BUG-061，标注日期 2026-08-08） | 本报告 + git diff |

## 二、R8 取证定位（BUG-061，证据三标）

**线上取证事实**（顾问已测，复核一致）：boss_loot 190 条 effect 非空仅 22；dungeon_loot 221 条非空仅 11；44 件公示饰品 39 件 effect/note 双空（溅暗恐惧之鳞、威厄高尔的最终凝视、光盲圣怒的连祷、游侠将军的虹彩徽章、双界行者的丝带、永恒之卵在列）。

**丢失环节定位结论：插件采集端（wjdc 1.0.6 导出原文 effect 即空串），非转换器、非入库。**

1. **导出原文核查**：`掉落导出.lua`（1.0.6 产出，409 物品）effect 非空仅 **36** 条——39 件双空饰品在导出原文里 `effect = ""` 就是空串。**源数据本身缺失，无源可回填** → 按 R8① 如实上报，**转插件侧另立案**（待插件修复采集后重跑导出→转换→回填，通道零改动复用）。
2. **converter 零丢失实证**：重跑 `scripts/wjdc_convert.py`（effect 直通 `s(it.get("effect"))`），产出含特效 **36** 条 = 导出 36，一件不差（产物 `backup/_pytmp/r8-out/`）。
3. **另查实 3 行历史装载批次漏回写**（导出/converter 都有 effect 但 DB 为空）：暮色怨灵的低语、圣光印记、多曼纳尔控制台（均属大秘境「维克雷尔之握」06dce908-a69a-4a31-b9a9-24e43ec5edbb）→ **sql/23 已回填**（UPDATE 1×3，只补缺不覆盖已有 33 条）。

**三栏对账表**：

| 环节 | 含特效物品数 |
|---|---|
| wjdc 导出原文（409 物品） | 36 |
| converter 产出 | 36 |
| 回填后 DB effect 非空（boss 22 + dungeon 14） | 36 |

三者一致，converter/入库环节修复闭环；剩余缺口全部挂在插件采集端（另立案）。

## 三、迁移执行记录

- **sql/22**（`sql/22_task028_wp3v3_rpc_exclude_cosmetic.sql`）：RPC 增排装饰品/幻化。执行通道 = sql/19/20/21 同款（备份→SSH+docker exec→NOTIFY pgrst→回滚注释），`SSH_PASS` 当次注入 `backup/_sshtmp/run-sql22-23.js`。执行输出：RPC 全集 342、装饰品/幻化零行、珍玩保留、行数零漂移 190/221。
- **sql/23**（`sql/23_bug061_dungeon_effect_backfill.sql`）：3 行 effect 回填，UPDATE 1×3，幂等可重跑。
- 注意坑（已规避）：DB `item_type='装饰'`（27 行住宅物件，含多曼纳尔控制台）≠「装饰品」，不在 R9 排除口径，未动。

## 四、verify 全绿输出（真浏览器 Playwright，页面 data.html，1366/1920/390 三档）

| 脚本 | 结果 | 覆盖 |
|---|---|---|
| `scripts/verify-task23-patch4.js` | **70/70** | 筛选条 v2.0 逐节、R5/R6、①hover 续文三张逐字+R7 全页不变量、WP3-1~12（RPC 通道/行序/行内等高/零点击/难度不显/星标三态/珍玩三行/缺数值卡/星标边界盒/R2 锚点/覆盖层动画白名单/reduced-motion/零挤压）、三级折叠+记忆、赛季重置、移动档折叠动画、零 JS 报错零 404 |
| `scripts/verify-task23-patch.js` | **33/33** | 参照集同口径增排装饰品/幻化后全绿 |
| `scripts/verify-task23-patch3.js` | **28/28** | 基线改 340、来源 chip 选择器适配 .dp-chip-sub 后全绿 |
| `npm test` | **5/5** | server-security 回归 |
| `scripts/verify-authz.js` | **34/34** | SEC-001 代理鉴权回归 |

验证日志：`backup/_pytmp/v3-patch.log` / `v3-patch3.log` / `v3-npmtest.log` / `v3-authz.log`；patch4 截图 `backup/2026-08-07-task23-patch4/`。

## 五、视觉四项证据（送审要求）

1. **星标边界盒**：`backup/2026-08-08-task28-wp3/v3-star-1366.png`（无羁圣光杖锤特写，⭐SVG 完整）+ verify WP3-11 边界盒数值断言（10×10、四边距 >0）。
2. **项链/戒指行距**：`v3-anchor-necklace-1366.png`（永恒虚空之歌项链：meta 后紧跟副属性行）、`v3-anchor-bond-1366.png`（圣光纽带同款）、`v3-anchor-heart-1366.png`（上古饥渴之心：主属性行后特效行上提、未溢出无 …）。
3. **两组 chip gap 实测值**：verify §3 输出——主属性组 6px ✔、来源组 6px ✔（同一 .dp-chip-sub 值）。
4. **hover 续文文本比对**：verify ① 输出三张卡「前缀+续文逐字=数据源全文」✔ + `v3-hover-continuation-1366.png`（艾林先知的凝视：预览截…、展开层仅续文、视觉接续在截断处之后）。

另：`v3-cards-1366.png` / `v3-cards-390.png`（内容驱动等高两档常态）。

## 六、改动文件清单

- `js/dataPublic.js` — R1–R7（itemCard 有数据行渲染、measureEffectOverlays 镜像实测切分、render 来源联动折叠、renderSourceChips 包 .dp-chip-sub、resize 重算）
- `css/data-public.css` — R1（.dp-item-stats 放开 overflow）/R3（删固定行高）/R4（.dp-item-effect-wrap + 续文展开层）
- `js/app.js` — changelog 补录 2 条（功能优化/修复BUG）
- `index.html` / `data.html` — 版本串 20260808.25→.26（8+6 处）
- `sql/22_task028_wp3v3_rpc_exclude_cosmetic.sql`、`sql/23_bug061_dungeon_effect_backfill.sql` — 均已执行
- `scripts/verify-task23-patch4.js` / `-patch.js` / `-patch3.js` — 断言适配 v3 口径
- `docs/问题与需求清单.md` — BUG-061 登记；`docs/公示页筛选系统设计规范.md`、`docs/魔兽管家UI设计规范v2.md` — 口径回写（标日期）

**未 commit、未 push，等运营验收。**
