# 任务书 #58-WP2-3 修改报告：埋点白名单扩列 + TRACK_PAGE_RE 连字符修复 + 文档回写

> 日期：2026-09-24 ｜ 执行：Kimi Code ｜ 状态：已实现待验收（未 commit / 未 push，送审）
> 报告文件名说明：任务书原文写 `docs/TASK058-WP2-修改报告.md`，按 WP2-1/WP2-2 既有命名惯例落 `docs/TASK-058-WP2-3-修改报告.md`。

## 一、改动清单

| 文件 | 改动 |
|---|---|
| server.js | ①`TRACK_EVENTS` 11→14：新增 `decor_plan_create` / `decor_plan_switch` / `decor_plan_export_image`（与 js/decorData.js 三处 WP2-1/WP2-2 已就位挂点逐一核对一致：create={}、switch={plan_count}、export_image={skin} 双挂点）；②`TRACK_PAGE_RE` `index:[a-z]+`→`index:[a-z-]+`，修复 `index:decor-plan` 页签 PV 被吞（WP2-1 侦察登记项销账）；③**申报项**：看板筛选 `ANALYTICS_PAGE_RE`（server.js:419）同口径放行连字符——TRACK_PAGE_RE 放行后 `index:decor-plan` 数据开始累积，看板页面筛选白名单若不同步将拒筛该页签；只读管理端接口、放行超集零风险，请运营确认 |
| docs/开发规范.md | 第七章事件清单表 11→14 行（三新事件含触发语义与 props 口径）+ 白名单注记下新增 page 字段口径钉死条（TRACK_PAGE_RE 与 ANALYTICS_PAGE_RE 同口径同步维护、新增页签 key 超出 `[a-z-]` 须先改 regex 再上线） |
| docs/问题与需求清单.md | REQ-137 行：「WP2 …未启动」→ WP2 三工作包已实现待验收全段补记（WP2-1 多方案+独立页 / WP2-2 图片导出+三皮肤+水印 / WP2-3 本包） |
| index.html / decor.html | 版本串 20260923.76→20260923.77（index×15 / decor×6 同步递增，埋点纪律 7.1.5：事件清单改动须递增版本串）；data.html 滞留 .72 系 #55 时代既有现状，不属本包范围未动 |
| scripts/verify-task58-wp2-3.js | 新增回归脚本（A 静态 9 项 + B 实测 3 项 + C 清零 1 项） |

前端三挂点（js/decorData.js:641/656/1002/1009）为 WP2-1/WP2-2 已并入 master 的既有代码，本包零改动；track.js / app.js / cloud.js / css / sql / data.html 零触碰。

## 二、验证（verify-task58-wp2-3.js，14/14 全绿）

- **A 静态**：TRACK_EVENTS 14 事件顺序逐一核对；两处 regex 新口径；前端三挂点名与 whitelist 一致；规范事件表 14 行与白名单一一对应；REQ-137 台账补记；版本串 .77 双壳 15/6 + 旧串零残留；git 越界零（改动仅限本包白名单 7 文件）；`node --check` server.js/脚本双过；`node --test test/server-security.test.js` 5 pass 回归。
- **B 实测**（本地起 server :15664，直 POST /api/track + service key 复核 analytics_events）：
  - B1 三新事件各 1 发全 204 且库内在场，props 逐键一致（`{}` / `{"plan_count":2}` / `{"skin":"horde"}`）；
  - B2 `index:decor-plan` PV 入库（regex 修复实证）+ `decor`/`data`/`index:dashboard` 旧口径不回归；
  - B3 负向三吞：`index:decor_plan`（下划线）/`decor_plan_hack`（未登记事件）/`decor-plan`（裸页签）均恒 204 且零入库（库内行数 7→7 不动）。
- **C 清零 / analytics 测试残留自检报数**：本包测试共落库 7 行（vid=verify-t58wp23-*），已全量删除，**残留自检 = 0 行**。

## 三、决策点与遗留

1. **申报（决策点）**：ANALYTICS_PAGE_RE 同口径修复（见改动清单③）——超出任务书字面范围（仅点名 TRACK_PAGE_RE），按「regex 口径同步」精神先行修复并申报，运营若否可单行回退。
2. **遗留**：①更新日志四维补录随 release（与前包同口径）；②#56 七事件与 WP1/WP2 历史回填累积自各白名单解锁时点起算，此前 204 吞段无数据可追；③三事件真实业务流量入库待上线后由看板复核。
3. **commit 物料**：按纪律待顾问终审后另发；建议标题「任务书#58-WP2-3：埋点白名单扩至 14 + TRACK_PAGE_RE 连字符修复 + 文档回写」。
