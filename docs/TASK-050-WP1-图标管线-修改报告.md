# 任务书 #50 WP1 修改报告：家宅装饰图标管线（REQ-137 一期）

> 日期：2026-09-17 ｜ 范围：`assets/decor-icons/`（2022 张 PNG 新增）、`scripts/decor/export_icons.js`（新增）、`scripts/decor/resize_icons.py`（新增）、`scripts/decor/make_placeholder.py`（新增）、`scripts/decor/out/`（manifest/原生件/wow.export 源码与 CASC 缓存，产物目录 gitignore 不入库）
> 纪律：完工送审，**未 commit 未 push**；零数据库/零前端改动；`docs/问题与需求清单.md` REQ-137 行**未动**（台账由运营定稿，本报告注明待更新）。
> 环境申报：tools/python 新增 pip 依赖 pillow 12.3.0（占位图与压缩用，用户级 site-packages，不动系统）；wow.export 官方源码（Marlamin/wow.export，main 分支，0.2.14，MIT）经 codeload.github.com 拉取解压至 `scripts/decor/out/wow.export-main/`（github.com 主域本机不通，codeload 正常），原 tar 留档 `scripts/decor/out/wowexport-src.tar.gz`（117MB，可再生可删）。

---

## 一、侦察结论（任务书「先侦察再定案」三项全答）

**① wow.export 在线模式 2021 件量级批量可操作性**：wow.export 为 node-webkit GUI 应用，**无官方 CLI/脚本接口**（仓库 README 全功能清单无命令行条目，构建仅产出 GUI 二进制），GUI 逐件手点 2021 件不可行。可行自动化路径（任务书允许的「GUI 不可脚本化时评估可行自动化路径」）：**无头复用 wow.export 官方源码模块**——`casc/casc-source-remote.js`（在线模式本体：versions → cdns → config → encoding/root → archive 索引 → 分片下载，暴雪公共 CDN 流式取文件）、`casc/blte-reader.js`（BLTE 解码）、`casc/blp.js` + `png-writer.js`（BLP 原生解码 → PNG），仅对 GUI 运行时依赖（`nw` 全局 / `core.js` 视图状态 / `listfile.js` / `mmap.js` 原生模块）打桩，**数据链路 100% 为官方实现**，与 GUI 在线模式同一通道。证据：驱动脚本 `scripts/decor/export_icons.js`，实测 2021/2021 全量导出成功（见第三节）。region=us（与 cn 同一全球 build 12.1.0.69814，versions 实测各区 BuildConfig 一致），locale=zhCN（目录采集自国服客户端）。

**② 单张 PNG 尺寸与体积实测（小样 23 件先行，全量复核）**：原生 BLP 尺寸 **400×400**（2000 件）与 **128×128**（21 件）；原生 400 单张均值 ~51KB，**原生全量推算 ~99MB、实测 87.0MB**。按任务书「过大压一遍」压至 128×128（LANCZOS + optimize）后单张均值 ~9.7KB，**终版全量实测 19.25MB**。

**③ 存放两案对比**：案 A（git 入库 `assets/decor-icons/`，沿袭任务书 #22 iconMap 本地化先例）终版 19.25MB ≤ 50MB 硬门，部署零依赖；案 B（Supabase Storage）仅在 >50MB 时启用，本批不需要。→ **定案：案 A**。

**定案结论：案 A + 128×128 终版**（原生 400 过大压一遍；21 件原生即 128 不拉申原样落盘）。未触发任何停手条件。

## 二、BLTE 加密件处置（过程申报）

基准件 8198895（28350 暴雪嘉年华门垫）首轮导出报 `[BLTE] Missing decryption key a1513d5a172e3475`——个别装饰图标带 BLTE 加密。wow.export 官方机制为从社区公开密钥库 wowdev/TACTKeys 拉取（`src/default_config.jsonc` 的 `tactKeysURL`）；实测该 key 在公开列表内（`A1513D5A172E3475`），驱动脚本接入 `casc/tact-keys.js` 官方加载链路后该件正常导出。**最终失败清单 = 0**，无遗留加密件。

## 三、导出统计（实测）

```
输入：scripts/decor/out/decor_catalog.json，icon_file_id 非空 2021 件（唯一 2021，无重复）
通道：wow.export 在线模式（无头复用官方模块），build = 12.1.0.69814 (9712ae9c84cc54111e9e3ddf9a6b8019)，region=us，locale=zhCN
导出：成功 2021 / 失败 0（icons_failures.json 为空数组）
原生：400×400 ×2000 + 128×128 ×21，合计 87.0MB（scripts/decor/out/icons-native/，gitignore）
终版：128×128 ×2021，合计 20,186,046 B ≈ 19.25MB（assets/decor-icons/，入 git）
占位：_placeholder.png 128×128 596B（深底 + 金问号 + 箱子剪影，pillow 生成，已目验）
全量耗时：约 5 分钟（1998 件批次，并发 8；encoding/root/索引一次性下载约 400MB 入缓存）
manifest：scripts/decor/out/icons_manifest.json（build + 每件 fileID → 原生宽高/字节/终版字节/导出时间 ISO）
```

缺图标 41 件（icon_file_id 空）按任务书不做提取，统一指向占位图。41 件 record_id 清单：`9627,4429,291,7,1,11,12,3,2,14,9,15,8,6,13,50,10,48,223,233,296,297,400,401,294,151,292,132,281,277,273,282,286,307,283,285,290,289,288,287,113`（大头为 39 件房间/户型条目，与 #49 口径一致）。

## 四、可复跑 / 增量验证

- `node scripts/decor/export_icons.js --outdir scripts/decor/out/icons-native` 重跑实测：`目标 2021 件，已完成 2021 件，本次导出 0 件`（manifest 有记录 + PNG 在盘即跳过）；
- `tools/python/python.exe scripts/decor/resize_icons.py` 重跑实测：`新压 0，跳过 2021`（final_bytes + 终版 PNG 在盘即跳过）；
- 失败件不静默吞：逐件记 `icons_failures.json`（fileID + 原因 + 时间），成功即移出；下赛季新批次只需重跑两条命令增量补图；
- wow.export 源码与 CASC 缓存（encoding/root/索引/数据）均在 `scripts/decor/out/` 产物目录，gitignore 在案，删除后按 `export_icons.js` 头注释一条 curl + tar 即可重建。

## 五、10 件抽查记录（ReadMediaFile 实图目验，全部对得上）

| record_id | icon_file_id | 名称 | 终版 PNG 目验 |
|---|---|---|---|
| 28350 | 8198895 | 暴雪嘉年华门垫 | 蓝底 BlizzCon 标志门垫 ✓（基准） |
| 27973 | 8117511 | 月溪镇旧式夜景窗 | 木框菱形彩玻璃窗 ✓（基准） |
| 27043 | 8123813 | “受枷者的狂怒”壁画 | 深绿邪能风格挂墙壁画 ✓（基准） |
| 8975 | 7424795 | 木制花槽 | 木质长条花槽 ✓ |
| 2090 | 7422353 | 蒙皮木制长椅 | 木框长椅 ✓ |
| 9488 | 7340490 | “堕落的守护者”无框画 | 守护者形象挂画 ✓ |
| 15497 | 7506634 | 哈籁尼尔鸣镝 | 箭矢（鸣镝） ✓ |
| 11380 | 7426063 | 星光占卜之池 | 蓝光小池/盆 ✓ |
| 19848 | 7655921 | 葱郁花园地毯 | 叶形绿地毯 ✓ |
| 15501 | 7507164 | 光绽苔藓堆 | 发光苔藓堆 ✓ |

随机 7 件取样方式：种子 20260917 的 LCG 在 2018 件非基准池中不放回抽取（脚本在案可复现）。抽查结论：**10/10 PNG 可打开、内容与名称对得上**；占位图单独目验合格。

## 六、调研依据（任务书红线三条必附）

1. **wow.export 官方仓库在线模式 / CDN 流式**：[Marlamin/wow.export](https://github.com/Marlamin/wow.export)（原 Kruithne/wow.export 迁移至此），README「Complete online support allowing streaming of all files without a client」；本批使用 main 分支 0.2.14 源码，`src/js/casc/casc-source-remote.js` 即在线模式实现（版本/CDN 配置 → encoding/root → archive 索引 → HTTP Range 分片取件），`src/js/casc/blp.js` BLP→PNG 原生导出。
2. **wago.tools API（备选通道，未启用）**：任务书指定备选 `get_file_by_fdid`（按 FileDataID 取 CASC 文件字节流）；首选通道已全量跑通（2021/2021、0 失败），按任务书「仅在 wow.export 在线模式跑不通时启用」规则**未启用**，特此备案。
3. **语料统计口径**：任务书 #50 前置状态（2062 件在库 / icon 非空 2021 / 空 41）与 `scripts/decor/out/decor_catalog.json` 本 WP 实测复核逐字吻合（icon 非空 2021、唯一 2021、空 41；三件基准 icon_file_id：28350→8198895 / 27973→8117511 / 27043→8123813）。

## 七、遗留与申报

- REQ-137 台账行**待运营定稿更新**（本 WP 未动 `docs/问题与需求清单.md`，遵红线）。
- `scripts/decor/WoWButlerDecor.lua` 为 #49 输入件（非本 WP 产物），当前未被 .gitignore 覆盖（#49 只忽略了根目录同名件），commit 时请勿带入；是否补 ignore 规则请运营定夺。
- 原生 400×400 全量件（87MB）与 wow.export 源码/缓存（~530MB）留存于 `scripts/decor/out/`（gitignore），供复跑与复核；如需清理磁盘可整目录删除，按脚本头注释可重建。
- `webp-wasm` 在 `scripts/decor/out/wow.export-main/node_modules/` 下为桩模块（仅 toWebP 用，本流程不触发）；若日后改用 wow.export 的 WebP 导出需 `npm i webp-wasm` 真包。
- `node --check scripts/decor/export_icons.js` 通过；Python 两脚本已真跑成功即语法实证。

## 八、送审件清单

| 件 | 路径 | 入库 |
|---|---|---|
| 终版图标 2021 张 + 占位图 | `assets/decor-icons/`（19.25MB） | 是（案 A） |
| 导出脚本（wow.export 无头驱动） | `scripts/decor/export_icons.js` | 是 |
| 压缩脚本（400→128） | `scripts/decor/resize_icons.py` | 是 |
| 占位图生成脚本 | `scripts/decor/make_placeholder.py` | 是 |
| manifest / 失败清单（空） | `scripts/decor/out/icons_manifest.json` / `icons_failures.json` | 否（产物目录） |
| 原生件 / wow.export 源码与缓存 | `scripts/decor/out/icons-native/`、`wow.export-main/`、`wowexport-data/` | 否（产物目录） |
| 任务书存档 | `tasks/任务书50-家宅图鉴数据补齐-图标与来源结构化.md` | 建议随附 |
| 修改报告 | `docs/TASK-050-WP1-图标管线-修改报告.md`（本件） | 是 |

## 九、commit 物料建议（运营执行，顾问终审通过后）

标题：

```
任务书#50-WP1：家宅装饰图标管线（REQ-137）
```

描述（三段式）：

```
【改了什么】新增 assets/decor-icons/ 2022 张 PNG——2021 张家宅装饰图标
（{icon_file_id}.png，128×128，wow.export 在线模式从暴雪公共 CDN 流式取件 +
BLP 原生导出，build 12.1.0.69814，原生 400×400 压至 128，21 件原生 128 不拉申）
+ 1 张缺图标统一占位图 _placeholder.png（深底金问号箱子，41 件无 icon 件用）；
新增 scripts/decor/export_icons.js（无头复用 wow.export 官方 CASC/BLTE/BLP 模块
的批量导出驱动，含 wowdev/TACTKeys 公开密钥链路与 icons_manifest.json 增量跳过）、
resize_icons.py（LANCZOS 压缩入库）、make_placeholder.py（pillow 占位图）；
任务书 #50 存档 tasks/。
【范围】assets/decor-icons/（2021 图标 + 1 占位，合计 19.25MB ≤ 50MB 案 A 定案）、
scripts/decor/ 三脚本、tasks/ 任务书存档；零 js/css/html 前端改动，零数据库改动；
manifest/原生件/wow.export 源码缓存均在 scripts/decor/out/（gitignore 产物目录）。
【验证】全量导出 2021/2021 成功 0 失败（失败清单空；8198895 BLTE 加密件经
TACTKeys 公开密钥正常解码）；增量复跑实测导出 0 件/压缩 0 件全跳过；
10 件抽查（3 基准 28350 门垫/27973 夜景窗/27043 壁画 + 种子随机 7 件）
ReadMediaFile 实图目验 10/10 内容对得上；体积实测原生 87.0MB → 终版 19.25MB；
node --check 通过；台账 REQ-137 行待运营定稿。
```
