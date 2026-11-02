# #84 真机扫描与模型缩略图试点

> 后续用户扩展范围与最新状态见 [#83/#84收尾报告](TASK-083-084-收尾报告-20261102.md)，下文为该阶段历史记录。

> 2026-11-02。真机扫描完成，模型试点4条：原始文件4/4读取；GLB及PNG3/4成功；植物1条导出失败，按任务停止批量26张。样图未接入产品、未做游戏目录并排终验。

## 确定结论

家宅插件0.2.1真机run_id=20261102-224408/client12.1.5/build70688/full，2335条零失败。26目标全部found=true，iconTextureType与iconAtlasType均为nil，asset及uiModelSceneID均存在。证据在data/task083/scan-evidence-20261102.json。这次客户端确实未返回这26条的两种图标字段，排除“插件漏记Atlas导致本批缺图”假设；不能据此声称所有客户端/未来build永远没有图标。

因此本批现有按iconTexture提取官方小图的管线没有输入；没有Atlas名字/坐标可裁切。后续应采用模型静态缩略图，保留64px物品图回退，不靠放大/裁金边冒充高清。

## 实跑模型与渲染结果

直接从本机`C:/Azeroth/World of Warcraft`下CASC读取，强制禁用远端回退；实际build=12.1.5.70688，BuildKey=0149337da1d526fc64bf43982c650577。使用wow.export0.2.14源码固定提交`caf2bb0006930e151cd3810fba0f7d55e2e4b562`，不是公司临时目录。整包下载90秒超时后，改从该固定提交获取所需192个源码文件（约1.94MB），全部成功；不将下载超时称为游戏CDN未更新。

| record_id | 样本 | asset | 原始M2字节 | GLB字节 | 结果 |
|---:|---|---:|---:|---:|---|
|28569|符文格里恩圣匣|3189119|398280|950960|带贴图GLB/512px透明PNG成功|
|27684|堕罪堡餐桌|3051536|57960|312392|带贴图GLB/512px透明PNG成功|
|27220|莉莉斯塔萨的毛绒幸运鸭|4551444|58772|226288|带贴图GLB/512px透明PNG成功|
|28556|繁茂天界月枝|3053186|89736|无|M2可读；GLB导出时textureComboIndex引用异常|

成功3例使用临时three0.180.0/GLTFLoader+Chrome headless/SwiftShader渲染，统一透视相机、包围球取景、半球光+方向光、512px透明背景；仅本地loopback隔离预览服务，不启动项目server.js、不读env、不添加网站运行时依赖。GLB几何三角形分别2550/280/476。已逐张查看：对象可识别、完整入框、有贴图、无物品品质金边。黑色显示区域是透明背景显示效果。尚未与游戏Housing Catalog逐张并排比对，不能代替最终视觉验收；圣匣等原模型的金色装饰本身应保留。

- [圣匣样图](evidence/task084-20261102/28569.png)
- [餐桌样图](evidence/task084-20261102/27684.png)
- [毛绒鸭样图](evidence/task084-20261102/27220.png)
- [像素/哈希/模型结果manifest](evidence/task084-20261102/manifest.json)

PNG通过Chrome Image.decode完整解码，三张均512×512，透明度范围0..255。曾尝试Pillow检查，但本机未安装Pillow，改用浏览器解码验证，不冒称Pillow通过。所有GLB/临时渲染工具和第三方源码仍在被Git忽略的scripts/decor/out，只有样图证据与manifest纳入可审阅文件。

## 植物失败与解决方案

错误来自wow.export M2Exporter.exportAsGLTF：遍历子网格时，skin.textureUnits.find未命中，后续仍直接取texUnit.textureComboIndex；本样本在此报Cannot read properties of undefined。原M2已成功解码读取，不能将此归为模型不存在或CASC网络失败。未改第三方实装来简单跳过子网格，因为这可能删掉叶片/透明面并产生看似成功的残缺图。

下一步应先列出28556每个子网格与textureUnit的对应关系，核对这些网格是可安全省略的空/辅助网格还是实际可见叶片；必要时直接复用wow.export原生渲染器生成PNG，或修正临时导出器并逐网格验证。植物、透明边缘和统一取景通过后，才能批量26张。当前按#84停止条件未扩批，未覆盖现有图片。

通过后采用独立record_id路径和显式映射：目录官方图 > 验收模型缩略图 > 原64px物品图 > 占位图。模型图不得冒用FileDataID文件名；接入decorData.js前另做规定UI审计及卡片/详情浏览器验收。本轮没有UI源代码变更。

## 工具与复现

新增scripts/decor/probe_task84_models.js，Node24+，可传`--game-dir`（World of Warcraft根目录）。默认只跑上表4件，写出scripts/decor/out/task084-probe-result.json及task084-models/*.glb；任一失败返回非零。node --check通过。实际复跑仍为3成功/1植物失败。

依赖固定源码位于scripts/decor/out/wow.export-main/src/js。为Node无头适配仅桩化UI/core/listfile/mmap/cache以及未使用的WebP接口，不修改CASC/M2/BLP/GLB官方解析导出实现；PNG纹理解码由官方BLP模块执行。WebP桩若被调用即抛错。源码来源/获取结果留在out/wow.export-main/task084-provenance.json。临时渲染入口为out/task084-models/preview.html及render.cjs；three模块仅在临时vendor目录。原始PNG和manifest留在docs/evidence，避免只存临时缓存。

一手源码核对：[家宅导出和PNG预览](https://github.com/Marlamin/wow.export/blob/caf2bb0006930e151cd3810fba0f7d55e2e4b562/src/js/modules/tab_decor.js)、[模型导出器](https://github.com/Marlamin/wow.export/blob/caf2bb0006930e151cd3810fba0f7d55e2e4b562/src/js/3D/exporters/M2Exporter.js)。源码有预览能力不等于批处理已通过，本报告以本机实跑为准。

未替换产品26图、未改映射/线上DB、未提交/推送/部署，#84尚未收官。完整交互3D查看器不在本任务范围。
