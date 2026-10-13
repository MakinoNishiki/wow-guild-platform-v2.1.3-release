# 任务书 #64-补丁 — 修改报告（送审）

> 批次：任务书 #64-补丁（话术件 tasks/任务书64-话术-交付Code.md）
> 日期：2026-10-13 ｜ 类型：纯前端批（零 SQL / 零后端 / 零 schema）
> 引用规范：docs/开发规范.md（第三章修改纪律、第五章之二交付红线）、docs/UI工作方法-证据规范实现验收.md

---

## 一、三项补丁处置总览

| 补丁 | 话术要求 | 处置 | 结果 |
|---|---|---|---|
| ① 登录壳套装区同步「共X件」+展开明细 | 把 dataPublic.js 套装渲染逻辑同步到登录壳 | **零代码改动，核查销项**（话术第 64 行退路条款触发） | 真浏览器实测功能本就在场，证据见 §二 |
| ② 手动表单「所属团本」默认当前赛季 + BOSS 联动 | 默认只显当前赛季、历史折叠、BOSS 联动、两面板同治 | 已施工（optgroup 分组方案，话术允许「optgroup 或底部折叠区都行」） | verify 24/24 全绿 |
| ③ picker「所属团本」下拉 optgroup 赛季分组 | 上半区当前赛季/下半区历史赛季、「全部团本」默认 | 已施工 | verify 24/24 全绿 |

---

## 二、补丁①：核查销项（重要申报）

**话术前提**：「data.html（公示壳）套装区已实现『共X件』，但登录壳副本掉落页套装区完全没有这套逻辑」。

**侦察结论（证据档：已测量）**：该前提与代码事实相反。

1. REQ-148 实现位于**双壳唯一渲染层** `js/dataPublic.js`（`renderTierSets()` :790-836 / `tierTokenPieces()` :772-788 / 事件委托 :982-984），全链路**无任何壳分支**——无登录态判断、无 data-public-body 检查、无参数分化。
2. 任务书 #59 WP3 起 data.html 已是**纯重定向壳**（`location.replace` 跳 `index.html#/team/lootdrop`）：「公示壳」与「登录壳」渲染进**同一个 `#page-lootdrop` 容器**、同一份 `render()` 代码。「公示壳有、登录壳没有」在当前架构下不可能发生。
3. CSS（`.dp-tier-count`/`.dp-tier-pieces`，css/data-public.css:361-378）为全局 `.dp-` 类，登录壳由 index.html:11 引入，生效。

**真浏览器实测取证**（verify-task64-patch.js B1，登录态进 #/team/lootdrop 页签）：
- `.dp-tier-count` 徽标 **40 个**在场（>30 断言通过）；
- 点击首钮展开五件明细，部位序 = **[头部, 肩部, 胸部, 手部, 腿部]**，名称毒字头（毒铸雕像/残骸/圣像/神像/遗物）；
- sessionStorage `dp23:collapsed` 含 `tier:` 前缀键（记忆生效）；再点收起、明细消失、键移除。

**疑义来源推测**：①在 data.html 旧链接上验收被重定向后误判为两个页面；②验收时停留在 S1 赛季——S1 无对应族代币，`tierTokenPieces` 返回空属**设计内自然降级**（REQ-148 原文钉死）；③浏览器缓存 .84 旧版静态资源。若运营现场确有「看不到」的复现路径，请提供截图/赛季/浏览器版本，另行立案。

**处置**：按话术「先报告，不擅自改设计」条款，补丁①零代码改动销项。`git diff` 实证 dataPublic.js/lootTaxonomy.js/css 零触碰。

---

## 三、补丁②③：实际改动点

### 修改文件清单

| 文件 | 改动 | 原因 |
|---|---|---|
| js/app.js | 新增 3 个访问层助手 + 6 处调用点修改 + changelog 1 条 | 补丁②③ |
| index.html / data.html / decor.html | 版本串 20261013.85→.86（15/8/5 处） | 开发规范第五章第 6 条 + 话术约束 |
| scripts/verify-task64-patch.js | 新增验收脚本（24 断言） | 验收门禁 |
| docs/问题与需求清单.md | REQ-148/REQ-149 行补录 | 编号纪律 |
| AGENTS.md | 功能模块 7 REQ-149 括注补一句 | 文档同步纪律 |

### js/app.js 改动明细

**新增访问层助手（约 :288-330，getGameCurrentSeasonStart 之后，单一真源三处共用）**：
- `seasonOfRaidName(raidName)`：raid→season_id→game_seasons 行；主数据未载/链路缺数据返回 null 不报错。
- `getDefaultRaidName()`：当前赛季（is_current）首个团本名（sort_order 序）；主数据未载/无当前赛季回退原默认「虚影尖塔」。
- `buildRaidSeasonOptions(selectedRaid, appendOther, raidList)`：产出 `<optgroup label="当前赛季（S2）">` 置顶 + `<optgroup label="历史赛季（S1）">` 收尾 + 可选「其他」；**保留全量团本**（编辑/复制历史赛季记录不丢值）；is_current 缺失/主数据未载回退平面全量（既有行为）。

**补丁② 调用点（装备分配 + 心愿单两面板同治）**：
- `lootInitRaidSelect()`（:6159）：选项构建改 `buildRaidSeasonOptions(selectedRaid, true)`；默认参数 `'虚影尖塔'`→`''`（空值走 getDefaultRaidName）。
- `lootShowModal()` 两处：编辑 `loot.raid || ''`（:6622）、添加 `lootInitRaidSelect()`（:6649，原写死 S1「虚影尖塔」）。
- `wishlistShowModal()`（:7211-7213）：选项构建同款替换；编辑/复制/新增三处默认值 `'虚影尖塔'`/`getGameRaidNames()[0]` → `getDefaultRaidName()`。
- **BOSS 联动零改动**：`lootUpdateBossOptions()`/`wishlistOnRaidChange()` 既有链路（团本 change → getGameBossNames 精确过滤）自动跟随，实测联动正确。

**补丁③ 调用点**：
- `renderItemDbList()`（:12823-12831）：`#itemDbRaidFilter` 重建改 `'<option value="">全部团本</option>' + buildRaidSeasonOptions(cur, false, keys)`（keys=有掉落团本，口径不变）；「全部团本」置顶、选中值保持、REQ-149 列表区赛季折叠逻辑零触碰。

### 偏差申报（话术与 schema 冲突）

话术补丁③要求「赛季标签（S1/S2）从 `game_seasons.season_key` 读，不硬编码」。**schema（sql/10_master_data.sql:29-38）无 season_key 列**，game_seasons 仅 id/name/patch_id/start_date/end_date/is_current；全库 season 标识事实口径 = `name`（'S1'/'S2'）。按「零 SQL」约束无法加列，实现读 `season.name`（代码注释已钉死此偏差）。如运营要求 season_key 口径，需另立 SQL 批。

---

## 四、UI 审计前置问题清单（improve-ui，开工铁律第 4 条附档）

审计面：登录壳套装区 / 手动添加表单 / picker 团本下拉。三项话术待修项不计入发现。存活发现 2 条（**按「不顺手加功能」约束未施工**，供运营定夺是否另立批）：

| # | 问题 | 证据 | 建议改动 | 置信 |
|---|---|---|---|---|
| 1 | picker 装备卡 meta 行恒显空「装等」裸标签（主数据路径 itemLevel 硬编码空串，每卡渲染「…· 装等」后无数值） | app.js:12709 → :12847；违反 §4.4 R2「只渲染有数据的行」与 REQ-116「非空才渲染」同族口径 | meta 行按非空段拼接，装等空值不渲染 | 高 |
| 2 | picker 装备卡图标恒为 📦 emoji 占位，与同装备在公示页/分配列表的真实物品图标不一致 | app.js:12709（icon:'📦'）→:12844；§9/DESIGN.md「禁卡通图标」家族规则对 picker 卡的管辖性建议顾问裁定 | 改 assets/icons/items/{icon_id}.png + onerror 隐藏（REQ-092 已注册口径） | 中 |

已知取舍命中：无（移动封存/动画禁用等本审计面未触及）。

---

## 五、验证

### 自动化
- `node --check js/app.js`：通过（每次改动后均过）。
- **scripts/verify-task64-patch.js：24/24 全绿**（复刻 verify-task64.js 基建，端口 15665，独立测试账号/公会，用后清零）：
  - A 静态 8/8：三助手在场+三处调用、optgroup label+回退分支、版本串 .86 计数 15/8/5+旧串零残留、node --check、git diff 变更集=代码{app.js+三壳 html}+文档登记（AGENTS.md/台账/本报告），dataPublic.js/lootTaxonomy.js/css/server.js/track.js 零触碰（补丁①零改动实证）。
  - B 浏览器 15/15：B1 补丁①取证（见 §二）；B2 装备分配真点击「添加装备」→ #lootRaid 第一 optgroup `当前赛季（S2）`=[烈毒之渊,潮缚石窟]、默认选中=烈毒之渊（S2 首团本）、第二 optgroup `历史赛季（S1）`、「其他」在场、#lootBoss 默认 8 BOSS 属烈毒之渊、换虚影尖塔→联动切 6 个 S1 BOSS；B3 心愿单同款全过；B4 picker 首 option「全部团本」value=''+两档 optgroup、选虚影尖塔 60 卡全命中零越界、选回 '' REQ-149 折叠组在场且收起（回归不破）；B5 全程 console 零报错。
- 施工前基线：verify-task64.js 37/37 全绿（2026-10-13 复跑，证明施工起点健康；其 A5 版本串断言锁定 .85 属按批快照设计，本批后由 verify-task64-patch.js A3 接替口径）。

### 真浏览器主链路实测清单（交付红线 §2 可复核口径）
- 装备分配 → 「添加装备」按钮 → #lootModal：团本下拉分组/默认/BOSS 联动（B2）
- 心愿单 → 「添加心愿」按钮 → #wishlistModal：同款（B3）
- 装备分配 → #lootModal → 「📦 从装备库选择」→ #itemDbModal：下拉分组/过滤/折叠回归（B4）
- 登录壳 #/team/lootdrop 页签 → 套装卡「共X件」点击展开/收起/sessionStorage 记忆（B1）
- 保存链路未触碰（cloudCrud 路径零改动），故未做写库实测——改动纯下拉选项层。

### 观察项（非缺陷）
- 手动表单历史赛季 optgroup 含「至暗之夜」：该团本 season 归属落空（sql/25 回滚出库后 season 回挂 S1 途中态），按「保留全量团本」设计归入历史组；picker 筛选组不含它（其掉落已回滚出库，keys=有掉落团本）。两口径各自正确，如实申报。

---

## 六、遗留与纪律声明

- **git 未提交**（验收纪律：待运营验收通过后按话术文案提交「任务书#64-补丁：主应用套装同步+手动表单赛季匹配+picker下拉分组」——注：补丁①实为核查销项零改动，提交文案建议运营酌改为「任务书#64-补丁：手动表单赛季匹配+picker下拉分组（套装项核查销项）」，或维持原文按批留痕，请示下）。
- 三页面 console 零报错、零新增 404（B5 白名单冲抵后无残留；图标 404 为 REQ-150 在案的素材待入库已知项）。
- UI 审计 2 条发现未施工（§四），待运营定夺。
- data.html/decor.html 注释载「本壳引用资源变更时才随批递增」，本批按话术明确指令三壳同步 .86（话术优先，特此说明）。
