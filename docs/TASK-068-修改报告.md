# 任务书 #68 修改报告：家宅图鉴种族筛选维度 + 资料片文案改名

> 日期：2026-10-13 ｜ 执行：Kimi Code ｜ 类型：纯前端补丁（零 SQL）
> 验证：`scripts/verify-task68.js` **23/23 全绿**（A 静态 12 + B 浏览器 11），退出码 0
> 版本串：三壳 `20261013.89` → `20261013.90`（index 15 / data 8 / decor 5，旧串零残留）

---

## 一、修改前输出（规范 3.1）

| 文件 | 位置 | 原因 | 影响与风险 |
|---|---|---|---|
| js/decorDict.js | EXPANSION_TAGS 后新增 RACE_TAGS + 导出 + 组名沿革注释 | 任务书 §4 | 词表新增，既有键零改动 |
| js/decorData.js | state / activeFilterCount / filteredRows / buildFilterBar / refreshChips / resetFilters + 三处文案 | 任务书 §3.1–3.8 | 双壳同一渲染层，筛选七维升八维 |
| index/data/decor.html | 版本串注释 + `?v=` | 任务书红线三壳同步 | 缓存失效语义不变 |
| js/app.js | changelogData 首条 | 四维补录门禁 | — |
| docs/问题与需求清单.md | REQ-160 登记 | 编号纪律 | — |
| AGENTS.md | 功能模块 13 家宅图鉴 | 文档同步纪律 | — |
| scripts/verify-task68.js | 新建 | 验收自动化 | — |

## 二、实际改动点（对照任务书 §3 逐项）

1. **§3.1 state**：`expansion: 0` 后插 `race: 0`（注释钉词表来源）。
2. **§3.2 过滤**：expansion 过滤行后插 race 过滤行（`r.tags[String(state.race)]` 键存在性判定，与 expansion 同构）。
3. **§3.3 筛选栏 HTML**：「资料片分类」组后插「种族（单选）」组 + 说明「按装饰的种族风格筛选」。
4. **§3.4 chip 渲染绑定**：`raceDefs = [全部, ...D.RACE_TAGS]`，计数 `countBy(r => r.tags && r.tags[String(id)])`，点击置 state.race + 回第 1 页 + refreshChips + render（与既有组同构）。
5. **§3.5 refreshChips**：`paint('dhRaceChips', …)` 插于 dhExpChips 行后。
6. **§3.6 resetFilters**：Object.assign 增 `race: 0`。
7. **§3.7 activeFilterCount**：`if (state.race) n++;`。
8. **§3.8 文案三处**：state 注释 / 组头「主题风格」→「资料片分类」/ 渲染注释；`expansion`、`EXPANSION_TAGS` 键名零改动。
9. **§4 RACE_TAGS**：30 项入 decorDict.js（含口径裁定注释：暴风城 80 剔除、精灵 83 上位保留、龙希尔归种族、邪能/机械不归），挂 `window.DecorDict` 导出（任务书示例代码 `D.RACE_TAGS` 消费的前提是导出，此为一处必要补齐）。

## 三、验证方式（真浏览器主链路实测）

`node scripts/verify-task68.js`（自起 server :15669 + Playwright 无痕游客直开 `index.html#/house/decor`；库实测基准 = service key 直读 decor_catalog 同库同时刻）：

- **A 静态 12/12**：RACE_TAGS eval 实读恰 30 项且 id 集=裁定口径（80 不在、83 在）；七处挂钩锚点；三处改名+「主题风格」组头绝迹+键名不动；版本串 15/8/5 零残留；changelog+台账登记；node --check 全量。
- **B1 改名**：页面组头序列实测 = 分类/来源/**资料片分类**/**种族**/容量/摆放环境/特性，「主题风格」组头绝迹。
- **B2 计数**：种族组 31 胶囊（全部+30），30 枚计数与库实测**逐一相等**（30/30）。
- **B3 主链路**：点「兽人」→ 计数「命中 62 件 · 1 项生效」+ 选中态到位；当前页 **48 张卡片逐张回库核对全部含 tags[90]**；点「全部」恢复「共 2062 件」。
- **B4 组合**：兽人×至暗之夜 → 「命中 28 件 · 2 项生效」= 库实测交集。
- **B5 重置**：种族/资料片分类双归「全部」+ 全量计数。
- **B6 零回归**：既有维度抽验（可放宠物 → 命中 11 件 = 库实测）。
- **B7 全程零 TypeError / console 零报错**（白名单：缺图标占位 404 在案）。

任务书 §5 验收 9 项逐项对照：1=B1、2=B1/B2、3=B3、4=B2、5=B5、6=B4、7=A4、8=B6、9=B7，全过。

## 四、申报与遗留

1. **任务书「关联需求 REQ-158」系笔误**：REQ-158 为任务书 #65 套装快捷录入（已销项）；本条按编号纪律另立 **REQ-160** 登记，台账行内已注明。
2. **「资料片分类」组下说明文案保留原文**：「按装饰的主题风格归类，非物品加入版本」未在任务书 §3.8 三处改名范围内，按红线未动——组头改名后该说明读起来略有张力（BUG-108 勘定口径 vs 新组名），是否同步修订说明文案请运营定夺。
3. **导出补齐**：任务书 §4 只说「文件末尾插入常量」，但 §3.4 消费方式为 `D.RACE_TAGS`（D=window.DecorDict），故在导出对象中同步挂载 RACE_TAGS，属必要实现细节非范围扩展。
4. 双壳同一渲染层（decorData.js 单一真源），登录壳 `#page-decor` 页签与游客路由同源生效，未单独复测登录壳（渲染层零壳分支）。
