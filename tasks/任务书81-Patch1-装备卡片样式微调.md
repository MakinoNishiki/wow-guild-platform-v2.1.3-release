# 任务书 #81-Patch1：装备卡片样式微调

【任务通知】#81-Patch1

任务编号：#81-Patch1
任务名称：装备卡片样式微调（防截断 + icon 边框）
类型：前端样式调整
优先级：T1
关联：#81 REQ-170

---

## 一、问题 1：Tab 过长导致 icon 被截断

**现象：** 装备名称长或 tab 数量多时，卡片内空间不足，icon 右侧被截断（如截图所示）。

**根因：** icon 放大到 48px 后，左侧区域变宽，右侧 tab 标签过长时挤占空间。

**修复：**

```css
/* 卡片 tab 标签容器 */
.dp-item-tags {
  flex-wrap: wrap;          /* 已存在则确认生效 */
  gap: 4px;                 /* 缩小间距 */
}

/* 单个 tab 标签 */
.dp-item-tag {
  white-space: nowrap;      /* 防止单个 tab 内换行 */
  max-width: 100%;          /* 防止溢出 */
}

/* 如果仍然溢出，增加卡片宽度或缩小字体 */
/* 备选方案 A：卡片宽度从 220px → 240px */
.loot-card {
  width: 240px;             /* 仅 if 220px 不够 */
}

/* 备选方案 B：tab 字体缩小 */
.dp-item-tag {
  font-size: 10px;          /* 已 10px 则跳过 */
}
```

**优先尝试方案：tab 换行 + 缩小 gap，不动卡片宽度。**

---

## 二、问题 2：Icon 增加边框

**现象：** icon 与深色卡片背景色接近，辨识度不足。

**修复：**

```css
.dp-item-icon {
  border: 1px solid rgba(255, 255, 255, 0.15);  /* 微白边框 */
  border-radius: 4px;                            /* 保持圆角 */
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);        /* 可选：微弱阴影 */
}
```

**效果：** icon 与卡片背景有清晰分界，提升辨识度。

---

## 三、验证标准

| # | 检查项 | 通过标准 |
|---|--------|----------|
| 1 | Icon 截断 | 霜铸的秘法蔓叶等长名装备，icon 完整显示 |
| 2 | Tab 布局 | 多 tab 时自动换行，不挤 icon |
| 3 | Icon 边框 | F12 Computed → border 有 1px 微白线 |
| 4 | 视觉 | icon 与卡片背景有明显区分 |
| 5 | 所有卡片 | 330 件装备全部正常 |
| 6 | Console | 零红字 |

---

## 四、版本串

- 当前：.101
- 本次：.101（纯 CSS 微调，判断是否需要 bump——如修改了 CSS 文件则 .102）

---

## 五、Commit

```bash
git commit -m "style(ui): 装备卡片防截断 + icon 边框

- .dp-item-tags: gap 缩小，确保 tab 换行不挤 icon
- .dp-item-icon: 增加 1px 微白边框 + 微弱阴影
- 修复长装备名/多 tab 导致的 icon 截断

关联: #81-Patch1"
```

---

确认收到请回复「#81-Patch1 收到」。
