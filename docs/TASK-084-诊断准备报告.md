# 任务书 #84 图标诊断准备报告

> 2026-11-02 家里续接更新：当前状态以 [真机扫描与模型试点报告](TASK-084-真机扫描与模型试点报告.md) 为准：0.2.1真机扫描已完成；26项两图标字段全空；模型试点3成功/1植物失败，未批量替换。

> 2026-11-02｜插件诊断已准备；未运行游戏、未导出模型或替换任何图片。

`addon/WoWButlerDecor` 版本升为 0.2.1。原 `/wbd scan` 仍完整采集目录，额外在 `diag.iconTargets` 对 Patch1 26 个 recordID 保存 found、itemID/name、iconTextureType/value、iconAtlasType/value、asset、uiModelSceneID；每条目标先初始化 found=false，区分没有枚举到与字段为nil。`diag.scarecrowPepe` 单独记录26013是否出现，完整字段仍由原 items 白名单采集。没有新增 API 调用或数据写入通道。

保存文件说明纠正为 `WTF\Account\<账号>\SavedVariables\WoWButlerDecor.lua`（文件名取插件目录名，SavedVariables全局变量仍为WoWButlerDecorDB）。插件代码与 toc 版本均为0.2.1；toc Interface保持既有值，不猜当前客户端接口号。

本机原约定游戏路径不存在，但后续找到实际目录 `C:\Program Files (x86)\World of Warcraft\_retail_\`。已比对安装插件与仓库差异仅为本次0.2.1更新，随后同步两个文件，SHA256均一致。当前已有的扫描run_id仍为20261017-141224/addon0.2.0（文件晚于该日期写盘并不等于重新采集），转换得2313条、失败0，未含26013；需要新扫描。现有wow.export源码0.2.14含WebGL模型渲染器；本轮未导出模型或替换图片，也未触及图鉴UI代码。

插件已经同步，人工只需一次扫描，同时为#83和#84提供输入：

1. 进入游戏；若游戏已运行，先 `/reload` 加载刚同步的插件。
2. 执行 `/wbd scan`，聊天应显示插件v0.2.1及扫描结果。扫描结束后再次 `/reload` 写盘。
3. 告知Codex“扫描完成”，由Codex直接读取本机SavedVariables的 `WoWButlerDecor.lua`，无需手工复制/上传。

验证：使用临时安装的lupa2.8（只在TEMP工具目录，不是项目依赖）通过Lua语法编译；模拟搜索器对3条记录执行完整 `/wbd scan`，验证items全量保留、iconTexture/Atlas数值、nil字段类型、未枚举到目标found=false及佩佩存在标记。模拟不替代游戏真机；当前尚未游戏验收。拿到新文件后由Codex自动核对run_id/build、failCount、26013完整行、26880官方tags及26条图标诊断，再选择可用iconTexture/Atlas或模型试点路线。
