# 已知问题记录

## 当前版本：V2.1.2

### 已修复问题（V2.1.2）

| 问题 | 根因 | 修复方式 |
|------|------|----------|
| 仪表盘人数与考勤记录不一致 | 统计口径不统一（仪表盘漏掉"迟到"） | 统一为 出席+替补+迟到 |
| 心愿单编辑/删除/标记失效 | 云端新增时 item 无 `id` 字段 | 添加 `id: genId()` 到 pendingWishes |
| 心愿单重复提交 | 无防重复机制 | 添加 `wishlistSaving` 标志 |
| 装备分配第二条无法保存 | saveData() 自动 reload 覆盖本地 | 改为 cloudCrud DB-first |
| 成员新增不立即显示 | 乐观更新模式 | 改为 cloudCrud DB-first |
| syncMember 字段缺失 | 未映射 status/join_date/notes 等 | 补全字段映射 |
| importFromWCL 无云端同步 | 直接修改 appData | 改为 cloudCrud 逐条导入 |
| lootImportJSON 云端不一致 | 直接赋值 appData | 改为逐条 saveCloudData + reloadData |
| wishlistImportJSON 云端不一致 | 直接赋值 appData | 改为逐条 saveCloudData + reloadData |

### 建议优化（低优先级）

1. **成员导入性能**: 批量导入时循环调用 cloudCrud，可优化为批量 insert + 单次 reload
2. **心愿单导入性能**: 同上
3. **统计报表缓存**: 每次进入报表页面重新计算，可添加内存缓存
4. **活动编辑**: `start_time`/`end_time` 是前端字段，不持久化到 DB
5. **数据重置**: 云端模式重置功能未完全实现（需要 owner 权限批量删除）

### 未来版本规划

- V2.2: 玩家履历系统（基于 loot_records 聚合）、raid_participants 独立表
- V2.2: 招募系统基础
- V2.3: 飞书多维表格实时同步（替代 JSON 中转）
- V2.3: 装备分配规则引擎（DKP/EPGP/GKP）
- V2.4: 移动端 PWA 支持
- V2.4: 数据可视化报表（图表库）
- V3.0: 多公会支持（跨公会成员）
- V3.0: API 开放平台

### 环境限制

- **浏览器兼容**: 需要支持 ES6+ 的现代浏览器
- **Supabase 限制**: 免费版有 500MB 数据库空间限制
- **飞书集成**: 需要手动配置飞书多维表格和字段映射
- **移动端**: 响应式支持，但复杂表格在手机上体验有限
