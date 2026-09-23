# TASK-058-WP2-2 修改报告：导出图片模式 + 三皮肤 + 阵营水印

> 执行：Kimi Code ｜ 2026-09-24 ｜ 状态：送审（未 commit / 未 push）
> 任务书：tasks/任务书58-WP2-方案单独立页与图片导出.md（WP2-2 段）

## 一、前置自查

- 基于 WP2-1 送审态工作区直接施工（任务书 WP2-2 段逐条核对）；《开发规范》再读，零依赖零构建红线确认：Canvas 手绘，未引入 html2canvas 等任何库。
- 素材核对：`assets/decor-brand/` 三枚水印均为 RGBA 透明底 PNG（wb-shield 1024² / alliance 840×859 / horde 860×1138），按任务书口径标注「正式上线前评估简化重绘」（代码注释在案）。
- WP1 文字导出锚点（id `dhPlanExportText`/`dhPlanCopyBtn`、类 `dh-plan-export-overlay`、提示文案）逐条确认保留——tab 化仅迁移不改造。

## 二、执行明细（4 改 + 1 新增 + 物料）

| 文件 | 改动 |
|---|---|
| js/decorData.js | ①EXPORT_SKINS 皮肤表（金边 #C9A869→wm-wb-shield / 狮蓝 #4A7FBF→wm-alliance / 战红 #B03A2E→wm-horde）+ 硬规格常量（EXPORT_IMG_W 900 / WM_W 150 / WM_MARGIN 16 / WM_ALPHA 0.18 / BG #0F1115）；②`planDrawExportImage` 绘制规格：卡底圆角 8 + 3px 肤色边框 → 水印先绘垫底（右下锚定算式 W-16-150）→ 文字层（标题肤色/件数/清单行/合计行/页脚固定链接），卡高=内容自然高度；③水印加载缓存 + 404 优雅降级（console.warn+无水印出图不阻断）；④导出弹窗 tab 壳「文字预览（默认聚焦）/ 生成图片」，文字模式原样迁移；⑤图片模式：左 Canvas 实时预览（900 位图 CSS 缩放）+ 右皮肤三选一 radio（切换即时重绘，过期回调丢弃）+「保存图片 PNG」（toBlob 下载 `{方案名}-魔兽管家.png`）+「复制图片到剪贴板」（ClipboardItem，失败自动降级下载+toast 说明）；⑥埋点 decor_plan_export_image {skin} 双挂点（白名单属 WP2-3）；⑦空方案放行导出（原「先挑几件装饰」硬拦截移除——WP2-2 验收要求无清单出图，见决策点 1） |
| css/decor-public.css | .dh-exp-tabs/.dh-exp-tab(tab 壳)、.dh-exp-image-body 双栏（预览+200px 控件列）、皮肤 radio 卡、768px 纵向堆叠、弹窗宽 520→760、reduced-motion |
| index.html / decor.html | 版本串 20260923.75 → **20260923.76**（index×15 / decor×6） |
| scripts/verify-task58.js / verify-task58-wp2-1.js | VER 常量跟随 .76（零逻辑改动） |
| scripts/verify-task58-wp2-2.js | 新增（A 静态 13 + B 实测 11 + C 清零 3 = 24 项 + 前置） |
| backup/2026-09-24-task58-wp2-2/ | **三皮肤导出 PNG 原件**（export-gold/alliance/horde.png，900×244）+ 无水印降级件 + 空方案件 + 弹窗界面截图 |
| diff-task58-wp2-2.txt | 全量 diff 物料 |

**未动红线**：WP1 文字导出逻辑、抽屉/独立页/多方案、track.js/server.js/sql（A8 diff 锁名绿）、零第三方库。

## 三、硬门验证输出

- `node --check` 全过；server-security 5/5。
- **verify-task58-wp2-2.js：24/24 绿**（真浏览器）：
  - B1 tab 壳默认聚焦文字预览 + WP1 文字格式逐字不回归；B2 画布宽=900、三 radio、默认金边；
  - B3 切皮肤预览即时重绘（三态 dataURL 互异）；B4 像素复核：边框 rgb(176,58,46)=#B03A2E±4、右下水印区 18% 叠底异色素 36 样本在场；
  - B5 三皮肤导出 PNG：均 900×244、文件名「我的方案单-魔兽管家.png」、原件落物料区；
  - B6/B7 复制成功 toast / 降级自动下载+说明 toast 双路径实证；B8 水印 404（route abort）→ console 告警 1 条+无水印出图不阻断；
  - B9 空方案出图：卡高 212 < 有清单 244（自然高度不撑）+ PNG 正常；B10 零 JS 报错零意外 4xx；C 段四清零。
- **回归：verify-task58.js 48/48 绿（WP1+补丁全量）、verify-task58-wp2-1.js 32/32 绿**——文字导出二次确认/复制/降级链路无漂移。

## 四、sha256 物料（diff 后复算）

```
275c1802ba47c6c9660fb6bda238e03ea4b9f63620225400cf78d9f4d962fcbc  js/decorData.js
b506d19acab8e2360dc46ee62c74c1300ec326421eda570f8e3c5580cdc22c5e  css/decor-public.css
8882151705b6bb8918a1e24d637ee15a63a4da447c4bf1483a69ff1b50278a75  index.html
8eac3604cf2afb79ce86d72a9d63218882fcce504e739893cdfb2f75bf0d7855  decor.html
468613cf9d445938669b6b26766ce51d76e8fcbb508ab2bf2ed7fd4f07dca434  scripts/verify-task58-wp2-2.js
e606a96ec79a0621902b73c1602946cbb7f4dfb5cd9609b397e7f51bc2a07a40  scripts/verify-task58.js
65257118c5e8c06a4fa2532e55ae69b60aa51706de129d6e4ac3784106e745b1  scripts/verify-task58-wp2-1.js
3fc9e1103cc0980f9d03124542b9f094d0f31e00aa29a19497e52ee747a9eafd  diff-task58-wp2-2.txt
0abc9c0e20fa5c421d24c53cb2c09a8fa3dbb6ac6276d4f66850f30e1f7fbf94  export-gold.png（原件）
9ae45cdaf3185f673b3d3cb8948329e3462be76fe695dd6b5f166d81efd2d32e  export-alliance.png（原件）
6b6b2f6d3c89be7a41c28ce82cd910d1429c2513bff93ca9e841b6462ed21d6d  export-horde.png（原件）
```

## 五、设计决策与遗留（送审确认点）

1. **空方案放行导出**：WP1 的「方案单还是空的，先挑几件装饰」硬拦截移除——WP2-2 验收硬性要求「无清单导出 PNG」；空方案出图为标题+占位提示行+合计 0 件+页脚+水印的最小卡。若运营要保留空拦截只放行图片 tab，请示下。
2. **弹窗加宽 520→760**：图片模式双栏需要，文字模式随动（无其他改造）。
3. **水印叠字**：清单右列小字与大图水印（联盟/部落徽记较高）存在区域重叠，按任务书「垫于清单与页脚文字之下」口径实现——水印在底层、文字清晰在上，属设计内行为。
4. **遗留**：①decor_plan_export_image 已挂点待 WP2-3 扩白名单；②decor-plan 页签 PV 吞没（WP2-1 登记）待 WP2-3 定夺；③素材过渡使用口径（正式上线前评估简化重绘）台账在案；④更新日志随 release。
