-- WoWButlerCollector 简体中文本地化（唯一语言包；后续加语言在此目录扩展并修改 .toc 加载序）
WBC_LOCALE = {
  LOADED        = "魔兽管家拾取记录已加载：/wbc 查看命令",
  HELP_1        = "WoWButlerCollector 命令：",
  HELP_COUNT    = "  /wbc count — 查看已记录条数",
  HELP_EXPORT   = "  /wbc export — 导出说明（SavedVariables 落盘后转 JSON）",
  HELP_CLEAR    = "  /wbc clear — 清空全部记录（需二次确认）",
  COUNT         = "当前已记录拾取 %d 条",
  EXPORT_HINT_1 = "记录保存在 SavedVariables，输入 /reload 或退出登录后落盘：",
  EXPORT_HINT_2 = "  WTF\\Account\\<账号>\\SavedVariables\\WoWButlerCollector.lua",
  EXPORT_HINT_3 = "然后运行网站仓库转换脚本：node scripts/export-collector-to-json.js",
  CLEAR_CONFIRM = "确认清空全部拾取记录？输入 /wbc clear confirm 执行",
  CLEARED       = "拾取记录已清空",
  CAP_WARN      = "记录已达 %d 条，建议尽快导出并 /wbc clear（超出 %d 条将自动丢弃最旧记录）",
}
