# REQ-202 候选提案：家宅图鉴按获取来源查找

状态：**候选待运营审核，未排期、优先级未定、未实施**。仅预留编号，不能据本文件开工。

Written against: `47ad2f9`，2026-11-18。引用《开发规范》《UI工作方法-证据规范实现验收》。运营允许REQ-201/BUG-127后续统一验收，但未批准本新增优化；此前把它直接选为下一任务的判断已撤回。下文仅为待审实现建议，产品代码与正式设计规范未改。

## Design language

- Audited surface：`#/house/decor` → app.js `ensureDecorMounted` → `DecorCatalog.mount` → `buildFilterBar/filteredRows/cardHtml`。
- Design sources：DESIGN.md家宅/REQ-201段、UI规范v2 §4.3/4.4/8/9、现有`.dh-search-wrap/.dh-src/.dh-chip`。
- Documented decisions：目录只读、搜索/筛选内存执行；筛选跨组AND；卡片来源两行摘要、点击可看完整详情；桌面优先。
- Governing owners and consumers：`js/decorData.js`拥有搜索状态与来源格式，`css/decor-public.css`控制卡片来源摘要；公开跳转壳与主站共用。
- Explicit exceptions：UI规范v2 §8移动端封存；分享方案为后续社区范围，禁用是已知取舍，不列缺陷。

## Findings

No supported findings were found. 当前输入框写“搜索装饰名”，`filteredRows`也仅匹配名称，属于一致的原功能范围，不能把新增来源搜索当成旧BUG。

## Improve first

No supported recommendation. 代理建议的候选收益：用户可用商人、地区、任务、成就或条件查家具，继而看详情、加入方案并导出；是否作为家宅下一切片由运营决定。

## Design decision / Reuse

1. 复用同一个搜索框，将提示及可访问名称明确为“搜索名称、商人、地区、任务等”；仍为一个完整关键词的包含匹配，忽略首尾空格和英文大小写，不另加搜索模式或推荐算法。
2. 名称或任一可见来源命中即匹配；结构化来源使用`knownSourceLines`，缺结构时读`rawSourceLines`，不搜索控制码/隐藏ID/无数据占位。内存缓存来源索引，不新增网络请求。
3. 卡片优先显示命中的来源（包括第二或更后的途径），关键词以`.dh-search-hit`标记；摘要仍两行，完整文字放title并可点击原详情。名称命中也标记。未搜索时保持旧摘要，方案单来源不受图鉴搜索影响。
4. `.dh-search-hit`复用金色及筛选chip的浅金底，不改品质色、卡片尺寸、布局或动画；文字按原样转义，不将关键词解释为HTML或正则。

## Changes / Scope

- `js/decorData.js`：只读搜索索引、过滤、输入框文案、图鉴卡片关键词与来源摘要。保留分页、清除/Esc/重置、现有各筛选组AND及方案操作。
- `css/decor-public.css`：只登记关键词标记样式。
- `js/app.js/index.html/decor.html`：若获批，随实际开发批次更新日志、递增资源版本，不预占147。
- DESIGN.md、台账、排期、交付文档及验证脚本/截图登记。
- 不新增表、SQL、依赖、埋点或写入；不开放社区、收藏率、3D或图书馆。

## Validation

- 真实Chrome加载实际组件：名称、大小写、第二来源、地区、任务、成就、条件、原文来源与未知/无命中。
- 多筛选交集、命中计数、分页复位、清除按钮/Esc/空态重置、输入焦点；来源长文本、特殊字符/HTML/正则字面量。
- 实点详情→加方案→导出→复制，原方案不受筛选限制；来源索引不发额外请求，不写库。
- 目录加载慢/失败/重试，1366/1920截图与控件边界；原REQ-201导出回归在独立临时目录复跑。
- 无云端写链路变更，不将组件页验证称作生产保存验收。

## Stop conditions

尚未获运营批准进入排期，不实施上述改动。若获批后需要猜测缺失来源、修改目录原始数据或增加生产写入，单列待办，不自行扩大范围。不自动部署或提交。
