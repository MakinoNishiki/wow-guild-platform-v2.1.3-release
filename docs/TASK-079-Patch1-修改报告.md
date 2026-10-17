# 任务书 #79-Patch1 修改报告：图标路径改 CDN + fallback

> 日期：2026-10-17 ｜ 执行：Kimi Code ｜ 类型：前端热修
> 验证：`scripts/verify-task79-patch1.js` **12/12 全绿**（A 静态 5 + B 浏览器 7）
> 版本串：三壳 `20261015.98` → `20261015.99`（15/8/5，旧串零残留）
> **未 commit**：改动在工作区待开核

## 一、关键实测（决定补丁范围的分叉证据）

| 样本 | 结果 |
|---|---|
| 装备数字 fileDataID（S1/S2 团本+大米，17 个） | **17/17 = 200**（render CDN 数字 ID 出图完全可行） |
| decor fileDataID（旧家具 8 个 + 新家具 2 个） | **10/10 = 403**（render CDN 对家宅图标不可用） |
| 图标名（inv_garrison_resource / inv_sword_04） | 200（CDN 按键名为准） |

**结论**：通知「decor + data 两处都改 CDN」只能采纳一半——装备改 CDN 可行且根治本地空目录；**decor 若照改会把现在正常显示的旧家具图标也打回占位（明确回退），不予实施**。

## 二、实际改动（仅 dataPublic.js 一处）

- 公示页装备卡图标：`assets/icons/items/{id}.png` → `https://render.worldofwarcraft.com/icons/56/{id}.jpg`
- onerror：由「隐藏不占位」改为「回退本地 `_placeholder.png`」（非裂图）
- `icon_id` 空值不渲染、lazy 保留、picker 的 icon_name CDN 链路（REQ-157）不动
- **decorData.js 零改动**（维持本地 `assets/decor-icons` 管道 + 占位回退）

## 三、验证（真浏览器主链路，游客路由）

- **B1**：公示页装备卡前 8 枚图标全部 render CDN 且 naturalWidth>0（真实加载成功）
- **B2**：无 `/assets/icons/items/` 本地请求（旧 404 通道消失）
- **B3**：拦截 CDN 全断 → onerror 回退 `_placeholder.png`，102 枚占位图全部加载成功（lazy 未触发请求的子集不属于失败路径）
- **B4**：decor 旧家具图标仍走本地 assets/decor-icons 且加载成功（证明未误改 decor）
- **B5**：全程零 TypeError / console 零报错
- **A 静态**：dataPublic.js CDN+回退锚点、decor 本地路径锚点、版本串 15/8/5 零残留、changelog+台账、node --check 全量

## 四、申报

1. **本批仅装备改 CDN，decor 未改**（理由见 §一；与通知「两处都改」有出入，属防回退的必要裁剪）。
2. 装备分配/心愿单列表的 `itemIconImgHtml` 与 picker 另有图标链路：picker 已走 icon_name CDN（REQ-157）；`itemIconImgHtml` 的本地空目录同源问题未纳入本批（可后续同款处理，一句话改动）。
3. 占位图复用 `assets/decor-icons/_placeholder.png`（在场）；`assets/icons/placeholder.png` 不存在，未按通知字面路径创建新文件。
4. 台账：REQ-168 登记。
