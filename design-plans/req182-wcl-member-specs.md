# REQ-182 WCL 导入职业图标与专精

Written against: 4dabeb1

## Design language
- Audited surface: 智能导入成员预览，含考勤同步中的添加成员入口。
- Design sources: DESIGN.md、REQ-069、用户本轮截图和明确要求。
- Documented decisions: 复用本地官方 PNG、职业色和现有表单，不新增视觉体系。
- Governing owners and consumers: app.js renderImportPreview → classIconHtml/specIconHtml → IconMap。
- Explicit exceptions: 移动端封存；本批桌面验收。

## Findings
| # | Problem | Evidence | Proposed change | Scope | Confidence |
|---|---|---|---|---|---|
| 1 | 导入职业图标仍是旧单色图 | 用户截图；renderImportPreview/importUpdateRow 直接拼 assets/icons/*.svg，绕过统一组件 | 改用 classIconHtml | 智能导入 | 已测量 |

## Improve first
修正旧图标直引，复用已有资产与字号尺寸。

## Selected implementation plan
用户已选定修复。审计结束后进入实现阶段。
- app.js：预览图标统一；显示从报告识别的中文专精，允许选择主专精；新成员按现有批量导入写主副专精与职责。已有成员默认跳过、不自动覆盖。
- server.js：现有报告查询增加 fights.friendlySpecs；按 actor ID 对齐 friendlyPlayers（官方 schema 明确两数组逐项对应），仅统计首领战。按场次降序、同场次按最近使用排序，不以职业猜专精。
- iconMap.js：从现有专精资产映射反查英文键，避免维护第二套中文译名；旧别名沿用资产路径消歧。
- index.html：纠正“全部待补充”说明，升级资源版本。
- 多专精：首领参战最多为默认主专精，其余作为副专精，预览明确说明；缺失/无法识别保留待补充，不能编造。
- 不修改生产数据库或结构；522 和待核对文案另留待办。

## Validation
真实报告字段核查、缺失/多专精/同名跨服测试；Chrome 预览图标、改职业清除旧专精、导入与刷新；独立测试库回读主副专精及职责。保留考勤原有回归。

## Stop conditions
若 WCL 字段不能逐角色对齐，不做猜测映射。测试库不可用则明确阻塞，不声称保存验收完成。

## 实施结果
已按用户指定范围实现，报告见 docs/REQ-182-WCL导入专精与图标-20261105.md。真实画面显示原70px专精列不足，弹窗扩至900px、专精列175px；1366/1920复测无横向溢出。
