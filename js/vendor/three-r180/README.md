# three.js r180 本地运行库

用于 REQ-209 家具静态 3D 浏览，零构建、无远程脚本。three.js / GLTFLoader / BufferGeometryUtils 来自 TASK-084 已存的 0.180.0 文件；OrbitControls 和 LICENSE 来源固定为官方 r180：

https://github.com/mrdoob/three.js/tree/r180

保留原 MIT LICENSE。GLTFLoader、BufferGeometryUtils、OrbitControls 中的裸 `three` 导入改为同目录 `./three.module.js`，其余实现不修改。运行库仅在点击 3D 时通过动态 import 加载，不采用全站 import map，不安装 npm 依赖。
