# 团员为父、角色为子

基线 c5cb50e；用户图4显示同认领人两个角色分别统计，用户已确认改为团员一次考勤。

## Findings
|问题|证据|规范|修正|范围|置信度|
|---|---|---|---|---|---|
|成员页缺少所属团员关系展示|用户图4、renderMembers角色行|用户明确父子关系|展示团员并提供关联入口|成员/考勤|高|
|考勤每个角色一行被误当作独立人|renderAttendanceMembers、用户重复勾选反馈|同人一次考勤|按团员一行，展开实际角色|考勤|高|
|旧新统计若混合会误导|getAttendanceStats按member_id|历史不静默改写|显式口径选择及模式标签|仪表盘/统计/成员|高|

复用现有modal/form-select/button/checkbox和职业色；desktop优先是UI规范§8已知取舍。功能行为由已批准REQ195结构方案控制。新代码集中personAttendance.js，由app.js明确调用，数据写统一cloudCrud。验收交由真实Chrome+隔离Supabase脚本，覆盖关联、按人保存、角色展开、失败、旧新口径。
