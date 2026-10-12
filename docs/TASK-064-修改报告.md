# TASK-064 体验批 修改报告（送审）

> 任务：任务书 #64 体验批（纯前端，零后端零 DB 迁移）
> 施工：Kimi Code ｜ 日期：2026-10-13
> 范围：REQ-148 套装共X件展开 / REQ-149 picker 当前赛季默认+历史折叠 / BUG-108「主题风格」改名+文案 + 顺手修两项

---

## 一、修改文件清单

| 文件 | 改动 | 原因 |
|---|---|---|
| js/lootTaxonomy.js | 新增 CLASS_ARMOR（13 职业→护甲）/ ARMOR_TOKEN_FAMILY（族→护甲）词表并导出 | REQ-148 词表单一真源（REQ-091 职业筛选落地时同源复用，禁第三份映射） |
| js/dataPublic.js | 新增 TIER_TOKEN_SLOT_WORDS / tierTokenPieces()；renderTierSets 卡头加「共X件」钮 + 展开明细行 | REQ-148 |
| css/data-public.css | 新增 .dp-tier-count / .dp-tier-pieces / .dp-tier-piece / .dp-tier-piece-name | REQ-148（已 DESIGN.md 登记） |
| js/app.js | renderItemDbList 分组（当前赛季直显+历史折叠组）；toggleItemDbHistory()；openItemDbPicker 复位；changelog 三条补录 | REQ-149 + 更新日志门禁 |
| css/main.css | 新增 .item-db-history 四件 | REQ-149（已 DESIGN.md 登记） |
| js/decorData.js | 筛选组「资料片」→「主题风格」+ 说明文案；两处注释同步 | BUG-108 前端批 |
| js/decorDict.js | EXPANSION_TAGS 注释改「主题风格」口径（常量名不动） | BUG-108 前端批 |
| css/decor-public.css | 新增 .dh-group-note | BUG-108（已 DESIGN.md 登记） |
| index.html / decor.html / data.html | 版本串 20260923.84 → 20261013.85（15/5/8 处） | 缓存版本号规约（见第四节申报） |
| docs/问题与需求清单.md | BUG-108 优先级 P1→P2 + 落地注记；REQ-148/REQ-149 登记 | 顺手修 + 编号纪律 |
| docs/BUG-108-装饰版本标签勘定报告-送审.md | 头部补「批次：…转 #64 批」 | 顺手修 |
| DESIGN.md | 任务书 #64 登记（三族新类） | 规范登记 |
| scripts/verify-task64.js | 新建（A 静态 24 + B 浏览器 12 + C 清零 1） | 验收 |

## 二、实现要点与口径决策

### REQ-148 套装一览「共X件」（js/dataPublic.js）
- 卡头右侧胶囊钮「▸ 共X件」，点击就地展开明细行 `部位 · 兑换物名`（部位按 LootTaxonomy.SLOT_OPTIONS 序：头/肩/胸/手/腿）；展开态复用 dp23:collapsed 折叠集（sessionStorage），**tier: 前缀「在集合=展开」与区块级「在集合=折叠」语义分化**（代码注释钉死，toggleCollapse 为纯翻面通用件）。
- **数据口径（关键决策）**：明细 = 该职业护甲族的**套装兑换物（代币）**——职业→护甲（CLASS_ARMOR）→族（ARMOR_TOKEN_FAMILY）→ boss_loot slot='套装兑换物' 且名称族前缀命中，部位由兑换物 effect 文本（「制造一件…套装头盔/护肩/胸甲/护手/护腿」）解析，赛季归属走 兑换物 boss_id→game_bosses→raid_id→game_raids.season_id 与套装卡对齐。
- 族→护甲依据：12.0 起官方代币按护甲分组（[52pk 分组机制](https://wow.52pk.com/shtml/20251103/7602536.shtml)），S2 毒渊族名经 [wow.gg 毒渊攻略](https://wow.gg/zh-cn/guides/venomous-abyss) 实证：毒织=布甲/毒咒=皮甲/毒锻=锁甲/毒铸=板甲。
- **REQ-089 红线遵守**：真实套装件名未入库（规则表送审中），本功能只读既有兑换物行、零数据写入、基线 308/104/204 不动；REQ-089 落地后仅切换 tierTokenPieces 数据源，样式不动（注释钉死）。
- 降级：赛季无对应族代币（S1 仅珍玩且 effect 为空解析不出部位）→ 不渲染标识，不报错。

### REQ-149 picker 当前赛季默认（js/app.js）
- renderItemDbList 过滤后按 `raidId → game_raids.season_id` 与 `MasterData.getCurrentSeason()`（game_seasons.is_current）分组：当前赛季直显（计数「共 N 件装备」= 当前赛季件数），历史赛季收进底部「▸ 历史赛季团本（N 件）」折叠组。
- **任一筛选生效（搜索/团本/首领/部位/武器/护甲/副属性）历史组自动展开**——搜索与筛选结果不藏；手动展开态仅本次打开内有效（openItemDbPicker 复位为折叠默认）。
- is_current 缺失时不分组全量直显，绝不空列表；装备分配/心愿单两面板同一弹窗同治（先例）。

### BUG-108 前端批（js/decorData.js / js/decorDict.js）
- 筛选组名「资料片」→「主题风格」，组头下加灰色小注「按装饰的主题风格归类，非物品加入版本」（.dh-group-note）。
- 内部键名 state.expansion / EXPANSION_TAGS 维持不变（零逻辑改动），注释同步勘定口径；数据面零改动（维持 #63 WP1 顾问裁定）。

### 顺手修
- 台账 BUG-108 级别 P1→P2 并补 #64 落地注记；REQ-148/149 按编号纪律登记。
- 勘定报告头部补批次行「前端修正步转 #64 批（2026-10-13 已落地）」。

## 三、UI 开工审计（improve-ui 口径，证据三标）

| 面 | 结论 | 标记 |
|---|---|---|
| 套装一览卡 | 仅套装名+2/4 件效果，无件数与明细可见性——即 REQ-148 登记问题本身；本批修复 | 已测量（源码+浏览器） |
| 装备库 picker | S1/S2 全量平铺 196 件，当前赛季焦点被稀释——即 REQ-149 登记问题；本批修复 | 已测量（浏览器 92+104） |
| 图鉴筛选组 | 「资料片」组名与暴雪主题标签语义错位（BUG-108 勘定案）——本批修复 | 已测量（勘定报告+浏览器） |
| 其余候选 | 三面无新增可支撑发现；移动端/动画库等属文档化已知取舍（v2 §8/§9），不入问题清单 | — |

## 四、验证（verify-task64.js 37/37 全绿，两轮连跑一致）

**A 静态 24 项**：词表/渲染/CSS/文档登记锚点；版本串 20261013.85 实查 **index×15 / decor×5 / data×8，旧串 .84/.83 零残留**；node --check 五 js 全过；server-security 回归全过；冻结项零触碰（track.js/server.js/cloud.js/masterData*/sql/addon 不在变更集）。

**B 浏览器（真 Chromium，自起 server.js:15664，双壳）**：
- B1 公示壳（免登录 `#/team/lootdrop`）：40 张 S2 套装卡徽标 40/40「共5件」→ 点击展开 5 行（部位序精确=头/肩/胸/手/腿，名称=毒铸雕像/残骸/圣像/神像/遗物）→ sessionStorage dp23:collapsed 含 tier: 键 → 再点收起明细消失且键移除。
- B2 公示壳（免登录 `#/house/decor`）：「主题风格」组名+说明文案在场，「资料片」三字筛选区绝迹。
- B3 登录壳（自建测试 owner 账号/公会，用后清零）：
  - 副本掉落页签徽标 >30（双壳同源）；
  - **picker 主链路实测**：装备分配 →「+ 添加装备」→「📦 从装备库选择」→ 默认直显 92 件全部当前赛季（烈毒之渊/潮缚石窟，越界 0）+ 底部折叠组「历史赛季团本（104 件）」→ 手动展开出 S1 卡（梦境裂隙等 104 件）→ 部位筛选「饰品」历史组自动展开（共 15 件）→ 选中首卡 → 确认选择 → 弹窗关闭 + 装备名「强血者的仪式切肉斧」回填分配行（既有链路零回归）。
- B4 三页面 console 零报错（白名单仅：物品图标 404=素材待运营入库 REQ-092/150 在案、装饰缺图 onerror 回退 #51 在案、user_profiles 409 设计内噪音）。

**C 清零**：测试公会/测试账号删除复核为零。

## 五、申报与遗留

1. **版本串范围申报**：运营指令为 index 15 处 + decor.html 5 处；本批改动了 dataPublic.js（data.html 亦引用），按开发规范第五章 6 条「凡改动 js/css 的 commit 必须同步递增」，data.html 8 处一并递增（三壳同值 20261013.85）。
2. **CLASS_ARMOR 键名抓获**：词表首版按 REQ-091 文档措辞用「潜行者/萨满祭司」，B1 实测 6 卡（盗贼 3+萨满 3）无徽标抓获——键名已按 game_classes.name_zh 库内现值「盗贼/萨满」订正并注释钉死。
3. **REQ-148 明细名称=兑换物名**（非真实套装件名）：REQ-089 展开未施工，真实件名无数据源（禁编造）；REQ-089 落地后切换数据源即可，样式与交互不动。
4. S1 赛季套装卡无「共X件」标识（S1 仅珍玩兑换物且 effect 为空），属数据驱动自然降级，非缺陷。
5. changelog 缺口申报（不顺手原则未补）：任务书 #59~#63 条目未补录更新日志，与本批无关，建议运营定夺是否回溯补录。
6. 本批零 DB 迁移、零后端改动、零埋点改动；git 未提交（验收纪律）。

## 六、真机复核入口

- 公示壳：`index.html#/team/lootdrop`（套装一览）、`index.html#/house/decor`（主题风格组）
- 登录壳：装备分配 → + 添加装备 → 📦 从装备库选择（默认 S2，底部历史组）
- 回归：`node scripts/verify-task64.js`（37/37）
