# 家具静态模型

REQ-209 / REQ-205。`task084/` 的 26 件 GLB 来自本项目 TASK-084 已有离线转换输出，不从第三方网页热链接。业务 record_id、游戏 asset_id、字节数、SHA256 和原始混合模式收录在 `js/decorModelManifest.js`，不是 icon_file_id 映射。

- 采集版本：国服 12.1.5.70688，目录快照 `data/task083/catalog-current-2335.json`。
- 导出器：wow.export 0.2.14，固定提交 `caf2bb0006930e151cd3810fba0f7d55e2e4b562`。
- 导出来源与说明：`docs/TASK-084-真机扫描与模型试点报告.md`、`scripts/decor/probe_task84_models.js`。
- 运行时沿用已登记的静态材质处理：过滤无贴图与特效薄片，叶片双面裁切；28559 特定特效网格不显示。仅展示静态外形，不承诺游戏粒子、动画、染色或全目录覆盖。
- GLB 保持原字节未修改，贴图内嵌；无动画。关闭或切回图片释放资源。

模型来自游戏素材，不属于 three.js 开源许可范围；维护来源记录，不以工具许可作为素材许可。禁止用户上传任意模型到该路径。
