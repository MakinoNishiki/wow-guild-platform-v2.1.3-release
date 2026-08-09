> **文档名称**: prd-split 执行案例 — sample 非现金支付比例管控
> **所属项目**: the organization SDD 最佳实践
> **用途**: prd-split Skill v1.0 的首次执行案例记录，供后续 Skill 使用和改进参考。
> **Owner**: project owner
> **执行日期**: 2026-04-10
> **执行会话**: sample_project 项目第二十三次会话
> **内容概述**: §1 背景与输入。§2 执行过程记录。§3 Python 脚本结构参考。§4 输出结果汇总。§5 自检结论。§6 关键决策记录。

---

# prd-split 执行案例 — sample 非现金支付比例管控

---

## §1 背景与输入

### 1.1 项目背景

the organization 非现金支付比例管控项目，计费系统 PRD（整合版）已于第二十二次会话完成（~1800+行，§一～§九 + §5.6 + §5.7 全部完成）。本次会话需要将 PRD 拆解为章节级片段，供后续 TRD 编写和测试用例生成使用。

### 1.2 输入参数

| 参数 | 值 |
|------|-----|
| 输入 PRD 文件 | `docs/PRD_billing_system_v1.md` |
| PRD 总行数 | 2035 行 |
| PRD 版本 | v1.0（2026-04-03 第二十二次会话完成） |
| 拆解日期 | 2026-04-10 |
| 输出目录 | `docs/PRD_split/PRD_billing_system_v1_20260410/` |

### 1.3 PRD 章节结构（grep 扫描结果）

```
行12  : # PRD — 计费系统（整合版）
行14  : ## 目录
行35  : ## 一、文档概要
行37  : ### 1.1 版本记录
行44  : ### 1.2 需求范围/功能范围概述
行60  : ### 1.3 名词解释
行80  : ## 二、背景及目标
行82  : ### 2.1 项目资料
行90  : ### 2.2 背景与综述
行101 : ### 2.3 项目计划
行107 : ## 三、竞品分析
行124 : ## 四、主逻辑
行126 : ### 4.1 核心场景矩阵
行141 : ### 4.2 端到端流程概述
行193 : ### 4.3 规模要求
行207 : ## 五、方案详情
行209 : ### 5.1 原始数据管理（Module 1）
行211 : #### 5.1.1 页面原型
行441 : #### 5.1.2 业务流/信息流
行496 : #### 5.1.3 正向案例
行510 : #### 5.1.4 边界场景处理规则
行534 : #### 5.1.5 逆向流程
行552 : ### 5.2 交易流水管理（Module 2）
行554 : #### 5.2.1 页面原型
行734 : #### 5.2.2 业务流/信息流
行801 : #### 5.2.3 正向案例
行831 : #### 5.2.4 边界场景处理规则
行843 : #### 5.2.5 逆向流程
行853 : ### 5.3 Module 3 分发记录管理
行857 : #### 5.3.1 页面原型
行952 : #### 5.3.2 业务流程与状态机
行991 : #### 5.3.3 正向案例
行1004: #### 5.3.4 边界场景处理规则
行1016: #### 5.3.5 逆向流程
行1025: ### 5.4 配置工作台（Module 4）
行1027: #### 5.4.1 页面原型
行1238: #### 5.4.2 业务流/信息流
行1269: #### 5.4.3 正向案例
行1285: #### 5.4.4 边界场景处理规则
行1298: #### 5.4.5 逆向流程
行1309: ### 5.5 试算工具（Module 5）
行1311: #### 5.5.1 页面原型
行1465: #### 5.5.2 业务流/信息流
行1491: #### 5.5.3 正向案例
行1507: #### 5.5.4 边界场景处理规则
行1520: #### 5.5.5 逆向流程
行1530: ### 5.6 非现金支付比例落地
行1534: #### 5.6.1 落地总览
行1554: #### 5.6.2 下单场景——完整信息流
行1687: #### 5.6.3 发货场景
行1711: #### 5.6.4 退款场景
行1735: #### 5.6.5 订单取消场景
行1756: #### 5.6.6 交叉索引
行1769: ### 5.7 外部接口依赖与改动需求
行1773: #### 5.7.1 营销中台接口
行1892: #### 5.7.2 良品系统接口
行1915: #### 5.7.3 接口变更影响范围汇总
行1927: ## 六、迭代计划
行1929: ### 6.1 本期（v1.0）范围
行1940: ### 6.2 二期规划（Out of Scope）
行1953: ## 七、运营计划
行1955: ### 7.1 上线前准备
行1966: ### 7.2 运维监控
行1977: ### 7.3 运营工具使用规范
行1987: ## 八、沟通记录
行1989: ### 8.1 外部依赖跟踪
行1998: ### 8.2 关键沟通纪要索引
行2007: ## 九、参考资料
行2022: ## 导航尾部
```

---

## §2 执行过程记录

### 2.1 拆分粒度决策

| 决策 | 结论 | 依据 |
|------|------|------|
| §五子模块是否独立文件 | ✅ 是，§5.1-§5.7 各自独立 | 下游TRD/测试用例按模块消费，合并会强迫读大文件 |
| §五章头（行207-208）归属 | 并入 §5.1 文件 | 内容仅2行，不值得独立文件；§5.1 是§五第一个模块 |
| 是否有节超过500行需再拆 | ❌ 无，最大节为§5.1（345行） | 所有节均在500行以内，无需进一步拆分 |
| Header/TOC归属 | 纳入索引文件 00_index.md §1 | Header 是 PRD 全局信息，适合放在入口索引中 |

### 2.2 章节行范围汇总

| 文件 | 章节 | 原始行范围 | 行数 |
|------|------|-----------|------|
| 01_doc_overview.md | §一 文档概要 | 35–79 | 45 |
| 02_background_goals.md | §二 背景及目标 | 80–106 | 27 |
| 03_competitive_analysis.md | §三 竞品分析 | 107–123 | 17 |
| 04_main_logic.md | §四 主逻辑 | 124–206 | 83 |
| 05_1_M1_raw_data.md | §五章头+§5.1 原始数据管理 | 207–551 | 345 |
| 05_2_M2_transaction.md | §5.2 交易流水管理 | 552–852 | 301 |
| 05_3_M3_dispatch.md | §5.3 分发记录管理 | 853–1024 | 172 |
| 05_4_M4_config.md | §5.4 配置工作台 | 1025–1308 | 284 |
| 05_5_M5_calculator.md | §5.5 试算工具 | 1309–1529 | 221 |
| 05_6_ratio_implementation.md | §5.6 非现金支付比例落地 | 1530–1768 | 239 |
| 05_7_external_interfaces.md | §5.7 外部接口依赖 | 1769–1926 | 158 |
| 06_iteration_plan.md | §六 迭代计划 | 1927–1952 | 26 |
| 07_ops_plan.md | §七 运营计划 | 1953–1986 | 34 |
| 08_communication.md | §八 沟通记录 | 1987–2006 | 20 |
| 09_references_nav.md | §九 参考资料+导航尾部 | 2007–2035 | 29 |
| **Header/TOC** | **行1–34（纳入00_index.md）** | **1–34** | **34** |
| **合计** | — | — | **2035** |

---

## §3 Python 脚本结构参考

> 实际脚本路径（执行后可删除）：`docs/prd_split_script.py`

### 3.1 脚本骨架

```python
import os
from pathlib import Path

BASE = Path(r"项目根目录绝对路径")
PRD_PATH = BASE / "docs" / "PRD_billing_system_v1.md"
TODAY = "YYYY-MM-DD"
OUT_DIR = BASE / "docs" / "PRD_split" / "PRD_billing_system_v1_YYYYMMDD"
OUT_DIR.mkdir(parents=True, exist_ok=True)

with open(PRD_PATH, 'r', encoding='utf-8') as f:
    prd_lines = f.readlines()

TOTAL_LINES = len(prd_lines)  # 行数核对基准

# 章节定义（每条dict含：file, title, start, end, desc,
#            subsections, key_concepts, prev_file, next_file）
SECTIONS = [ ... ]

# Step1：行数预验证（必须通过才继续）
section_total = sum(s["end"] - s["start"] + 1 for s in SECTIONS)
header_lines = 34
assert section_total + header_lines == TOTAL_LINES

# Step2：生成每个章节文件
for sec in SECTIONS:
    content = "".join(prd_lines[sec["start"]-1 : sec["end"]])
    file_header = "..." # frontmatter block
    provenance  = "..." # 溯源关系 + 导航尾部
    with open(OUT_DIR / sec["file"], 'w', encoding='utf-8') as f:
        f.write(file_header + content + provenance)

# Step3：生成索引文件 00_index.md
prd_header_content = "".join(prd_lines[0:34])
index_content = "..." # §1原文 + §2表格 + §3树形 + §4自检
with open(OUT_DIR / "00_index.md", 'w', encoding='utf-8') as f:
    f.write(index_content)
```

### 3.2 关键实现要点

1. **行范围 1-indexed**：Python 列表 0-indexed，`prd_lines[start-1:end]` 对应原文行 start 到 end（含）
2. **字符串拼接替代 f-string 嵌套**：Python f-string 中包含反引号、竖线等 MD 特殊字符时，改用 `"..." + var + "..."` 形式，避免转义问题
3. **assert 不跳过**：行数预验证用 `assert`，不通过则脚本直接报错终止，不允许静默继续
4. **UTF-8 强制指定**：所有 `open()` 均加 `encoding='utf-8'`，Windows 环境默认编码为 GBK

---

## §4 输出结果汇总

### 4.1 生成文件清单

| 文件 | 总行数（含首尾） |
|------|---------------|
| 00_index.md | 148 |
| 01_doc_overview.md | 93 |
| 02_background_goals.md | 75 |
| 03_competitive_analysis.md | 62 |
| 04_main_logic.md | 131 |
| 05_1_M1_raw_data.md | 397 |
| 05_2_M2_transaction.md | 351 |
| 05_3_M3_dispatch.md | 222 |
| 05_4_M4_config.md | 334 |
| 05_5_M5_calculator.md | 271 |
| 05_6_ratio_implementation.md | 292 |
| 05_7_external_interfaces.md | 206 |
| 06_iteration_plan.md | 72 |
| 07_ops_plan.md | 82 |
| 08_communication.md | 66 |
| 09_references_nav.md | 76 |
| **合计** | **16 个文件** |

> 注：总行数 = 页首(10行) + 原始内容 + 溯源关系+导航尾部(~38行)，因此每个文件总行数 > 内容行数。

---

## §5 自检结论

### 5.1 行数核对

| 项目 | 数值 |
|------|------|
| PRD 原始总行数 | 2035 |
| Header/TOC（行1-34） | 34 行 |
| 15个章节内容行数合计 | 2001 行 |
| Header + 章节合计 | 2035 行 |
| 核对结果 | ✅ 完全一致，零误差 |

### 5.2 语义抽检（15节全部通过）

| 文件 | 抽检问题 | 结论 |
|------|---------|------|
| 01_doc_overview.md | 「乐享券」定义？ | ✅ §1.3：经销商向元气索取免费货物的凭证，按SKU逐行0-1原则消耗 |
| 02_background_goals.md | 引入乐享券的核心背景？ | ✅ §2.2 可独立回答 |
| 03_competitive_analysis.md | 竞品分析核心结论？ | ✅ 摘要表可独立回答 |
| 04_main_logic.md | 扣款顺序？ | ✅ §4.1 核心场景矩阵 + §4.2 流程图 |
| 05_1_M1_raw_data.md | 双实体联动状态机几个状态？ | ✅ §5.1.2：原始数据6态+加工结果5态+3条级联规则 |
| 05_2_M2_transaction.md | 三段状态机各自独立含义？ | ✅ §5.2.2：billing/verify/dispatch 各自独立流转，已失效9100跨三段 |
| 05_3_M3_dispatch.md | 分发记录与交易流水如何关联？ | ✅ §5.3.2 可独立回答 |
| 05_4_M4_config.md | SKU级非现金比例三个上限值？ | ✅ §5.4.1：券≤20% / 账本≤30% / 非现金≤90% |
| 05_5_M5_calculator.md | 试算与正式计费的核心区别？ | ✅ §5.5.2：is_trial=true 贯穿全程，不分发、不扣款、不写账 |
| 05_6_ratio_implementation.md | 发货扣款顺序？退货退款顺序？ | ✅ §5.6.3：现金→账扣→非现金账本→乐享券；§5.6.4：乐享券→非现金账本→账扣→现金 |
| 05_7_external_interfaces.md | I1/I2/I3/I4 各自触发时机？ | ✅ §5.7.1 接口交互时序图完整可见 |
| 06_iteration_plan.md | v1.0本期哪些模块 in scope？ | ✅ §6.1 可独立回答 |
| 07_ops_plan.md | 上线前检查清单？ | ✅ §7.1 可独立回答 |
| 08_communication.md | 外部依赖哪些事项待确认？ | ✅ §8.1 可独立回答 |
| 09_references_nav.md | 试算工具文件路径？ | ✅ §九参考资料可独立回答 |

**概念漂移检查**：无发现。所有文件的核心业务概念（发货顺序、退款顺序、状态码规则、比例基数口径）与 PRD 整体保持完全一致。

---

## §6 关键决策记录

| # | 决策点 | 结论 | 依据 |
|---|--------|------|------|
| 1 | §五章头并入§5.1还是独立 | 并入§5.1，不独立 | 仅2行，独立意义不大；§5.1是§五第一模块，合并不影响语义 |
| 2 | 超500行再拆的阈值 | 500行（未触发） | prd-write 推荐单节 <500行，与 skill-creator 的 SKILL.md <500行原则对齐 |
| 3 | 拆解脚本语言 | Python（`encoding='utf-8'`） | 元指令#11：文件写入类统一用Python脚本，不使用Write工具写大文件 |
| 4 | 行数预验证时机 | 执行前（assert），不通过则终止 | 防止在行范围有误的情况下生成错误文件，浪费后续时间 |
| 5 | Header/TOC归属 | 纳入00_index.md §1 | Header是全局信息，最适合放在所有人首先读到的索引入口 |
| 6 | 语义抽检方式 | 从「关键概念锚点」提问，验证单文件是否能独立回答 | 防止拆分后概念漂移（某个关键概念只存在于完整PRD的跨章上下文，单章无法理解） |

---

## 导航尾部

| 如果你需要了解… | 查阅文档 | 定位 |
|--------------|---------|------|
| prd-split Skill 完整规范 | `SKILL.md` | 全文 |
| 本次拆解的实际输出文件 | `sample_project_percentage_control/docs/PRD_split/PRD_billing_system_v1_20260410/` | 目录 |
| 拆解基线索引（输出） | `…/PRD_billing_system_v1_20260410/00_index.md` | 全文 |
| 原始 PRD（输入） | `sample_project_percentage_control/docs/PRD_billing_system_v1.md` | 全文 |
| prd-write Skill（上游） | `../prd-write/SKILL.md` | 全文 |
