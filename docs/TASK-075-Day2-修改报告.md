# 任务书 #75-Day2 修改报告：拾取记录子标签 + 插件导入页

> 日期：2026-10-15 ｜ 执行：Kimi Code ｜ 范围：Day 2 前端导入页（REQ-163）
> 验证：`scripts/verify-task75-day2.js` **19/19 全绿**（A 静态 11 + B 门禁组 6 + C 清零 1+前置 1；全链路组 B4-B6 因 sql/42 未执行 SKIP，执行后复跑自动走全链路）
> 版本串：三壳 `20261014.95` → `20261015.96`（15/8/5，旧串零残留）
> **未 commit 未 push**：改动在工作区待开核

---

## 一、修改前输出（规范 3.1）

| 文件 | 位置 | 原因 | 影响与风险 |
|---|---|---|---|
| js/cloud.js | reloadData/saveCloudData 双 case + 两函数 | lootDrops 数据通道 | 新 dataType，既有类型零触碰 |
| js/app.js | appData 初始化 + 套装区后新增 #75 区块 + lootRender 末尾一钩 + 两处 .view-tab 选择器收窄 | 子标签/拾取视图/导入弹窗 | 见下文「顺修」风险说明 |
| index.html | #page-loot 内（子标签/双视图容器/拾取工具区/导入按钮）+ lootModal 后导入弹窗 | 页面骨架 | 分配记录视图 DOM 原样包进容器，零结构改动 |
| css/main.css | .drop-import-zone 三规则 | 拖放区样式 | 深色主题变量，圆角 6px ≤8 |
| 三壳 | 版本串 .96 | 规范 5.6 | — |
| docs/问题与需求清单.md | REQ-163 Day2 段 | 编号纪律 | — |

## 二、UI 审计前置（铁律 #4，improve-ui 规程）

- **审计面**：index.html #page-loot 装备分配页 + lootRender 链路 + 工具区/表格区。
- **治理规范**：docs/魔兽管家UI设计规范v2.md（§4 组件/§4.9 空态/§10 评审闸）。
- **结论：零支持性发现**。loot 表空态有文案+引导钮（§4.9 合规）；工具区/表格均为既有注册组件族；新增「页内子标签」复用 `.view-tab` 族（数据中心 mdTabs 先例），不构成新组件，§10 评审闸不触发；移动端/响应式类属已知取舍-封存（§8），不计入。

## 三、实际改动点

1. **cloud.js**：`lootDrops` 通道注册——reloadLootDrops（SDK 直读，RLS 公会成员可读，timestamp 倒序）+ syncLootDrop（add→dbInsert 代理 / delete→dbDelete）；行保持 snake_case 直存；PostgREST 1000 行上限申报在案（流水超阈值再扩翻页）。
2. **拾取记录子标签**：装备分配页内「分配记录 / 拾取记录」双视图（.view-tab 族）；拾取视图 = 玩家/装备名搜索 + 副本下拉（数据驱动）+ 日期筛选 + 表格（时间/玩家/装备名前置图标 REQ-092 口径 lazy+onerror/装等/部位/难度/首领/副本）+ 空态引导钮（§4.9）。
3. **懒加载**：每公会首次切入才拉表（登录初始加载零膨胀），切公会/导入成功后重载。
4. **导入弹窗**：拖放区（click 选文件 + dragover/drop，复用同一 FileReader 链）+ 粘贴文本 + 解析预览（勾选/全选/清空；已存在标记跳过、缺字段标红禁用）+ 确认入库；重复检测键 = 拾取者+物品+时刻（与 sql/42 `uq_loot_drops_event` 唯一索引同口径）；批量写 = 规范 1.2.2 批处理例外（逐行 saveCloudData + 统一 reload 一次，注释自引）；部分失败保弹窗现场可重试；modalDirtyChecks 登记（规范 4.6）。
5. **迁移门禁**：loot_drops 表未就绪（42P01/PGRST205/404）→ 空态区中文提示「拾取记录表未就绪（sql/42 待运营执行）」+ 重试钮，不白屏；导入写库撞门禁 → toast 同文案 + 弹窗不关。
6. **顺修（最小必要，申报）**：考勤页两处 `.view-tab` 全局选择器收窄为 `#page-attendance .view-tab`——新增子标签后全局选择器会误伤 loot 页 tab 激活态（同函数误伤数据中心 mdTabs 系由此发现的存量隐患，一并不再发生）。

## 四、验证（真浏览器主链路）

- **A 静态 11/11**：通道/函数族/双规范登记/选择器收窄/重复检测键同口径/DOM/CSS/版本串 15/8/5 零残留/node --check 全量。
- **B 门禁组（loot_drops 未就绪实测路径）**：子标签在场默认分配记录；切拾取记录视图显隐+激活态迁移正确；门禁中文提示不白屏；分配记录还原回归；考勤页 view-tab 恰一个激活（收窄零误伤）；全程零 TypeError / console 零报错。
- **B4-B6 全链路组（解析预览→入库→列表渲染→重复导入跳过→筛选）**：已写好待 sql/42 执行后复跑（探测 200 自动走全链路）。
- **C 清零复核**。

## 五、待办与申报

1. **sql/42 执行在运营侧**：本机无 SSH_PASS 执行通道（.s6-ssh/run.js 需环境变量）。通知里的 scp 路径有误（`/mnt/agents/output/sql/42-loot-drops-table.sql`），实际文件 = 仓库 `sql/42_task075_loot_drops.sql`。执行后复跑 `node scripts/verify-task75-day2.js` 即走全链路组。
2. **导入按钮/空态引导钮均 edit-only**：viewer 不可见导入入口（服务端代理鉴权为最终防线）。
3. **拾取记录不落 localStorage 缓存**（流水量体不适合缓存，appData 内存态 + 懒加载）。
4. 插件真机测试（Day1 申报）与 sql/42 执行是两道运营侧闸门，均完成后本批闭环。
