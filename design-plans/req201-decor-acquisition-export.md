# REQ-201 家宅方案单获取清单：前置审计与实现范围

实现中补证：本地Chrome复制回读发现原文价格与地区被连在同一行，旧价格正则的`\s`包含换行；登记BUG-126并限制为横向空白，直接相关的详情/导出格式共用处修正。非新增布局规则。

引用《开发规范》《UI工作方法-证据规范实现验收》《魔兽管家UI设计规范v2》。2026-11-17运营选择继续家宅与休闲，REQ-200图书馆仅保留规划。本批选择方案单导出这个既有小场景，不开启社区或采集收藏率。

## Design language
- Audited surface: `#/house/plan`及图鉴抽屉共用的导出方案单弹窗。
- Design sources: DESIGN.md、UI规范§4.6/4.7/6/8、TASK-058-WP1/WP2既有导出约定。
- Documented decisions: 深色主题、双导出标签、文字可编辑且不回写方案；未保存文本关闭确认；剪贴板失败全选兜底。
- Governing owners and consumers: app.js ensureDecorPlanPageMounted→DecorCatalog.mountPlanPage；decorData.js planPageRender/抽屉→planOpenExport→planExportText/planCopyExport；css/decor-public.css的dh-plan-export与dh-exp-skin。
- Explicit exceptions: UI规范§8移动端封存；本批以1366/1920桌面验收。只核现有源码，未将源码推断写成视觉实测。

## Findings
No supported findings were found. 源码可确认原文本导出只有名称/数量/容量，这是旧范围，不能当UI缺陷；分享按钮禁用亦有“三期社区开放”的明确既有范围。

## Improve first
No supported recommendation. 以下为运营授权继续家宅后的新功能切片，不是审计确认的缺陷修复。

## 本批选定的增量
- 在现有文字预览中用既有`dh-exp-skin`标签与原生checkbox增加“包含获取来源（图鉴参考）”，默认勾选；取消后恢复简洁清单。无新视觉组件，无需新颜色或布局体系。
- 导出全部已知来源、区域、价格/货币与条件上下文；与详情共用sourceText及原文清洗/价格还原；不按名称猜来源、不把多个替代途径加总成总价。
- 用户手改文本后切换选项，先确认重新生成；取消保持文本与选项原状态，确认才更新；文字/图片标签切换不丢文本。复制和失败全选沿用既有逻辑。
- 不改变方案保存/公会权限/数据库/图片导出/公共分享。不新增SQL、依赖或埋点。

## 前后呈现
之前：家具名 ×数量（容量）→合计。
之后：默认同一清单每件下方增加获取信息；顶部提示来源/价格为图鉴单件参考，多种途径分列。保留简洁导出选项、可编辑正文、复制按钮与原图片标签。

## 实现与验收
修改decorData.js生成和控制逻辑、app.js更新日志、index.html资源串；DESIGN.md与需求台账记录本批，交付报告说明未上线。Chrome读取实际渲染源码与隔离合成目录，不连生产、不做方案CRUD。实点图鉴加单→方案单→导出→切换/手改/取消与确认→复制及拒绝兜底；多来源、原文币种、缺来源、数量、XSS文字安全、两宽度可见、图片模式和关闭确认回归。该范围无需数据库测试，不能声称方案保存链路已重新验收。
