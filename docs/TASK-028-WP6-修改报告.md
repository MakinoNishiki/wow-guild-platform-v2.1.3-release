# 任务书 #28-WP6 修改报告（过滤器二期：F1 分类三级 + F2 来源实例级 + F3 筛选态平铺）

- 日期：2026-08-09 ｜ 站点版本串：**20260808.34**（双头 index.html 8 处 + data.html 6 处，旧串 .33 零残留；五轮补丁动了 css/html，.33→.34 递增，见 §七之五）
- 版本串跳号说明（运营 2026-08-09 指出）：WP3-v5 本地报告写 .28，但线上部署时实际按 .29 发布——同一版本串不得对应两次改动，故 WP6 跳过 .29、自 .30 起递增；verify 无版本串硬编码断言（仅校验 ?v= 存在性），无需同步改脚本。
- 前置：F1 映射表送审稿（`docs/TASK-028-WP6-F1映射表.md`）→ 运营 2026-08-09 终版裁定（覆盖此前全部口径），按终版施工
- 状态：**完工待验收，未 commit / 未 push**

## 一、F1 映射终版执行对照（运营裁定 → 落地 → 实测）

| chip | 谓词（终版） | 运营口径数 | 页面实测 | 结果 |
|---|---|---|---|---|
| 部位 12 项（P3 补丁增设「饰品」） | slot 等值 | 20/21/23/17/17/23/19/26/8/7/12/**40** | 头部+颈部 OR 抽验 27=27；饰品 40=40；逐 chip 结构断言 | ✔ |
| 单手 | item_type ∈ {单手剑,单手锤,单手斧,匕首,拳套,战刃,**魔杖**} | 36 | 36 | ✔ |
| 双手 | item_type ∈ {双手剑,双手锤,双手斧,长柄武器,**法杖**} | 20 | 20 | ✔ |
| 远程 | item_type ∈ {弓,弩,枪械}（非 slot 一刀切） | 6 | 6 | ✔ |
| 主手 | slot/item_type='主手' | 0 → chip 保留定义不渲染 | 武器 tab 实渲 4 枚（单手/双手/远程/副手），主手不在 DOM | ✔ |
| 副手 | slot='副手物品' | 6 | 6 | ✔ |
| 护甲 5 项 | item_type ∈ {板甲,锁甲,皮甲,布甲,盾牌} | 42/41/41/50/6 | 盾牌 6=6，且与 slot='副手' 同集（与武器-副手零重叠） | ✔ |

- 无归属 1 件（套装兑换物；P3 起饰品 40 件归部位）：选分类自然不命中，预期行为，未强行归类。
- 值域计数核对（顾问 18/22 vs 审计 18/23）：18/22 为 S1 口径；审计为 RPC 全池（含 S2 烈毒之渊 2 件），差异 = S2 的「戒指」1 个 item_type 值。**两口径一致，无矛盾**（S2 烈毒之渊 = WP2 误圈事件挪入的内克扎莉的兜帽+盘魂玺戒，前端按 is_current 过滤 S1 视图 308 零漂移）。
- 三级 chips 数据驱动：当季 0 命中不渲染；S2 有数据（含主手）自动出现，零改码。

## 二、F2 来源实例级

- 来源=团本/大秘境 → 来源组第二行展开实例 chips（sort_order 序、带 .dp-count 计数角标、单选、再点取消）；来源回「全部」或切赛季 → 实例行收起且选中态清空。
- S1 实测：团本 4 枚（梦境裂隙 8/虚影尖塔 60/进军奎尔丹纳斯 25/孢陨幽境 11，合计 104=nRaid；世界BOSS 至暗之夜不进 chips，R13 口径）；大秘境 8 枚（36/28/26/26/24/24/20/20）。
- 点「虚影尖塔」→ 秘境池整段折叠（R6）+ 团本池只剩虚影尖塔分组 + 卡片 60=60；再点取消 → 团本池恢复 104。

## 三、F3 筛选态平铺（双态）

- 触发：搜索/分类三级/主属性/副属性任一激活（仅开二级 tab 未选 chip 不算激活；仅选来源含实例保持浏览态）。
- 平铺态：无池标题无分组 + 顶部「命中 N 件」；实测爆击+精通 58 = REST 口径 58 逐字一致；排序 = 数据自然序（团本→秘境→BOSS 内序，复用浏览态同序遍历，未发明新排序）。
- 平铺态来源退化为纯过滤：团本+爆击+精通 22=22，仍平铺无分组（W5）。
- 0 命中空态：「命中 0 件」+「无符合条件装备」+ 内联「重置筛选」按钮 → 点击回浏览态双池全集 308（W6）。
- 套装一览区块双态常驻；套装兑换物平铺态正常命中；状态切换走既有 0.2s 卡片入场渐显（reduced-motion 降级不变）。

## 四、verify 全绿（证据三标，全部【已测量】真浏览器）

| 脚本 | 结果 | 说明 |
|---|---|---|
| verify-task23-patch4.js | **100/100**（WP6 主体 92/92 → 补丁一轮 98/98 → 补丁二轮 100/100） | §2 行序改五段（顶行/分类/主属性/副属性/来源）、1920 档 4 行→5 行；WP6 断言（F1 结构/12+4+5 chips/逐值映射对库/切换清空/OR、F2 实例计数/选中折叠/取消恢复、F3 平铺计数=REST/纯过滤/0 命中空态/空态重置）；补丁新增 6 项（P2 全部 tab 结构并入 F1 结构断言、P3 饰品 40=40、P4 置灰集逐值对库/原因提示+aria/已选不置灰/置灰不可点/重置恢复）；① hover 块整段重写为 P1 整卡生长（3 张长特效卡逐字核验 + R7/P1 全页不变量 + WP3-9 生长动画 + WP3-10 零挤压 + 1920 同款）；双视图一致回归挪浏览态「来源=大秘境」；**二轮：① 块改四态 textTop0（折叠/动画中段 100ms/展开/收回）+ wrap 视口裁剪判定 + noClampCss；R7 全页不变量改 wrap 判定 + ::after 伪元素 … 检查 + clamp 零残留；P4-补新增 3 断言（反馈即时出现含 cursor/title、点击无效、2s 渐隐）** |
| verify-task23-patch.js | **33/33** | 同上双视图块适配浏览态（参照集=大秘境全集），其余不动；二轮重跑确认 |
| verify-task23-patch3.js | **28/28** | 补丁适配 2 处：悬浮「覆盖层」断言改「整卡生长」（inner absolute 高度生长 + wrap max-height 过渡 200–300ms）、边框高亮断言改读 .dp-item-inner；二轮重跑确认 |
| npm test | **5/5** | 二轮重跑确认 |
| verify-authz.js（SEC-001） | **34/34** | 未碰写路径，二轮重跑确认 |
| 基线 | 308/104/204 不动 | patch4 基准行 + WP3-13 全页 308 张卡片断言在案 |
| console/404 | 零 JS 报错、零 404 | patch4 尾部断言 |

## 五、锚点截图（1366 档，`backup/2026-08-08-task28-wp3/`）

- `wp6-f1-weapon-tab.png` — 分类组第一组、武器 tab 展开 4 chips（主手不渲染）
- `wp6-f2-instance-bar.png` / `wp6-f2-instance-pool.png` — 来源=团本实例行带计数；虚影尖塔选中态：秘境池折叠、团本池只剩该本 60 件
- `wp6-f3-flat.png` — 爆击+精通平铺：「命中 58 件」、无池标题无分组
- `wp6-f3-empty.png` — 0 命中空态 + 重置引导
- 补丁锚点：`wp6p-p1-collapsed.png` / `wp6p-p1-hover-grow.png` — 艾林先知的凝视折叠态（2 行截断带 …、来源行贴底）vs hover 整卡生长（全文框内展开、来源行跟随新底部可见、覆盖下方区块不推挤网格）
- `wp6p-p2-cat-all-default.png` — 分类二级「全部」默认选中、三级区不渲染
- `wp6p-p3-slot-12.png` — 部位 12 项含「饰品」末位
- `wp6p-p4-chip-disabled.png` — 力量+敏捷选中 → 部位 chips 置灰（颈部/手指在列，背部/饰品保活）
- 补丁二轮锚点：`wp6p2-grow-f0.png` ~ `wp6p2-grow-f4.png` — 凝视 hover 生长连帧（0/60/110/160/260ms），控制台逐帧实测特效文本 top 偏移全 0（零重排零抖动）；`wp6p2-disabled-feedback.png` — 力敏下点击置灰「颈部」→ 筛选条下浮出原因提示「『颈部』在当前组合下无命中：该类别装备均不含所选属性」+ chip 抖动，置灰虚线淡化生效
- 补丁三轮锚点：`wp6p3-collapsed-ellipsis.png` / `wp6p3-ellipsis-zoom.png` — 凝视折叠态与省略号特写：「…持续12秒。激活期间，施放」字字完整，… 在右侧占位带内零压字（BUG-066）；`wp6p3-grow-mid.png` / `wp6p3-grow-full.png` / `wp6p3-grow-backmid.png` — 覆盖式生长连帧：整卡向下生长遮盖下一行（运营认可形态）、来源行跟随新底部、邻卡零位移（patch4 五帧 rect 断言在案）；`wp6p3-toast.png` — 置灰 toast 视口底部居中（筛选条与「命中 24 件」均无遮挡）；`wp6p3-sticky-scrolled.png` — 平铺态滚 900px 后「命中 149 件」在吸顶条末行完整可见零半裁

## 六、改动文件清单

- `data.html` — 分类组 DOM（第一组）+ 来源组实例行容器；布局注释回写；**三轮：#dpFlatHead 并入 .dp-filterbar 末行（P4-再补②）**
- `js/dataPublic.js` — state（catL2/catSel/sourceInstance）+ CAT_TABS（P2 加「全部」）/CAT_CHIPS（P3 加「饰品」）终版映射 + seasonLoot + renderCategory/renderInstanceChips + matchItem→matchExcept 拆组（P4）+ refreshChipAvailability（P4）+ isFlatMode/flatOrderedItems + render 双态分支 + resetFilters 扩展；P1：itemCard 包 .dp-item-inner、measureEffectCards 重写（镜像只测溢出 + 溢出卡预设折叠态 minHeight，旧二分截断/建 overlay 逻辑拆除）；**P4-补：chipDisabledFeedback(ch,label)——shake 类 200ms（void offsetWidth 重启动画）+ #dpChipHint（absolute 贴筛选条底、role=status、cause 拼接文案、2s 渐隐），三处 chip onclick 守卫改调它；三轮：P1-再补 measureEffectCards 顺序改「清类回流态→量折叠态高→加类+写 minHeight」（inner 常驻 absolute 的前置）；P4-再补① #dpChipHint 废弃改 #dpChipToast 挂 body；P4-再补② render 平铺态命中计数写 #dpFlatHead（浏览态 hidden），主内容流旧 .dp-flat-head 移除**
- `css/data-public.css` — .dp-cat-tabs/.dp-cat-tab（chip 体系加粗）/.dp-instance-row/.dp-chip-inst 计数角标/.dp-flat-head/.dp-empty-actions；P1：卡盒样式迁 .dp-item-inner + hover 整卡生长（inner absolute + wrap max-height 动画）+ .dp-item-effect-overlay 规则删除；P4：.dp-chip-disabled；**P1-补：废弃 line-clamp——preview 改纯 block 全文排版（clamp 规则与 hover 释放规则全删），折叠态 = wrap max-height:34px+overflow:hidden 纯视口裁剪，省略观感改 ::after 渐变遮罩（hover 时 content:none），hover overflow-y:auto 故意不加（滚动条改宽度会引重排）；P4-补：.dp-chip-shake/@keyframes dpChipShake/.dp-chip-hint/.show + reduced-motion 降级；事故修复：一轮 §6 例外注释内 `.dp-detail-*/` 含 `*/` 毒丸提前闭合注释、吞掉 .dp-chip-disabled 整条规则（一轮置灰视觉实际从未生效，二轮 cursor 断言抓出），注释改全角 ＊ 修复，probe 实测 cursor:not-allowed/opacity .4/border dashed 生效；三轮：P1-再补 溢出卡 inner 常驻 absolute（hover 仅加投影/z-index 挂外层）+ .dp-footer padding-bottom 200px 末行溢出缓冲带；BUG-066 wrap padding-right:18px 全态恒定 + ::after 收窄带内纯色底（渐变废除）；P4-再补① .dp-chip-hint 全删改 .dp-chip-toast（fixed 底部居中、主应用通知形态、pointer-events:none）；P4-再补② .dp-flat-head 改吸顶条末行规格**
- `scripts/verify-task23-patch4.js` / `verify-task23-patch.js` / `verify-task23-patch3.js` — 断言适配 + WP6/P1–P4 新增（patch3 适配 P1 生长与 inner 边框 2 处）；二轮：patch4 ① 块四态 textTop0 + wrap 视口裁剪 + noClampCss + R7 不变量改 ::after 判定 + P4-补 3 断言，文首注释回写；**三轮：patch4 ① 块 innerPos/back.pos 改常驻 absolute + z 改读外层 + BUG-066 三断言（占位带恒定/渐变零残留/Range 字形零压字容差 1px）+ P1-再补邻卡五帧 rect 零位移 + P4-再补① toast 化（fixed/pointer-events）+ P4-再补② 吸顶容器与三档滚动 2 断言 + flat 判定改 hidden 口径 ×7 + §2 barKids 三元**
- `js/app.js` — changelog 四维补录「新增功能」一条（details 含 P1–P4 四行 + 二轮 P1-补/P4-补 两行 + 三轮 P1-再补/P4-再补/BUG-066 三行，标题「含 P1–P4 补丁及二轮/三轮修订」）
- `docs/公示页筛选系统设计规范.md` — **v3.3**（v3.0–v3.2 废止）：P2 全部 tab（§2/§3）、P3 饰品 12 项（§4-2）、P4 置灰（§3 规格表/§6 交互）、P4-补 置灰点击反馈、**P4-再补① toast 化（§3 置灰态行）+ P4-再补② 命中计数并入吸顶条（§7）**，标注日期
- `docs/魔兽管家UI设计规范v2.md` — §4.4 装备卡条款回写 P1 整卡生长（浮层条款废止）+ §6 注册 max-height 高度动画例外（理由+日期）
- `index.html` / `data.html` — 版本串 20260808.29→.30→.31→**.32**（8+6 处，含顶部注释记录行；.29 为 WP3-v5 线上占用，见文首跳号说明；P1–P4 一轮同包复用 .30，二轮递增 .31，**三轮补丁动了 js/css/html，递增 .32，.31 零残留**）

## 七、WP6 补丁 P1–P4（2026-08-09 运营体验终审追加，一轮同包复用 .30；二轮修订递增 .31，见 §七之二）

| 补丁 | 口径 | 落地 | 实测 |
|---|---|---|---|
| P1 hover 形态重构（最高优先级） | 废弃独立浮层遮盖；hover 卡片本体（含边框）经平滑高度动画向下生长、特效全文框内展开、来源行动态跟随至新底部全程可见；生长部分 z-index 提升覆盖下方卡片、不推挤网格；离开动画收回 | 卡盒结构改 `.dp-item`（网格占位锚点）> `.dp-item-inner`（卡盒样式+flex 列）；hover 时 inner 转 absolute 高度内容驱动、`.dp-item-effect-wrap` max-height 34px→260px 200ms ease-out；JS 对溢出卡预设折叠态 minHeight 防网格塌陷（两趟测量防 layout thrash）；预览恒为全文（CSS line-clamp:2 只负责折叠态视觉截断带 …）；`.dp-item-effect-overlay` 全部规则与 JS 二分截断/建层逻辑拆除；reduced-motion 瞬时 | patch4 ① 块 3 张长特效卡逐字核验（折叠截断→生长展开→离开收回全链路）、R7/P1 全页不变量（未溢出 1 张零截断零 hover、溢出 7 张、零 overlay DOM）、WP3-9 动画规格、WP3-10 邻卡零位移、1920 档同款——全绿；锚点「艾林先知的凝视」截图对比在案 |
| P2 分类组默认锚点 | 二级 tab = 全部（默认选中）/部位/武器/护甲；「全部」= 未启用分类过滤，三级区不渲染；切换清空三级规则不变 | CAT_TABS 头部加 `{key:'',label:'全部'}`（带 .dp-chip-all 供重置断言豁免） | patch4 F1 结构断言 4 tab+全部默认 active+三级行不渲染；截图 p2 在案 |
| P3 部位增设饰品 | 部位 11→12 项加「饰品」（slot='饰品'，40 件）；珍玩维持无归属（桶 41→1，预期行为） | CAT_CHIPS.slot 末位加「饰品」 | patch4 断言 饰品 40=40；截图 p3 在案 |
| P4 筛选联动置灰 | 任何筛选条件下实时计算每个未选 chip 在「其他组条件+搜索」下的命中数；0 命中置灰不可点（视觉降级+悬浮原因提示+aria-disabled）；已选恒不置灰；禁止自动清除已选；0 命中空态+重置引导保留；纯前端内存计算不新增接口 | `matchExcept(l, skip)` 拆组跳过 + `refreshChipAvailability()`（render 尾部每次刷新，覆盖主属性/副属性/分类三级/来源实例级四组；来源一级 chips 不做——单选+全部锚点语义）+ 三处 chip onclick 置灰守卫 + `.dp-chip-disabled`（opacity .4+虚线描边+not-allowed） | patch4 P4 断言 5 项：力量∧敏捷下部位 12 项置灰集=库内口径逐值一致（锚点颈部/手指在列）、原因提示+aria、已选力量/敏捷不置灰、置灰点击无效（不选中不清除）、重置全恢复；截图 p4 在案 |

- §6 白名单例外已注册（`docs/魔兽管家UI设计规范v2.md` §6，2026-08-09）：P1 整卡 max-height 高度动画——理由「整卡框内展开+来源行跟随」是运营终审指定形态，transform/opacity 无法实现框内高度生长；浮层 opacity/transform 旧条款同步标注废止。
- 规范回写：`docs/公示页筛选系统设计规范.md` 升 **v3.1**（P2 全部 tab 进 §2 布局图+§3 分类条款、P3 饰品进 §4-2 映射表、P4 置灰进 §3 规格表+§6 交互）；`docs/魔兽管家UI设计规范v2.md` §4.4 装备卡条款回写 P1 生长口径（浮层条款废止）。
- changelog WP6 条目 details 补 P1–P4 四行（js/app.js，标题同步加「含 P1–P4 补丁」）。

## 七之二、WP6 补丁二轮（P1-补 生长防抖 + P4-补 置灰反馈，2026-08-09 运营追加，版本串 .30→.31）

| 补丁 | 口径 | 落地 | 实测 |
|---|---|---|---|
| P1-补 生长防抖 | 废弃 line-clamp 截断（动画中 clamp 释放导致文本逐行重排抖动）；特效文本恒一次性完整排版、永不重排；折叠态 = 容器 2 行高 overflow:hidden 纯视口裁剪；hover 动画作用于容器高度（视口扩大）、文本零位移；省略观感用渐变遮罩/伪元素对齐现状；reduced-motion 降级不变 | preview 改纯 block 全文排版，CSS clamp 规则与 hover 释放规则全删（库内零残留，patch4 noClampCss 断言在案）；wrap 加 `max-height:34px; overflow:hidden; transition:max-height .2s ease-out`；省略观感 = `.dp-item.has-effect .dp-item-effect-wrap::after`（`…` + padding-left 22px 渐变遮罩，hover 时 `content:none`）；hover 不加 overflow-y:auto（滚动条改宽度会引重排，违背零位移） | patch4 ① 块改四态 textTop0 断言（折叠/动画中段 100ms/展开/收回，全程 `getBoundingClientRect().top` 偏移 0）+ wrap 视口裁剪判定全绿；连帧截图 f0–f4（0/60/110/160/260ms）控制台逐帧实测 top 偏移全 0，目检无抖动 |
| P4-补 置灰反馈 | 置灰 chip 不得死无反馈：①cursor:not-allowed；②点击 → chip 抖动 200ms + 筛选条下浮出一行原因提示（如「『颈部』在当前组合下无命中：该类别装备均不含所选属性」），2s 渐隐；③title 悬浮保留；aria-disabled 与点击守卫不变 | `chipDisabledFeedback(ch,label)`：shake 类 200ms（`void ch.offsetWidth` 强制重排重启动画）+ `#dpChipHint`（absolute 贴 .dp-filterbar 底、role=status、cause 拼接、2s 后移除 .show 渐隐）；三处 chip onclick 置灰守卫改调它；CSS：.dp-chip-shake/@keyframes dpChipShake（translateX ±3px）+ .dp-chip-hint/.show + reduced-motion 降级 | patch4 P4-补 3 断言全绿：点击置灰「颈部」反馈即时出现（shake 类+hint 可见+文案含部位名与原因+cursor:not-allowed+title）、守卫依旧不选中不清除、2s 后渐隐；锚点截图 wp6p2-disabled-feedback.png 在案 |

- **事故如实上报（证据三标）**：一轮交付时 css 注释内 `.dp-detail-*/` 含 `*/` 毒丸，提前闭合注释把 `.dp-chip.dp-chip-disabled` 整条规则吞掉——**一轮置灰视觉（opacity .4/虚线/not-allowed）实际从未生效**，逻辑置灰（aria-disabled/点击守卫/原因 title）不受影响；二轮 P4-补 cursor 断言跑出红才暴露。已把该注释改全角 `＊` 修复，probe 实测 cursor:not-allowed / opacity .4 / border dashed 生效，patch4 100/100 复核。
- verify 二轮输出：patch4 **100/100**（98→100，新增 P4-补 3 断言，① 块改四态 textTop0、R7 全页不变量改 wrap+::after 判定）、patch **33/33**、patch3 **28/28**、npm test **5/5**、SEC-001 **34/34**，全绿；console 零报错、零 404；基线 308/104/204 不动。
- 版本串 .30→.31（双头 index.html 8 处 + data.html 6 处，含注释行；.30 零残留）。
- 文档回写：`docs/魔兽管家UI设计规范v2.md` §4.4（P1-补 视口裁剪口径）+ §6（P1-补 延续既有 max-height 例外、P4-补 shake/hint 在白名单内说明）；`docs/公示页筛选系统设计规范.md` 升 **v3.2**（§3 置灰态行加点击反馈规格）；changelog WP6 条目 details 补 P1-补/P4-补 两行、标题改「含 P1–P4 补丁及二轮修订」。

## 七之三、WP6 补丁三轮（P1-再补 覆盖式生长 B2 修复 + P4-再补①② + BUG-066，2026-08-09 运营追加，版本串 .31→.32）

| 补丁 | 口径 | 落地 | 实测 |
|---|---|---|---|
| P1-再补 覆盖式生长（B2❌ 修复） | .dp-item 网格占位高度恒定 = 折叠态高度；hover 生长由 inner 向下溢出实现，网格行高全程不变；z-index 抬升整卡（边框+内容+来源行）向下生长遮盖下一行（运营已认可）；独立浮层/来源行被遮不得复燃；二轮成果（文本一次性排版+视口裁剪零重排）保持；收回对称零牵连；末行溢出不得抖滚动条；reduced-motion 保留 | **根因实锤**：旧实现仅 :hover 时 inner 才 absolute——鼠标移出瞬间 inner 回文档流而 wrap 260→34 收缩动画仍在进行，200ms 内 in-flow inner 被撑高牵连整行、动画结束回落（与运营诊断一致）。修复：溢出卡 inner **常驻 absolute**（生长/收回全程不入流）；JS measureEffectCards 改「先清 has-effect/minHeight 回内联流态 → 量折叠态高 → 再加类+写 minHeight」顺序（absolute 后外层失去内容撑高，顺序反了占位=0）；z-index 抬升改挂外层 .dp-item；页末 .dp-footer padding-bottom 200px 缓冲带吸收末行向下溢出 | patch4 新增「全页邻卡 rect 展开/收回连帧零位移」断言（0/100/450ms 展开 + 收回中段/完成五帧，全页非悬停卡 top/height 逐字一致）；① 块 innerPos 折叠态即 absolute、back.pos absolute（收回不入流）；连帧截图在案 |
| BUG-066 省略号遮罩压字 | 折叠态 ::after 渐变遮罩覆盖特效行末完整文字（「全暗。」「持续」被遮）；改 wrap 恒定 padding-right ≈1.5em 占位带、… 放带内零压字、渐变废除或收窄带内；padding 全态恒定零重排；hover content:none 保留 | wrap `padding-right:18px`（1.5em@12px）全态恒定（hover 同宽，零重排红线不破）；::after 收窄至带内 `width:18px` 纯色底（--bg-card），**渐变遮罩废除**；镜像测量随 preview.clientWidth 自适应（含 padding） | patch4：Range 末行字形右缘 ≤ 带左缘断言（3 锚点卡）+ hover 态 padR 恒定 + R7 全页渐变零残留/占位带全量检查；实测 CJK 标点挤压亚像素越线 ≤0.7px（… 字形带内居中墨线起点距带缘 ≥2px，视觉零压字，断言容差 1px 注明）；R7 未溢出样本本轮为 0（占位带缩窄后 8 张特效卡全部溢出，断言放宽并注明库实况） |
| P4-再补① 置灰提示 toast 化 | .dp-chip-hint 在筛选条下方浮出遮挡「命中 X 件」；改 fixed 定位 toast 复用主应用通知形态；2s 渐隐、点击守卫、抖动、title 全保留 | #dpChipToast 挂 body：fixed 视口底部居中、不透明底（--bg-secondary）+3px 左边线+投影（main.css .toast 同款形态）、pointer-events:none 不挡交互、z-index 2000、2s 渐隐；旧 .dp-chip-hint 规则与元素创建全删 | patch4 P4-补块适配：toast 即时出现（fixed 定位+pointer-events:none 断言新增）、文案含「颈部」与原因、2s 渐隐、守卫不变——全绿；锚点截图在案 |
| P4-再补② 滚动半裁修复 | 页面下滚筛选条吸顶时三级 chips 行与「命中X件」被吸顶区半裁遮盖并停留；吸顶改一个整体容器 sticky（统一背景+z-index，内部各行不互相半裁）；「命中X件」并入吸顶块末行恒可见或置块外滚走（二选一） | 取「并入」：#dpFlatHead 常驻 DOM 为 .dp-filterbar 末行（.dp-filter-rows 之外，移动端折叠筛选时仍可见），浏览态 hidden、平铺态填「命中 N 件」；.dp-filterbar 本即整体 sticky+不透明底+z-index 10（统一性断言锁定）；主内容流内旧 .dp-flat-head 渲染移除 | patch4 新增 2 断言：吸顶容器统一性（sticky+不透明背景+z-index+head 在条内）+ 平铺态 300/900/1800 三档滚动命中计数恒完整可见（在条内、在视口内，零半裁）；§2 结构断言同步（barKids 三元） |

- verify 三轮输出：patch4 **103/103**（100→103：新增 P1-再补邻卡连帧、P4-再补② 容器/滚动 2 条；① 块与 R7 不变量按三轮口径适配）、patch **33/33**、patch3 **28/28**、npm test **5/5**、SEC-001 **34/34**，全绿；console 零报错、零 404；基线 308/104/204 不动。
- 版本串 .31→.32（双头 index.html 8 处 + data.html 6 处，含注释行；.31 零残留）。
- 文档回写：`docs/魔兽管家UI设计规范v2.md` §4.4（P1-再补 覆盖式生长 + BUG-066 占位带口径）+ §6（三轮延续说明）；`docs/公示页筛选系统设计规范.md` 升 **v3.3**（§3 置灰态 toast 化、§7 命中计数并入吸顶条）；台账登记 **BUG-066**（省略号遮罩压字，✅ 已修复待验收）；changelog WP6 条目 details 补三轮三行、标题改「含 P1–P4 补丁及二轮/三轮修订」。

## 七之四、WP6 补丁四轮（BUG-067 溢出判定改无 padding 测量 + BUG-068 hover 动画双向对称，2026-08-09 运营追加，版本串 .32→.33）

> 新规范《开发规范增补-经验教训-20260809》即日生效后首个补丁：§1 副作用审计单（本节目录末正式版）、§2 样式生效值断言、§3 动画双向连帧、§4 数据样本前提声明已全量执行。F2 按任务书红线「先侦察后动手」——侦察结论 + 修法先行送审，运营 2026-08-09 裁定方案 A 照此施工、「单帧跳变 ≤50%」按逐帧（rAF）口径。

| 补丁 | 口径 | 落地 | 实测 |
|---|---|---|---|
| BUG-067 溢出判定改无 padding 测量 | 渲染时逐卡一次性测量：临时去带、按无 padding 宽度读特效排版——≤34px（2 行）恰好放下 = 不加带、不标溢出、无省略号、无 hover 展开（回归 R7）；>34px 才加带（占位带+::after 省略号+hover 展开，维持三轮现状）；测量顺序不变（清类回流态→测量→定类），hover 全程宽度不变，零重排不破 | `.dp-item-effect-wrap` 基础规则删 `padding-right:18px`，新增 `.dp-item.has-effect .dp-item-effect-wrap { padding-right:18px }`（带=溢出卡专属；::after 本就挂 has-effect 天然跟随）；清类后所有卡即无带态，镜像 `preview.clientWidth` 自动=无 padding 全宽——判定逻辑零改动即切换口径 | patch4：R7 全页不变量改分态生效值断言（溢出 18px/未溢出 0px，§2）+ shortSeen≥1 硬断言恢复；**上古饥渴之心实测回归全宽无带态**（2 行整行直显、无 …、无金色描边、无 hover），锚点截图 `wp6p4-fit-card.png` 在案；溢出 7 卡行为零变化（glyphClear/textTop0/邻卡五帧 rect 全绿） |
| BUG-068 hover 动画双向对称 | 展开/收回同一驱动路径，双向 200ms 平滑对称；无瞬时跳变、无分段卡顿 | **侦察结论（送审存档）**：台账「JS 内联写高时序不同步」猜测不成立——hover 链路零 JS（全文件仅 resize 一个监听器）；根因 = hover 目标值 260px 恒定封顶使 max-height 插值行程（34↔260）远大于可视行程（34↔内容高 ≈51-85px）：展开前段触顶观感瞬时、收回前段静止末段急降观感双段。**修法（方案 A，运营批准）**：驱动路径不动，measureEffectCards 镜像对溢出卡按加带宽度复测全文高写 `--fx-full`（260 仅兜底），hover 规则改 `max-height: var(--fx-full, 260px)`——插值行程=可视行程，双向 200ms ease-out 严格对称；纯 CSS 零新增 JS 事件路径；reduced-motion 0s 降级不变 | patch4 新增 rAF 逐帧双向连帧断言：展开/收回逐帧单调连续（±0.5px）、**单帧跳变 ≤ 总行程 50%（逐帧口径，运营裁定）**、粗点位 0/60/140/260ms 连续、60ms 反病态（展开未走完=非瞬时、收回已离起点=无双段）、260ms 双向到位、展开终态=--fx-full 实测值（85px）±1.5px——全绿 |

- verify 四轮输出：patch4 **104/104**（103→104：R7 不变量分态化+样本恢复、BUG-068 双向连帧新增、BUG-067 逐卡对照输出）、patch **33/33**、patch3 **28/28**（适配 1 处：悬浮生长断言 `maxH>100` 改 `34<maxH≤260`——260 恒定封顶废止的预期适配，生长语义不变）、npm test **5/5**、SEC-001 **34/34**，全绿；console 零报错、零 404；基线 308/104/204 不动（WP3-13 全页 308 张卡片断言在案）。
- 版本串 .32→.33（双头 index.html 8 处 + data.html 6 处，含注释行；.32 零残留）。
- 文档回写：`docs/魔兽管家UI设计规范v2.md` §4.4（占位带改溢出卡专属 + hover 目标值 --fx-full 口径）+ §6（例外目标值改逐卡实测、占位带专属化延续说明）；台账 BUG-067/068 转「已修复待验收」；changelog WP6 条目 details 补四轮两行、标题改「含 P1–P4 补丁及二轮/三轮/四轮修订」。

### §1 修复副作用审计单（正式版，规范增补 20260809 §1）

| 触及约束 | 可能影响 | 验证方式 | 结果 |
|---|---|---|---|
| 宽度（占位带 全卡恒定→溢出卡专属） | 未溢出卡文本变宽 18px 回全宽（=修复目标）；溢出卡零变化 | R7 分态生效值断言（§2：溢出 18px/未溢出 0px）+ 逐卡对照表（下） | ✔ 全绿 |
| 高度（hover 目标值 260 恒定→--fx-full 逐卡实测） | 展开终态高度不变（本就内容触顶）；动画行程/时长比例变（=修复目标） | 双向连帧断言终态=--fx-full ±1.5px + after.grown/textFull/srcFollows 既有断言 | ✔ 全绿 |
| 排版 | 恰好放下卡行尾贴 wrap 右缘（任务书明示正常；卡级 padding 仍保间距） | R7 不变量 + 锚点截图目检 | ✔ 截图在案 |
| 图层 z-index | 不触及（z-index:30 规则未动） | ① 块 after.z==='30' 既有断言 | ✔ 全绿 |
| 动画时序 | transition 属性/时长/缓动未动，仅目标值来源变；reduced-motion 0s 不变 | WP3-9（200ms ease-out max-height）/WP3-9b（0s）既有断言 + 双向连帧 | ✔ 全绿 |
| 数据样本前提 | R7 未溢出样本 0→恢复（本轮核心收益，见 §4 声明） | shortSeen≥1 硬断言 + 断言文案输出样本数 | ✔ 样本=1 |
| 邻接元素 | 网格占位/minHeight 逻辑未动 | 邻卡五帧 rect 零位移断言 + 基线 308/104/204 | ✔ 全绿 |
| 拿不准点 | 「单帧跳变 50%」口径歧义（逐帧 vs 粗采样点） | 已随侦察结论送审，运营 2026-08-09 裁定逐帧口径 | ✔ 已裁定 |

**8 张特效卡逐卡前后状态对照**（patch4 逐卡对照输出实测；「前三轮」= 占位带全卡恒定时 8 张全溢出）：

| 卡 | 前三轮 | 四轮 | --fx-full |
|---|---|---|---|
| 上古饥渴之心 | 溢出（带+…+hover）**误判** | **恰好放下：全宽无带、无 …、无 hover（R7 回归）** | — |
| 艾林先知的凝视 | 溢出 | 溢出（带+…+hover，5 行）零变化 | 85px |
| 至暗之夜的眼眸 | 溢出 | 溢出（5 行）零变化 | 85px |
| 捕魂者的咒符 | 溢出 | 溢出（5 行）零变化 | 85px |
| 暮色怨灵的低语 | 溢出 | 溢出（5 行）零变化 | 85px |
| 幽影羽毛 | 溢出 | 溢出（3 行）零变化 | 51px |
| 孢子大王的菌丝徽记 | 溢出 | 溢出（3 行）零变化 | 51px |
| 圣光印记 | 溢出 | 溢出（3 行）零变化 | 51px |

**--fx-full 实测值正确性**：双向连帧断言锁定展开终态=--fx-full ±1.5px（85px 卡实测）；3 行卡 51px=3×17、5 行卡 85px=5×17，与行高严丝合缝。**resize 重测覆盖**：既有 resize 防抖重算路径自动重测并刷新 --fx-full（patch4 ①[1920] 块覆盖 1920 档重渲后生长全链路，全绿）。**兜底 260 退化路径**：若 JS 未运行或 --fx-full 未写入（无 JS 环境/极端竞态），`var(--fx-full, 260px)` 回退 260——退化为三轮旧行为（功能正确、仅动画观感回旧），不产生破损态。

### §4 数据样本前提声明（规范增补 20260809 §4）

- R7「未溢出特效卡」断言依赖库内样本：**本轮未溢出样本 = 1 张（上古饥渴之心）、溢出样本 = 7 张**（S1 库实况，patch4 断言文案已输出样本数）。
- 对比：三轮时占位带全卡恒定致 8 张全溢出、未溢出样本 = 0（当时已在报告注明放宽）；本轮样本恢复为 1，shortSeen≥1 硬断言复位——样本再次归零时断言将直接跑红，不再静默放宽。
- BUG-068 双向连帧断言样本 = 1 张溢出卡（视口内首张 has-effect），行程 34→85px 真实覆盖。

## 七之五、WP6 补丁五轮（BUG-069 z-index 层级修正，2026-08-09 运营追加，版本串 .33→.34）

| 补丁 | 口径 | 落地 | 实测 |
|---|---|---|---|
| BUG-069 滚动后展开卡覆盖吸顶筛选条 | 层级规约：sticky 筛选条 ＞ hover 展开卡 ＞ 普通卡（#dpChipToast fixed 底部独立层不动）；hover 卡降至筛选条之下、普通卡之上，「遮盖下一行卡」形态不破；任意滚动位置 hover：卡上半被筛选条正常遮挡、向下展开部分正常可见 | 根因实锤：三轮覆盖式生长 hover 卡 `z-index:30` 越过 sticky 筛选条 `z-index:10`。`.dp-item.has-effect:hover` z-index 30→5（grid 项目直接生效，无需 position）；其余层级消费者一律未动 | patch4 新增 BUG-069 断言：构造「卡顶没入吸顶条下 12px」重叠区（两段式滚动：先让条进 sticky 态再精调）→ 坐标直达 hover（绕开 page.hover 自动 scrollIntoView）→ 重叠区 elementFromPoint 命中条内元素（条在上层）+ 展开下端命中卡内元素（遮盖下一行不破）+ zBar=10/zCard=5 生效值——全绿；① 块与 ①[1920] 块 z 断言 30→5 同步适配 |

- verify 五轮输出：patch4 **105/105**（104→105：BUG-069 断言新增）、patch **33/33**、patch3 **28/28**、npm test **5/5**、SEC-001 **34/34**，全绿；console 零报错、零 404；基线 308/104/204 不动。
- **如实申报**：BUG-069 断言首跑 1 红——断言自身用条未吸顶时的 rect 算滚动位（sticky settled 后条底上移，重叠区未造成），非产品代码问题；改两段式滚动后复跑全绿，已在脚本注释留痕。
- 版本串 .33→.34（双头 index.html 8 处 + data.html 6 处，含注释行；.33 零残留）。
- 文档回写：`docs/魔兽管家UI设计规范v2.md` §4.4 + §6（层级规约注册）；台账登记 **BUG-069**（已修复待验收）；changelog WP6 条目 details 补五轮一行、标题改「含 P1–P4 补丁及二轮/三轮/四轮/五轮修订」。

### §1 修复副作用审计单（正式版）：全站 z-index 层级树清单

| 层 | 元素 | z-index | 位置 | 本轮 | 确认 |
|---|---|---|---|---|---|
| 加载遮罩 | .loading-overlay（main.css:2744） | 9999 | fixed | 未动 | 主应用元素，公示页无此 DOM，无越层 |
| toast 独立层 | #dpChipToast（data-public.css:406）/ .toast（main.css:1579） | 2000 | fixed 底部/顶部 | 未动 | 任务书明示独立层不动；公示页无 .toast DOM |
| 弹层 | 上下文菜单（main.css:3883） | 1001 | absolute | 未动 | 主应用元素，公示页无此 DOM |
| 弹窗 | .modal-overlay（main.css:612） | 1000 | fixed | 未动 | 主应用元素，公示页无此 DOM |
| 移动端底 tab | 底部导航（main.css:2063） | 999 | fixed | 未动 | 主应用元素，公示页无此 DOM |
| 侧边栏 | .sidebar（main.css:54） | 100 | fixed | 未动 | 主应用元素，公示页无此 DOM |
| 下拉建议 | 自动补全下拉（main.css:3402） | 100 | absolute | 未动 | 主应用元素，公示页无此 DOM |
| 页头 | page-header（main.css:166） | 50 | sticky | 未动 | 主应用元素，公示页无此 DOM |
| **吸顶筛选条** | **#dpFilterBar**（data-public.css:38，#dpFlatHead 命中计数行在条内同层） | **10** | sticky | 未动 | **规约上界确立**；P4-再补② 容器断言（sticky+不透明+z≥10）保持绿 |
| 下拉列表 | 主应用下拉（main.css:3688） | 10 | absolute | 未动 | 主应用元素，公示页无此 DOM |
| **hover 展开卡** | **.dp-item.has-effect:hover**（data-public.css:371） | **30→5** | grid 项 | **本轮唯一调整** | 5＜10 不越筛选条、5＞auto 仍盖普通卡；「遮盖下一行」形态实测不破（lowHitCard） |
| 表头/首列 | 主应用表格 sticky 列（main.css:3771/3777/4092） | 1/3/2 | sticky | 未动 | 主应用元素，公示页无此 DOM |
| 普通卡/折叠头/装饰 | .dp-item、.dp-boss-name/.dp-raid-name/.dp-section-collapser、装饰圆点（main.css:1925） | auto/1 | 文档流 | 未动 | 折叠头无 z-index 不进层竞；hover 卡 5 仍在其上 |

- 逐项结论：公示页实际在 DOM 的层级消费者仅三枚——筛选条（10) / hover 卡（30→5) / chip-toast(2000)；本轮仅调 hover 卡一层，无越层、无回退；main.css 各层在主应用页面，公示页无对应 DOM，零影响。
- 回退兜底：hover 卡 z-index 5 相对普通卡（auto/同级定位元素）仍严格上层，覆盖式生长形态（三轮成果）与 BUG-068 双向对称动画（四轮成果）均无耦合——邻卡五帧 rect 零位移断言、rAF 双向连帧断言本轮保持全绿。

## 八、任务书口径偏差点（已在断言与文档注明）

任务书 §验收「三级 chips 数量 11/5/5」与运营 2026-08-09 终版「主手全库 0 命中、chip 保留定义不渲染」冲突——按终版执行（武器实渲 4 枚），verify 断言 12/4/5（部位 12 = 11 + P3 饰品）+ 主手定义保留注释；S2 若录入主手数据自动回升 5 枚，断言需同步加 1（已在代码注释与本文留痕）。

## 九、遗留

- 零依赖零构建；未动 sql/RPC/主应用逻辑；390px 移动档随 patch4 §8 断言通过（折叠面板内分类组同形态可用）。
- WP3-v5（R12 返修）报告 `docs/TASK-028-WP3-修改报告v5.md` 同步待验收，与本包互不依赖。
