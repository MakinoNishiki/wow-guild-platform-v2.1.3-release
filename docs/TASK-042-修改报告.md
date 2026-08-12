# 任务书 #42 修改报告：用户偏好包——导航拖拽排序+日历密度切换（REQ-105/REQ-107）

> 日期：2026-08-12 ｜ 执行：Kimi Code ｜ 版本串：20260811.53 → **20260811.54**（两壳 16 引用 + 2 头部注释同步）
> 状态：开发自测完成（verify 24/24 全绿），待运营验收（B 表 5 项）｜ 未 commit 未 push

---

## 一、WP0｜sql/27 迁移执行复核（已执行）

- 文件：`sql/27_task042_user_profiles_preferences.sql`（`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'` + 列注释 + 回滚注释）。
- 执行链（同 sql/25/26 先例）：**备份**（远端全库 pg_dump.gz 190KB + user_profiles 表转储，已拉回 `backup/2026-08-12-task42/`）→ SSH + `docker cp` → `docker exec supabase-db psql -U supabase_admin -d postgres -f`（输出 `ALTER TABLE` / `COMMENT`，零 ERROR）→ `NOTIFY pgrst, 'reload schema'` ×2 → 复核。
- 执行前后复核：`preferences jsonb NO DEFAULT '{}'::jsonb`（information_schema）；`null_cnt=0`（9 行存量全回填默认）；REST `select=preferences` 200 可见（schema cache 已刷）。
- RLS 核查：user_profiles 三条既有策略（select_own/update_own/insert_auth）均按行级 `auth.uid()=user_id` 判定，无列级权限白名单——新列自然覆盖，无需变更策略（sql/27 注释在案）。
- SSH 密码走 `SSH_ASKPASS` 环境变量/stdin 管道注入，未落任何文件、未进 git。

## 二、改动清单（WP1-WP3 实际改动点）

| 文件 | 改动 |
|---|---|
| `sql/27_task042_user_profiles_preferences.sql` | 新增（已执行，见 §一） |
| `js/cloud.js` | CloudSync 新增 `loadPreferences/getPreference/savePreference`：内存态镜像 + 单键增量写（先读最新合并单键再 upsert，防跨设备覆盖其它键）；SDK 直连 RLS 限本人；失败抛错 |
| `js/app.js` | 偏好包区块：①`loadUserPreferences()` 挂 `showAppView`（登录/切公会后加载，不阻塞界面）；②WP2 导航拖拽：`applyNavOrder`（默认序=DOM 原序、残留 key 忽略、缺失 key 追加尾部）、原生 HTML5 DnD（dragstart/dragover 实时插入位重排/dragend 落定一次写）、`refreshNavDraggable`（<768px 或 hover:none 禁拖）、`persistNavOrder` 失败 toast+回滚拖拽前序；③WP3 日历密度：`getCalendarDensity`（默认 compact）/`paintCalendarDensity`/`setCalendarDensity`（即时生效、失败回滚）；文件尾初始化 `initNavDragSort()` + 默认密度先刷 |
| `index.html` | 用户中心导航项补 `data-navkey="usercenter"`（无 data-page 项纳入 key 体系）；考勤日历头加「紧凑/舒适」切换组 |
| `css/main.css` | `.nav-item[draggable]` grab 光标 + `.nav-dragging` 半透明占位；`.cal-density*` 切换控件样式；`.calendar-days.cal-compact` 紧凑维度（aspect-ratio 方形→min-height 52px 固定小行高、gap 4→2、字级 13→12/10→9） |
| `index.html` / `data.html` | 版本串 .53→.54 |
| `scripts/verify-task42.js` | 新增验证脚本（24 断言） |

## 三、§1 审计单（逐项）

- **导航 DOM 重排 vs 页签激活逻辑**：`switchPage` 按 `data-page` 切 `.active`，与 DOM 顺序零耦合；`#navDatacenter` display:none 内联样式随元素移动不丢；重排只 `appendChild` 既有节点，事件（内联 onclick）零影响。
- **REQ-112 反馈按钮位**：按钮在 `.sidebar-footer` 不在 `.nav-menu`，非 `.nav-item`，draggable 恒 false——不参与排序（verify B2 断言）；「问题反馈」与版本号区不受重排影响。
- **日历渲染链**：密度只切 `#calendarDays` 容器 class（innerHTML 重渲 class 不丢），`renderCalendar` 零改动；紧凑态纯 CSS 收密，**条目数守恒**（格子数/活动格数/场次总数两态逐一相等，verify C4 硬断言）；列表视图不受影响（class 只挂日历容器）。
- **防抖**：拖拽过程零打库（dragover 只动 DOM），dragend 落定一次 `savePreference`；密度切换一次点击一次写。
- **DB-first**：写=SDK→Supabase→成功更新内存→界面已先刷（乐观）/失败 toast+回滚（禁假成功）；读=登录后 loadPreferences 入内存。

## 四、验证方式（verify-task42.js，24/24 全绿）

- A1/A2：迁移复核（列 REST 可见、存量零 NULL）；A3 版本串两壳 .54；
- B1/B2：默认序=DOM 原序（11 项含 usercenter navkey）；反馈按钮不参与排序；
- B3-B5：合成 DragEvent 真链路拖拽（members→dashboard 前）→ DOM 实时重排 + 落定一次写库与 DOM 一致 + F5 保持；
- B6：乱序恢复（PATCH 写入 `['lootdrop','ghost-key','members']` → 未知 key 忽略、缺失 key 按原序追加尾部、不卡死）；
- C1/C2：紧凑默认（cal-compact+按钮态，格子 52px）；C3：切舒适即时生效（52→140.9px）；C4 **条目数守恒**（格子 37=37、活动格 2、场次 3 两态相等）；C5 单键增量写（calendar_density+nav_order 两键共存）；C6 刷新记忆；C7 写失败（断 user_profiles 路由）→ toast「保存失败」+ 界面回滚舒适态；
- D1/D2：跨设备（新浏览器 profile 零 localStorage）导航顺序/密度偏好同步，1920 档渲染正常（舒适 224.6px）；
- E1/E2：另一账号隔离（默认序+紧凑默认）；F1：390 触屏 draggable 全 false；
- 全程零 JS 报错零 404；T42 测试数据清零复核（user_profiles 行随用户删除级联）。

§4 多设备同步实证：D1/D2 即「清 localStorage 新 profile 偏好仍在」的服务端持久化实证。1366/1920 两档紧凑一屏整月：1366 档格子 52px、整月 6 行约 330px（一屏富余）；1920 档同高（固定行高与视口宽无关）。

截图：`backup/2026-08-12-task42/`（calendar-compact-1366 / calendar-comfortable-1366 / calendar-1920-device2）。

回归：task27×3 / 29 / 31 / 32 / bug071 / 34 / 35 / 36 / 37 / 38 / 39 / 40 / 41 + npm test + SEC-001 全绿（结果见完工报文分段）。

## 五、遗留问题

- 导航项暂无拖拽手柄图标（整项可拖，grab 光标提示）；如运营要手柄另提。
- B 表 5 项待运营手工验收。

### commit 物料（待运营审后统一提交）
标题：「任务书#42：偏好包——preferences jsonb+导航拖拽排序+日历密度切换（REQ-105/107）」
【改了什么】user_profiles 加 preferences jsonb 单列（sql/27 已执行）；CloudSync 偏好读写（单键增量、失败抛错）；侧栏导航原生拖拽排序（落定一次写、移动端禁拖、残留/缺失 key 容错、失败回滚）；考勤日历紧凑/舒适切换（紧凑默认、条目数守恒、即时生效）。【范围】sql/27、js/cloud.js、js/app.js、index.html、css/main.css、两壳版本串 .54、scripts/verify-task42.js（新增）。【验证】verify-task42 24/24 全绿（迁移复核/读写环/拖拽持久化/乱序恢复/跨设备/账号隔离/密度两态条目守恒/失败回滚/移动降级）；回归 task27×3/29/31/32/bug071/34/35/36/37/38/39/40/41+npm+SEC-001 全绿；测试数据清零。
