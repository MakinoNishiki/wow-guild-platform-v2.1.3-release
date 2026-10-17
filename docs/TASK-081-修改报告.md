# 任务书 #81 修改报告：装备卡片图标放大至 48px

> 日期：2026-10-17 ｜ 执行：Kimi Code ｜ 类型：CSS 热修
> 验证：`scripts/verify-task81.js` **14/14 全绿**（A 静态 6 + B 浏览器 8）
> 版本串：三壳 `20261015.100` → `20261015.101`（15/8/5，旧串零残留）
> **未 commit**：改动在工作区待开核

## 一、现状实测（与通知口径差异）

- 公示页装备卡图标实际类名 = `.dp-item-icon`（非通知的 `.item-icon`/`.loot-icon`），当前尺寸 **22px**（非通知口径的约 36px），绝对定位右上角（top/right 8px）。
- 名称行既有防重叠留白 `padding-right: 26px`；meta 行无留白。放大到 48px 后两行均需扩至 **56px**（48+8 间距）才能保持不重叠。

## 二、实际改动（仅 css/data-public.css 两处）

1. `.dp-item-icon`：`width/height 22px → 48px`。
2. `.dp-item-name` / `.dp-item-meta`：`padding-right 26px → 56px`（名称/meta 行统一防重叠留白）。

渲染层（dataPublic.js）零改动；装备分配/心愿单列表 `.loot-item-icon`（20px）不在本批范围。

## 三、验证（真浏览器主链路，游客 #/team/lootdrop）

- **B1a**：computed 图标 48×48、名称/meta padding-right=56px ✓
- **B1b**：几何防重叠——图标左缘 242.59 ≥ 名称/meta 内容盒右缘 230.59（内容盒 = 边框盒 − 56px padding）✓
- **B1c**：卡片无横向溢出（scrollWidth ≤ clientWidth）✓
- **B1d**：图标真实加载成功（naturalWidth>0）✓
- **B3a**：基希克斯破封样本卡（露瑟拉玛）图标 = render CDN（7350841）加载成功 ✓
- **B3b**：大米样本卡（抛光的光木引导匕首）图标 = render CDN（7893615）加载成功 ✓
- **B5**：全程零 TypeError / console 零报错 ✓

## 四、申报

- 本批仅尺寸与留白 CSS，无其他逻辑/选择器改动；decor 与装备分配列表图标尺寸不在范围。
- 台账：REQ-170 登记。
