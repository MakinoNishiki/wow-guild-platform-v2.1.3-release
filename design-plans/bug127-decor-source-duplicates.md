# BUG-127 家宅来源去重：前置审计与实现范围

Written against: `70fbdbf`；2026-11-18。

## Evidence chain

- Surface：家宅图鉴详情、图鉴方案抽屉及独立方案页的文字导出。
- Problem：运营截图中“卷起来的卷轴”重复列出同一商人、地点和价格。匿名只读查询公开目录 `record_id=126`，确认 `sources` 中两条对象内容相同，原文也重复；`sourceText` 格式正确，调用方逐条输出未去重。
- Design evidence：DESIGN.md REQ-201、REQ-201交付报告要求多种获取途径分别保留，共用图鉴来源与词表；重复同一途径并非不同获取方式。
- Owner：`js/decorData.js` 的 `sourceText`、`renderSourceBlock`、`planExportText`。
- Evidence：`docs/evidence/bug127-20261118/user-duplicate-source.png`及`catalog-row-126.json`。截图副本已校验哈希。
- Uncertainty：先在真实Chrome组件页复现，再校验去重后的输出；不推断生产已修复。

## Findings / Design decision

P2：同一家具内结构化来源的完整展示文字重复。增加共享来源展示助手，以包含类型、商人/任务、区域、价格、声望和上下文的完整文字去重，保留首次出现顺序。只合并完全相同的展示行，不凭商人名合并，不跨家具去重。

原文来源可能以多行表达不同获取方式，不能逐行去重，否则会丢失重复价格或地区；保持原文兜底不变。不修改数据库或缓存中的原始来源。

## Reuse / Changes

1. `js/decorData.js`：复用 `sourceText`、`priceText`、现有词表；详情与文字导出共用去重结果。保留原文兜底、HTML转义、数量与容量逻辑。
2. `js/app.js`及资源引用：记录补丁并递增缓存版本。
3. 沿用 `dh-src-item`、导出弹窗及既有控件，无新CSS/组件。桌面1366/1920验证；UI规范§8移动端封存为已知取舍。

## Validation

- 公开目录真实卷轴记录回放：导出及详情仅显示一次来源，原始两条仍保留。
- 合成边界：商人/地区/价格/币种/声望/前置条件不同均保留；同一来源跨家具分别保留；原文重复地区/价格行不误删。
- 图鉴加单、独立方案页和抽屉导出、复制成功及失败回退、手改确认/取消、图片切换、数量容量、无写请求回归。
- `node scripts/verify-req201-export.cjs`、语法和差异检查。真实Chrome加载实际组件，目录为公开记录回放加合成边界数据，不声称生产保存链路已验证。

## Scope / Stop conditions

本补丁只处理结构化来源展示重复。库数据修复、原文分块解析、采购总价和新功能不在范围内；若需要修改写库或来源采集规则，另列任务。

## Design documentation

在DESIGN.md REQ-201段落登记来源展示去重边界，交付报告记录红绿验证、待上线及运营验收状态。
