-- ============================================================
-- WoWButlerCollector core.lua —— 魔兽管家自动拾取记录（任务书 #75 子任务 A1；#75-补丁1 改版）
--
-- 职责边界（与 WoWButlerExporter 互补，不重叠）：
--   Exporter = EJ 静态字典采集（掉落池/套装）；本插件 = 运行时拾取事件记录。
--
-- 持久化唯一通道 = SavedVariables（WoW 沙盒无任意写文件 API）：
--   记录进全局表 WoWButlerCollectorDB，客户端在 /reload 或退出登录时序列化落盘
--   WTF\Account\<账号>\SavedVariables\WoWButlerCollector.lua（Lua 表，非 JSON）。
-- 导出通道（#75-补丁1 起）：/wbc export 插件内零依赖 JSON 编码 + 弹窗剪贴板直出，
--   粘贴进网站导入弹窗即可；仓库侧 SavedVariables→JSON 本地转换脚本已废弃删除，
--   INVTYPE→中文部位映射由前端 app.js 导入解析器承接。
--
-- 字段口径修正（先查证再断言）：
--   ①icon：WoW API 只能拿到图标 fileID 数字（GetItemInfo 第 10 返回值），拿不到字符串
--     icon_name——故字段名定 iconID（数字），与 Exporter REQ-092 同口径，
--     下游接 assets/icons/items/{iconID}.png 本地图标管道；
--   ②bossName：UnitName("target") 拾取瞬间不可靠，改用 ENCOUNTER_END 事件记录击杀首领
--     （180 秒归属窗），窗口外拾取留空不编值；
--   ③slot：存原始 equipLoc（INVTYPE_*），中文部位映射在转换脚本完成（Lua 端不内置词表）。
-- ============================================================

local L = WBC_LOCALE or {}

-- SavedVariables 初始化（toc 声明，客户端落盘；加载时可能已带历史数据，勿覆盖）
WoWButlerCollectorDB = WoWButlerCollectorDB or {}

local MAX_ENTRIES = 2000      -- 容量护栏：超出丢弃最旧（SavedVariables 体积保护）
local CAP_WARN_AT = 1000      -- 达到即每次上线提醒导出
local BOSS_WINDOW_SEC = 180   -- ENCOUNTER_END 后拾取归属窗口

-- 排除的物品类别（classID 数字判定，客户端语言无关——不比对本地化字符串）：
-- 0=消耗品 5=材料 7=商业货品 12=任务；保留 2=武器 4=护甲 15=杂项（套装兑换物在杂项）
local EXCLUDE_CLASS = { [0] = true, [5] = true, [7] = true, [12] = true }

-- ---- 聊天拾取消息解析（locale-safe：用客户端全局格式串，不硬编码中文句式） ----
-- 全局串例：LOOT_ITEM_SELF="你获得了战利品：%s。" / LOOT_ITEM="%s 获得了战利品：%s。"（zhCN）
local function fmtToPattern(fmt)
  local p = fmt:gsub("([%^%$%(%)%%%.%[%]%*%+%-%?])", "%%%1") -- 先转义全部模式魔法字符
  p = p:gsub("%%%%s", "(.+)")                               -- 还原 %s 为捕获组
  p = p:gsub("%%%%d", "%%d+")                               -- 还原 %d（多件后缀 xN，丢弃数值）
  return "^" .. p
end

local lootPatterns = {} -- { {pattern=..., selfLoot=bool, nameIdx=n} }
local function buildLootPatterns()
  local defs = {
    { fmt = LOOT_ITEM_SELF, selfLoot = true },
    { fmt = LOOT_ITEM_SELF_MULTIPLE, selfLoot = true },
    { fmt = LOOT_ITEM, selfLoot = false },          -- 团员拾取：第 1 捕获 = 拾取者名
    { fmt = LOOT_ITEM_MULTIPLE, selfLoot = false },
  }
  for _, d in ipairs(defs) do
    if type(d.fmt) == "string" then
      table.insert(lootPatterns, { pattern = fmtToPattern(d.fmt), selfLoot = d.selfLoot })
    end
  end
end

-- ---- 首领归属上下文 ----
local lastEncounterName = nil
local lastEncounterAt = 0

-- ---- 去重防抖（同拾取者同物品 2 秒内只记一次，聊天双发保险） ----
local lastLoot = { itemID = nil, looter = nil, at = 0 }

local function trimDB()
  while #WoWButlerCollectorDB > MAX_ENTRIES do
    table.remove(WoWButlerCollectorDB, 1)
  end
end

local function recordLoot(itemID, itemLink, looterName)
  -- 过滤：品质 < 4（史诗）不记；排除类别不记
  local itemName, _, quality, baseIlvl, _, itemType, _, _, equipLoc, iconID, _, classID = GetItemInfo(itemID)
  if not quality or quality < 4 then return end
  if classID and EXCLUDE_CLASS[classID] then return end
  if not itemName then return end -- 冷缓存未就绪：拾取瞬间物品已入包，理论必就绪；防御性跳过

  -- 只记录团本（任务书 #75-补丁1）：raid=团本 ✅；party=大秘境/地下城 ❌；none=世界BOSS/野外 ❌
  local instName, instanceType, difficultyID, difficultyName = GetInstanceInfo()
  if instanceType ~= "raid" then return end

  local ilvl = (GetDetailedItemLevelInfo and itemLink and GetDetailedItemLevelInfo(itemLink)) or baseIlvl
  -- 难度存中文名（#75-补丁1）：GetDifficultyInfo 返回本地化难度名（"史诗"/"英雄"/"普通"/"随机团队"）
  local difficulty = (GetDifficultyInfo and difficultyID and GetDifficultyInfo(difficultyID)) or difficultyName or "未知"

  -- 首领归属：击杀窗优先；窗口外尝试已死亡目标；均无则留空（不编值）
  local bossName
  if lastEncounterName and (time() - lastEncounterAt) <= BOSS_WINDOW_SEC then
    bossName = lastEncounterName
  elseif UnitExists("target") and UnitIsDeadOrGhost("target") then
    bossName = UnitName("target")
  end

  table.insert(WoWButlerCollectorDB, {
    itemName = itemName,
    itemID = itemID,
    iconID = iconID,           -- 数字 fileID（修正：API 无字符串 icon_name，见头部口径②）
    quality = quality,
    ilvl = ilvl,
    slot = equipLoc,           -- 原始 INVTYPE_*，中文映射在转换脚本
    itemType = itemType,       -- 本地化大类（武器/护甲）
    bossName = bossName,
    instanceName = instName,
    difficulty = difficulty,
    difficultyID = difficultyID,
    timestamp = time(),
    playerName = looterName,
  })
  trimDB()
end

-- ---- 事件分发 ----
local frame = CreateFrame("Frame")
frame:RegisterEvent("PLAYER_LOGIN")
frame:RegisterEvent("CHAT_MSG_LOOT")
frame:RegisterEvent("ENCOUNTER_END")

frame:SetScript("OnEvent", function(_, event, ...)
  if event == "PLAYER_LOGIN" then
    buildLootPatterns()
    print(L.LOADED or "WoWButlerCollector loaded")
    if #WoWButlerCollectorDB >= CAP_WARN_AT then
      print(string.format(L.CAP_WARN or "cap warn", #WoWButlerCollectorDB, MAX_ENTRIES))
    end
  elseif event == "ENCOUNTER_END" then
    local _, encounterName, _, _, success = ...
    if success == 1 then
      lastEncounterName = encounterName
      lastEncounterAt = time()
    end
  elseif event == "CHAT_MSG_LOOT" then
    local msg = ...
    if type(msg) ~= "string" then return end
    local itemID = tonumber(msg:match("|Hitem:(%d+)"))
    if not itemID then return end
    local itemLink = msg:match("(|c%x+|Hitem:.-|h%[.-%]|h|r)")
    for _, lp in ipairs(lootPatterns) do
      local caps = { msg:match(lp.pattern) }
      if #caps > 0 then
        local looter
        if lp.selfLoot then
          looter = UnitName("player")
        else
          if not IsInRaid() then return end -- 非团队场景不记他人拾取（世界频道噪声隔离）
          looter = (caps[1] or ""):gsub("%-[^%-]*$", "") -- 剥服务器后缀（名字-服务器 → 名字）
          if looter == "" then return end
        end
        -- 去重防抖
        local now = time()
        if lastLoot.itemID == itemID and lastLoot.looter == looter and (now - lastLoot.at) <= 2 then return end
        lastLoot.itemID, lastLoot.looter, lastLoot.at = itemID, looter, now
        recordLoot(itemID, itemLink, looter)
        return
      end
    end
  end
end)

-- ---- JSON 导出（任务书 #75-补丁1：插件内零依赖编码器 + 剪贴板弹窗，替代仓库转换脚本） ----
local function JSONEncode(tbl)
  local parts = {"["}
  for i, item in ipairs(tbl) do
    if i > 1 then table.insert(parts, ",") end
    table.insert(parts, "{")
    local fields = {}
    for k, v in pairs(item) do
      local val
      if type(v) == "string" then
        val = "\"" .. v:gsub("\\", "\\\\"):gsub("\"", "\\\"") .. "\""
      elseif type(v) == "number" then
        val = tostring(v)
      end
      if val then -- nil/布尔等非预期类型跳过该字段（当前记录仅 string/number，防御性兜底）
        table.insert(fields, "\"" .. k .. "\":" .. val)
      end
    end
    table.insert(parts, table.concat(fields, ","))
    table.insert(parts, "}")
  end
  table.insert(parts, "]")
  return table.concat(parts)
end

local function showExportFrame(json)
  local frame = _G.WoWButlerExportFrame -- 复用已建框架，避免重复 CreateFrame 泄漏
  if not frame then
    frame = CreateFrame("Frame", "WoWButlerExportFrame", UIParent, "BasicFrameTemplateWithInset")
    frame:SetSize(500, 400)
    frame:SetPoint("CENTER")
    frame.TitleBg:SetHeight(30)
    frame.title = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
    frame.title:SetPoint("TOP", frame.TitleBg, "TOP", 0, -8)

    local scroll = CreateFrame("ScrollFrame", nil, frame, "UIPanelScrollFrameTemplate")
    scroll:SetPoint("TOPLEFT", 10, -40)
    scroll:SetPoint("BOTTOMRIGHT", -30, 10)

    local editBox = CreateFrame("EditBox", nil, scroll)
    editBox:SetMultiLine(true)
    editBox:SetFontObject("ChatFontNormal")
    editBox:SetWidth(440)
    editBox:SetScript("OnEscapePressed", function() frame:Hide() end)
    scroll:SetScrollChild(editBox)
    frame.editBox = editBox
  end
  frame.title:SetText(L.EXPORT_TITLE or "WoWButler 拾取记录导出")
  frame.editBox:SetText(json)
  frame:Show()
  frame.editBox:SetFocus()
  frame.editBox:HighlightText() -- 先聚焦再高亮，保证 Ctrl+C 一键复制全文
  print(L.EXPORT_DONE or "WoWButler: JSON 已生成，请按 Ctrl+C 复制全部内容")
end

-- ---- 斜杠命令 ----
SLASH_WBC1 = "/wbc"
SlashCmdList["WBC"] = function(msg)
  msg = (msg or ""):gsub("^%s+", ""):gsub("%s+$", "")
  if msg == "" or msg == "help" then
    print(L.HELP_1 or "commands:")
    print(L.HELP_COUNT or "")
    print(L.HELP_EXPORT or "")
    print(L.HELP_CLEAR or "")
  elseif msg == "count" then
    print(string.format(L.COUNT or "%d", #WoWButlerCollectorDB))
  elseif msg == "export" then
    showExportFrame(JSONEncode(WoWButlerCollectorDB))
  elseif msg == "clear" then
    StaticPopupDialogs["WBC_CLEAR_CONFIRM"] = {
      text = L.CLEAR_CONFIRM_TEXT or "确定清空所有拾取记录？",
      button1 = L.BTN_OK or "确定",
      button2 = L.BTN_CANCEL or "取消",
      OnAccept = function()
        wipe(WoWButlerCollectorDB)
        print(L.CLEARED or "拾取记录已清空")
      end,
      timeout = 0,
      whileDead = true,
      hideOnEscape = true,
    }
    StaticPopup_Show("WBC_CLEAR_CONFIRM")
  else
    print(L.HELP_1 or "commands:")
  end
end
