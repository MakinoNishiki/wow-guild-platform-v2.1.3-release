# 任务书 #80 修改报告：装备卡片图标渲染链路修复

> 日期：2026-10-17 ｜ 执行：Kimi Code ｜ 类型：前端修复
> 验证：`scripts/verify-task80.js` **16/16 全绿**（A 静态 6 + B 浏览器 9 + C 清零 1）
> 版本串：三壳 `20261015.99` → `20261015.100`（15/8/5，旧串零残留）
> **未 commit**：改动在工作区待开核

## 一、现状自查（Step 1/2 结论）

- **API select 含 icon_id**：REQ-092（boss_loot/dungeon_loot 加列 + RPC 白名单透出）与 REQ-150（MasterData 加载层 + itemIconImgHtml 索引）**既有实现**，无需补。
- **卡片模板 <img> 已在 DOM 模板中**：#79-Patch1 已修公示页装备卡（render CDN + 占位回退，12/12 验证）；本批补齐的是 app.js 列表（装备分配/心愿单/拾取记录）的同源路径。
- **新发现的真病灶（渲染时序）**：`getItemIconId` 在 MasterData 未加载完成时返回 null——首渲染无图标且**之后不再重渲**（这才是「渲染链路断了」的成因之一，本地探针实证：行已渲染但无 img，函数本身正常）。

## 二、实际改动（app.js 两处 + 时序钩子一处）

1. **itemIconImgHtml**（装备分配/心愿单列表）：本地 `assets/icons/items/{id}.png` → `https://render.worldofwarcraft.com/icons/56/{id}.jpg`，onerror 由「隐藏不占位」改为「回退 `_placeholder.png`」。
2. **拾取记录表格**（#75-Day2 同源行）：同款 CDN + 占位回退（原 onerror=remove 一并改）。
3. **renderCurrentPage 新增 init 完成补渲钩子**（loot/wishlist 各一）：MasterData.init() 完成后若仍在该页则补一次重渲，图标自然补齐（init 内部快照兜底不拒绝，不阻塞用户操作）。
4. **decorData.js 零改动**（decor fileDataID 实测 10/10=403 不可走 CDN，维持本地管道）。

## 三、验证（真浏览器主链路）

- **B1**：装备分配列表图标 = render CDN（7350841）且 naturalWidth>0（补渲钩子生效后上屏）
- **B2**：拾取记录表格图标同链路加载成功
- **B3**：无 `/assets/icons/items/` 本地请求（旧 404 通道消失）
- **B4**：拦截 CDN 全断 → onerror 回退 `_placeholder.png` 且占位图加载成功
- **B5**：全程零 TypeError / console 零报错（白名单：decor 缺图/拦截模拟/user_profiles 409 设计内噪音）
- **A 静态**：两处 CDN+回退锚点、补渲钩子锚点、版本串 15/8/5 零残留、changelog+台账、node --check 全量
- **C 清零复核**

## 四、申报

- 补渲钩子是本批新增的必要修复（不是测试时序问题）：真实用户首进装备分配/心愿单时若 MasterData 未就绪，旧逻辑永不补图标；现由 init 完成钩子兜底。快照兜底态（isLoaded 终为 true）不阻塞。
- 台账：REQ-169 登记。
