# 任务书 #65（扩展版）WP2+WP3 — 修改报告（送审）

> 批次：任务书 #65（tasks/任务书65-扩展版.md）
> 日期：2026-10-13 ｜ 执行范围：**WP2（SQL+导入入口）→ WP3（前端接入）串行**；WP1（插件端 Lua）按运营指示另行排期，不在本批
> 引用规范：docs/开发规范.md（第二章 2.3 schema 纪律、第三章、第五章之二交付红线）

---

## 一、范围与前置声明

- **WP1 插件端**：运营另行排期（原话「我帮你写插件端 Lua 代码，需要另外排期」）。本批 WP2 导入验证使用按任务书 §WP1.3 格式合成的 JSON；待 WP1 真实导出落地后由运营实导。
- **WP2.1 SQL 执行权**：本机环境无 SSH_PASS（.s6-ssh/run.js 执行通道凭据只走环境变量，.env 内无此键），`sql/37_task065_icon_name_tier_set_pieces.sql` 已按惯例出稿（幂等+回滚说明+NOTIFY），**待运营执行**（或提供 SSH_PASS 由我按「备份→docker exec→NOTIFY→复核」执行）。验收脚本迁移相关断言（M 组）已做存在性门禁，执行后重跑 `node scripts/verify-task65.js` 自动生效。

## 二、改动明细

### 修改文件清单

| 文件 | 改动 | 归属 |
|---|---|---|
| sql/37_task065_icon_name_tier_set_pieces.sql | 新建：icon_name 两列 + tier_set_pieces 建表（幂等/回滚/NOTIFY） | WP2.1 |
| server.js | MASTER_TABLES 白名单 +tier_set_pieces（:784） | WP2.1 配套 |
| js/app.js | WP2.3 导入三函数 + WP3.1 图标 + WP3.2 套装录入模块 + WP3.3 徽标 + 弹窗脏判定登记 + changelog 三条 | WP2.3/WP3 |
| index.html | lootModal/wishlistModal 套装块 DOM + 模式切换钮 | WP3.2 |
| css/main.css | .item-card-icon-img + #65 节套装录入样式族（零新色值） | WP3 |
| DESIGN.md | #65 登记节（四个新类） | 文档纪律 |
| 三壳 HTML | 版本串 20261013.87→.88（15/8/5） | 规范第五章 |
| scripts/verify-task65.js | 验收脚本（37 断言 + 迁移门禁 M 组） | 验收门禁 |
| docs/问题与需求清单.md | REQ-155 销号转 REQ-157；REQ-156/157/158 登记 | 编号纪律 |
| AGENTS.md | 数据库表清单/主数据层/装备分配模块三处同步 | 文档纪律 |

### WP2.1 SQL（sql/37）
- `boss_loot` / `dungeon_loot` `ADD COLUMN IF NOT EXISTS icon_name TEXT`（可空逐步填充；icon_id 共存禁删改红线遵守）。
- `tier_set_pieces` 建表：UNIQUE(season_id, tier_set_id, slot) + 双索引 + RLS 公开只读策略（写入走代理 service_role 超管分支）。
- **偏差申报**：公示页公开 RPC `get_public_loot_detail` 为显式字段白名单，本批**不改 RPC**——icon_name 不透出公示页（WP3 仅 picker 消费，走 MasterData authenticated 直读）。如需公示页图标另立批 CREATE OR REPLACE。

### WP2.3 套装数据导入（数据中心→套装 tab「📥 套装数据导入」）
- 复用 #mdEditorModal 两段式（克隆掉落批量录入模式）：粘贴 JSON → 解析并预览 → 确认导入。
- 校验：version≥1.1.0 且 exportType='tier_sets'（逐段数值比）；匹配链 season 名→game_seasons、className/specName→game_classes/game_specs→tier_sets 行（season_id+class_id+spec_id）；未匹配红字注明原因并排除。
- 导入：pieces→{season_id, tier_set_id, slot, item_name, official_item_id, icon_name, ilvl, armor_type}，`mdUpsert('tier_set_pieces', rows, 'season_id,tier_set_id,slot')` 幂等；成功 toast「成功导入 N 件，覆盖 M 个专精」。
- 迁移未执行时确认导入报「tier_set_pieces 表未就绪（sql/37 待执行）」弹窗不关不白屏（实测在案）。

### WP3.1 picker 图标（REQ-157，REQ-155 销号转入）
- `getMasterLootItems` 透传 `iconName: l.icon_name || ''`；cardHtml 图标位白名单校验（`/^[A-Za-z0-9_\-]+$/`）后渲染 `render.worldofwarcraft.com/icons/56/{icon_name}.jpg`（lazy + onerror 回退 📦），空值维持 📦。
- CDN 实测：56/36 两规格 200（curl）——#66 挂起的 zamimg 路线作废原因=其中 medium 路径按图标名键控、与数字 fileDataID 不兼容（真浏览器 4 个真实 icon_id 全败/命名对照成功），#65 改 Blizzard render CDN + icon_name 方案为此正解。

### WP3.2 套装快捷录入（#lootModal/#wishlistModal 同源）
- 标题行右侧「普通装备/套装装备」切换钮（默认普通，打开复位）。
- 套装块：职业 select（MasterData.getClasses，回退常量）→ 专精 select（getGameSpecs 联动，未选职业禁用占位/换职业清空）→ 套装名只读行（当前赛季+class_id+spec_id 查 getTierSets；未命中明示「该职业专精当前赛季无套装记录」并禁选部位）→ 部位胶囊五枚**单选** → 名称自动拼接 `setName + ' ' + SLOT_SUFFIX[slot]`（头盔/肩甲/胸甲/护手/腿甲），可手改且不被覆盖（仅重新选部位/专精时重写）→ 大类自动置「防具」、部位下拉同步。
- 保存链路零改动（lootSave/wishlistSave 原样）。
- **偏差申报**：①任务书示意 category「护甲」，lootSlotMap 实际大类值为「防具」，按实值（注释钉死）；②任务书 status='pending' 为英文示意，实际走既有默认「待分配」（且 loot_records 无 status 物理列，状态为 item_stats jsonb 映射语义）；③部位「单选/多选」原文未定，按线框图单选实现（一次一件），待运营确认；④心愿单弹窗 modalDirtyChecks 为新登记（规范 4.6 强制）——ESC/遮罩关闭心愿弹窗从此有未保存二次确认，属顺水行为变化。

### WP3.3 装备列表套装标识
- `tierSetBadgeHtml(name)`：全赛季 getTierSets 收集 set_name，名称前缀命中 → 🏷️套装 徽标（.tag 体系）；接入 lootRender 装备名单元格。心愿单列表未接（任务书 3.3 只点名装备分配列表，不扩）。

## 三、验证（verify-task65.js 37/37 全绿，版本串 .88 复跑同绿）

真浏览器（Chromium，端口 15667，独立测试账号/公会，用后清零复核）：
- B1 装备分配主链路：「添加装备」→切套装模式→死亡骑士→鲜血→套装名「灾厄墓骑的熔炉」自动带出→部位头部→名称自动「灾厄墓骑的熔炉 头盔」+大类/部位自动置位→手改名称保持→**保存写库落行**→列表 🏷️套装 徽标在场→测试行删除清零。
- B2 心愿单同款链路（腿部→「…腿甲」→成员勾选→落库）。
- B3 picker：196 卡全 📦（icon_name 列不存在属迁移前预期）、零 CDN img、零报错。
- B4 导入入口：按钮在场→合成 JSON（1 套 5 件）解析预览绿行件数=5→确认导入迁移门禁中文报错不白屏。
- B5 全程零 TypeError、console 零报错（白名单冲抵后无残留）。
- M1/M2/M3（实导/落库/幂等）：表 404 → SKIP，sql/37 执行后自动生效。
- A 静态锚点 19 条全绿；node --check 全 js 通过；#64/#66 逻辑零触碰。

## 四、遗留与纪律声明

- **git 未提交**（验收纪律）。commit 文案建议：`任务书#65：WP2 套装数据导入+WP3 picker图标与套装快捷录入（WP1 插件另排期）`，三段式描述按 §二/§三 摘要。
- **待运营执行**：sql/37（备份→docker exec→NOTIFY→复核，或给我 SSH_PASS 代执行）；执行后重跑 verify-task65.js 使 M 组断言生效，并以 WP1 真实导出 JSON 实导 100 件验收。
- **待运营确认**：部位胶囊单选 vs 多选。
- **观察项**：线上 tier_sets 存在 class_id 关联为 NULL 的行（REST 嵌入 game_classes 返回 null），不影响按 class_id+spec_id 匹配，请运营知悉（如需清理另立案）。
- WP1 插件验收清单（任务书 WP1 验收 10 项）随 WP1 排期再行。
