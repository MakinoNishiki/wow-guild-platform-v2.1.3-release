# 任务书 #51 WP1 侦察送审件（六项定案前报告）

> 日期：2026-09-18 ｜ 执行：Kimi Code ｜ 性质：**只读侦察，零代码改动、零写入**（anon 公开读通道，与公示页同通道）
> 侦察脚本：`scripts/recon-task51.js`（分页循环拉满 2062 行实证：1000+1000+62，PostgREST 单请求 1000 行上限坑实锤）
> 送审闸：③货币/物品映射草案、⑤宠物窝清单——**终审通过前不落常量**；④分类映射同送一并终审（侦察超预期产出）

---

## ① 图标命名实态（定案，可直接施工）

- 命名规则：**文件名 = icon_file_id（纯数字 fileID）.png**，全库 2062 件中 2021 件 icon_file_id 非空。
- 双向对账（库 ↔ 盘）：库有盘无 **0**、盘有库无 **0**、非数字命名 **0**——2021 张图标与库内 fileID 一一全等。
- 磁盘总数 2022 = 2021 图标 + `_placeholder.png`（128×128）。
- icon_file_id 为空 **41 件**：record_id = 1,2,3,6,7,8,9,10,11,12,13,14,15,48,50,113,132,151,223,233,273,277,281,282,283,285,286,287,288,289,290,291,292,294,296,297,307,400,401,4429,9627。
- **拼路径定案**：`<img src="assets/decor-icons/{icon_file_id}.png" loading="lazy">`；icon_file_id 为空直渲 `_placeholder.png`；`onerror` 再兜底 `_placeholder.png`（双保险，防磁盘缺图裂图）。
- 备注：任务书提到的 `icons_manifest.json` 本地不在仓库（属 #50 管道留档件）；前端**不需要** manifest——record_id↔fileID 映射即 `decor_catalog.icon_file_id` 列本身。

## ② 双壳机制与复用度清单（定案：机制沿袭、数据层新建）

副本掉落双壳机制实态（js/dataPublic.js + data.html + index.html + app.js）：

| 机制件 | 副本掉落现状 | 家宅图鉴定案 |
|---|---|---|
| 数据+渲染层 | `js/dataPublic.js` → `window.DPLootDrop = {mount(el), activate()}`，IIFE 单文件 | **新建 `js/decorData.js` → `window.DecorCatalog = {mount(el), activate()}`**，同构沿袭，不污染 dataPublic.js |
| 公开壳自动挂载 | `body.data-public-body` 类标记 → 文件末尾自动 `mount(document)` | 新标记类 `body.data-decor-body` → 自动挂载 |
| 登录壳懒挂载 | app.js `ensureLootdropMounted()`：首切 mount(#page-lootdrop)、再切 activate() | app.js 新增 `ensureDecorMounted()`（同构 3 行级函数）+ switchPage 挂点 |
| 配置获取 | `GET /api/supabase-config`（免登录端点）→ anon 直连 PostgREST | 同通道复用（零新增端点） |
| 词表单源 | `js/lootTaxonomy.js` 先于数据层加载 | **新建 `js/decorDict.js`**（映射常量唯一真源，③④⑤终审后落），先于 decorData.js 加载 |
| 样式 | `css/data-public.css`（.dp- 前缀 + 壳作用域，零泄漏） | **新建 `css/decor-public.css`（.dh- 前缀）**，不动 data-public.css 一个字符；btn/form-select/search-input/uc-input-wrap 等 main.css 通用件直接复用 |
| 三态/失败重试 | showError 友好重试界面、不白屏 | 同构复用模式 |

- **应用内最小入口**：侧边栏导航加「家宅图鉴」一项（`#page-decor` 页 + nav-item + switchPage 挂点），位置建议排在「副本掉落」之后——**上线前截图报运营确认**；导航分组重构与首页耦合不碰（#52 范围）。
- **WP2 公示壳形态建议（报运营定夺）**：**独立页 `decor.html`**（双向头部链接互通），而非 data.html 内嵌 tab。理由：自动挂载模式是「一页一模块一 body 标记」，内嵌 tab 会导致两个模块同页双拉数据且需为隐藏模块加启动门——独立页各自 URL 可分享、data.html 零风险、与「URL 不动可分享」哲学一致。任务书允许二选一（"同文件 tab 或独立页，以机制侦察结论为准"）。

## ③ 货币/物品中文名映射草案（送审闸①，顾问终审后才准落 js/decorDict.js）

出处：货币 = wago.tools DB2 `CurrencyTypes` 表 zhCN 官方客户端字符串全量导出（`https://wago.tools/db2/CurrencyTypes/csv?locale=zhCN`，12.x 正式服）；物品 = wowhead 中文官方页（URL slug 即官方译名）。**36/36 全查明，无存疑条目。**

### 货币 25 个

| ID | 中文名 | 英文名 | ID | 中文名 | 英文名 |
|---|---|---|---|---|---|
| 823 | 埃匹希斯水晶 | Apexis Crystal | 2657 | 迷之碎片 | Mysterious Fragment |
| 824 | 要塞物资 | Garrison Resources | 2803 | 晦幽铸币 | Undercoin |
| 1155 | 远古魔力 | Ancient Mana | 2815 | 共鸣水晶 | Resonance Crystals |
| 1220 | 职业大厅资源 | Order Resources | 3056 | 刻基 | Kej |
| 1508 | 黯淡的阿古尼特水晶 | Veiled Argunite | 3316 | 虚光灰岩 | Voidlight Marl |
| 1560 | 战争物资 | War Resources | 3363 | **社区礼券** | Community Coupons |
| 1710 | 海员达布隆币 | Seafarer's Dubloon | 3373 | 钓客珍珠 | Angler Pearls |
| 1767 | 冥殇 | Stygia | 3377 | 纯粹丰饶 | Unalloyed Abundance |
| 1792 | 荣誉点数 | Honor | 3379 | 满溢的奥能 | Brimming Arcana |
| 1803 | 尼奥罗萨的回响 | Echoes of Ny'alotha | 3392 | 痛苦残渣 | Remnant of Anguish |
| 1813 | 贮藏心能 | Reservoir Anima | 3405 | 战地奖赏 | Field Accolade |
| 2003 | 巨龙群岛补给 | Dragon Isles Supplies | 3448 | 腐蚀之币 | Corrosive Coin |
| 2118 | 元素涌流 | Elemental Overflow | | | |

### 物品 11 个

| ID | 中文名 | 英文名 |
|---|---|---|
| 37829 | 美酒节奖币 | Brewfest Prize Token |
| 113681 | 钢铁部落碎片 | Iron Horde Scraps |
| 137642 | 荣耀印记 | Mark of Honor |
| 166846 | 备用零件 | Spare Parts |
| 166970 | 能量电池 | Energy Cell |
| 168327 | 连锁点火线圈 | Chain Ignitercoil |
| 168832 | 电流振荡器 | Galvanic Oscillator |
| 169610 | S.P.A.R.E.零件箱 | S.P.A.R.E. Crate |
| 207026 | 梦涌凝珠 | Dreamsurge Coalescence |
| 225557 | 酷热燧烬花粉 | Sizzling Cinderpollen |
| 227673 | “金”鱼 | "Gold" Fish |

注意点：3363=**社区礼券**（12.x 家宅文化节/住宅区货币，DB2 描述实证），非任务书背景提示猜的塔罗牌票券；169610 官方名保留英文前缀；227673 官方名带引号「"金"鱼」建议原样保留。

## ④ 分类名可得性（超预期：全部可得，送一并终审）

结论：**可得**——8 主类 + 31 子类全部锁定（官方分类体系 wowhead 中/英导航 + wowdb Housing Hub 锚点物品逐件实证 × 库内 cat↔sub 交叉分布对号，非编造）。**分类筛选维度可直接用官方分类名，不需要退而用 tags 组代替**。

### 主分类 category_ids（8 个；7 为库内零出现弃用 ID）

| ID | 中文 | 英文 | 库内件数 | ID | 中文 | 英文 | 库内件数 |
|---|---|---|---|---|---|---|---|
| 1 | 家具 | Furnishings | 546 | 5 | 功能 | Functional | 24 |
| 2 | 构造 | Structural | 309 | 6 | 自然 | Nature | 144 |
| 3 | 点缀 | Accents | 772 | 8 | 杂项 | Miscellaneous | 93 |
| 4 | 照明 | Lighting | 232 | 9 | 房间 | Rooms | 39 |

### 子分类 subcategory_ids（31 个）

| ID | 中文 | 属于 | 件数 | ID | 中文 | 属于 | 件数 |
|---|---|---|---|---|---|---|---|
| 1 | 座椅 | 家具 | 108 | 17 | 墙壁灯具 | 照明 | 32 |
| 2 | 床铺 | 家具 | 30 | 18 | 吊灯 | 照明 | 43 |
| 3 | 门 | 构造 | 9 | 19 | 小型灯具 | 照明 | 44 |
| 4 | 建筑 | 构造 | 56 | 21 | 其他照明 | 照明 | 29 |
| 5 | 桌台 | 家具 | 129 | 22 | 效能 | 功能 | 10 |
| 6 | 储物 | 家具 | 243 | 25 | 大型植物 | 自然 | 24 |
| 7 | 其他家具 | 家具 | 44 | 26 | 小型植物 | 自然 | 17 |
| 8 | 窗户 | 构造 | 17 | 27 | 灌木 | 自然 | 27 |
| 9 | 大型构造 | 构造 | 119 | 28 | 地被植物 | 自然 | 18 |
| 10 | 其他构造 | 构造 | 111 | 29 | 其他自然 | 自然 | 69 |
| 11 | 观赏 | 点缀 | 347 | 34 | （全部） | 杂项 | 96 |
| 12 | 壁挂 | 点缀 | 146 | 35 | （全部） | 房间 | 39 |
| 13 | 食物和饮料 | 点缀 | 108 | 51 | 其他功能 | 功能 | 3 |
| 14 | 地板 | 点缀 | 83 | 52 | 藤蔓与悬挂植物 | 自然 | 5 |
| 15 | 其他点缀 | 点缀 | 128 | **53** | **宠物床** | 功能 | **11** |
| 16 | 大型灯具 | 照明 | 86 | | | | |

- 34/35 为单子类「（全部）」，界面直接显示父类名（杂项/房间）即可。
- sub 20（氛围照明）官方存在但当前空类故值域缺席；sub 23/24/30-33 与 cat 7 无公开名称，疑弃用 ID，不做占位映射。
- 一期筛选是否上「分类」维度（主类单选/多选），请运营定：任务书原六维未含分类，但数据已全通，加维度成本极低（建议加，与 WoWDB Housing Hub 参考系一致）。

## ⑤ 宠物窝候选清单（送审闸②——侦察发现更优数据通道，请定夺）

任务书原设想：can_customize=true + 名称/tags 关键词圈候选。实测发现 **can_customize 不是宠物语义**（= true 共 226 件，绝大多数是可定制家具如桌椅门窗），关键词法噪声大（「笼」误中 24 件灯笼）。

**更优发现：官方子分类 53 = 宠物床（Pet Beds），库内恰 11 件，零关键词零常量、数据驱动**：

| record_id | 名称 | can_customize | 备注 |
|---|---|---|---|
| 12245 | 萌爪伙伴狗窝和毯子 | true | 萌爪伙伴系列 |
| 12246 | 萌爪伙伴狗窝 | true | 萌爪伙伴系列 |
| 15290 | 爱宠地毯 | false | |
| 23549 | 宠物食水盆 | false | |
| 25101 | 西部荒野宠物笼 | false | |
| 25102 | 十字路口宠物笼 | false | |
| 25103 | 简陋的宠物笼 | false | |
| 25105 | 银月城龙鹰孵化器 | false | |
| 25106 | 惬意的光绽睡莲叶 | false | |
| 25121 | 惬意的鸟巢 | false | |
| 25122 | 忠诚伙伴的基座 | false | |

候选方案（请顾问/运营圈定）：

- **方案 A（推荐）**：「可放宠物」筛选 = subcategory_ids 含 53 的 11 件。官方分类直用、零静态常量、未来入库新件自动归入。
- 方案 B：萌爪伙伴系列 7 件（12244 食盆 / 12245 / 12246 / 12265 狗屋艾尔文屋顶 / 15547 杜隆塔尔屋顶 / 15548 永歌屋顶 / 15549 幽影谷屋顶，均 can_customize=true）——偏「功能宠物窝」窄口径，但漏宠物笼/鸟巢等且 12244 不在官方 53 类。
- 方案 C：A∪B 并集 16 件（A 加 12244/12265/15547/15548/15549）。
- 另：观赏向宠物主题件（858 狼人的鸡窝 / 9044 布伦纳丹鸡窝 / 2537 喂食槽 / 18794 葱郁花园兽栏）不在官方宠物床类，建议**不纳入**（装饰摆件非宠物功能件）。

## ⑥ 列表性能方案（定案）

- **分页每页 60 件 + `<img loading="lazy">`**，不自研虚拟滚动、零库。
- 全量 2062 件一次拉齐（3 页 REST 循环）后内存索引，筛选/搜索/翻页全程内存计算零请求；2062÷60 ≈ 35 页。
- 128px 图标网格，1366 档约 6 列 × 10 行 = 60/页正好一屏量级；筛选变更即时刷新 + 结果计数条「共 N 件 / 命中 X 件」。

---

## 附：侦察顺带发现（写进施工规格，不改变任务书设计）

1. **source_text 剥离规则须补 `|H...|h` 超链接标记**：887 件 source_text 含 `|Hcurrency:xxxx|h...|h`（任务书只列了 `|c`/`|r`/`|n`/`|T...|t`）。剥离全集 = `|cXXXXXXXX` / `|r` / `|n` / `|T...|t` / `|H...|h` / 残余 `|h`。
2. 兜底实证：sources 空 76 件 = 75 件 source_text 亦空（→「来源未知」，record_id 清单已留档 recon 输出）+ 25546 佩佩（source_text=「地区：烈风海岸 地区：创始者之角」原文兜底）——与任务书前置状态逐字吻合。
3. sources 类型分布实测：vendor 2045 / profession 330 / quest 326 / achievement 184 / drop 79 / shop 67 / treasure 14 / festival_note 6 / event 1（十类筛选签均有数据，无空类）；sql/31 注释提到的 renown 类型实态 0 出现。
4. price 五键形实测：gold 1155 / amount+currency_id 911 / amount+item_id 36 / amount+texture 20 / gold+silver 2——与任务书五键形规约吻合。
5. quality 值域 {0:2, 1:436, 2:1393, 3:214, 4:17}——**无 5（橙）**，品质色板 0-4 够用（5 色定义保留无害）。
6. size 列实态 = 尺寸 tag id（65 微小/66 小号/67 中号/68 大号/69 超大），39 件房间 size=0；详情弹窗 size 渲染走该映射（tags 里同 id 同名，可互证）。
7. placement_cost 值域含 12/16/18/20/100 等高价（房间类），容量档 1-2 / 3-4 / 5+ 分档不受影响。
8. UI 审计前置说明（AGENTS.md 铁律 4）：目标页面为**全新页面**无现状可审；参考系 = 副本掉落页（红线禁改）+ WoWDB Housing Hub。施工遵循 docs/魔兽管家UI设计规范v2.md 与 DESIGN.md；与已文档化取舍（桌面优先/移动封存、禁动画库）冲突的审计项将标「已知取舍」不计入问题清单。
