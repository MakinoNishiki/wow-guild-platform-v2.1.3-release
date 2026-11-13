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
--     （180 秒候选窗），窗口外拾取留空不编值，最终来源仍需核对；
--   ③slot：存原始 equipLoc（INVTYPE_*），中文部位映射在网站导入解析器完成。
-- ============================================================

local L = WBC_LOCALE or {}

-- SavedVariables 初始化（toc 声明，客户端落盘；加载时可能已带历史数据，勿覆盖）
WoWButlerCollectorDB = WoWButlerCollectorDB or {}
WoWButlerCollectorSettings = WoWButlerCollectorSettings or {}
if WoWButlerCollectorSettings.enabled == nil then WoWButlerCollectorSettings.enabled = true end
WBC_Collector = {} -- ui.lua 只消费状态与动作，采集/导出保持一个实现
local API = WBC_Collector
API.version = "1.0.5"

local MAX_ENTRIES = 2000      -- 容量护栏：超出丢弃最旧（SavedVariables 体积保护）
local CAP_WARN_AT = 1000      -- 达到即每次上线提醒导出
local BOSS_WINDOW_SEC = 180   -- ENCOUNTER_END 后拾取归属窗口

-- 排除的物品类别（classID 数字判定，客户端语言无关——不比对本地化字符串）：
-- 0=消耗品 5=材料 7=商业货品 12=任务；保留 2=武器 4=护甲 15=杂项（套装兑换物在杂项）
local EXCLUDE_CLASS = { [0] = true, [5] = true, [7] = true, [12] = true }

-- REQ-189：按客户端难度 ID 判断，不能按语言或品质猜测副本难度。
-- 暴雪 Mainline/DifficultyUtil_Base.lua：14/15/16；旧团本普通3/4/9、英雄5/6。
-- 7/17为随机团；时光漫游/剧情/特殊和未知难度不自动归入三档。
local RAID_DIFFICULTY = {
  [3] = "普通", [4] = "普通", [9] = "普通", [14] = "普通",
  [5] = "英雄", [6] = "英雄", [15] = "英雄", [16] = "史诗",
}

-- ---- 聊天拾取消息解析（locale-safe：用客户端全局格式串，不硬编码中文句式） ----
-- 全局串例：LOOT_ITEM_SELF="你获得了战利品：%s。" / LOOT_ITEM="%s 获得了战利品：%s。"（zhCN）
local function fmtToPattern(fmt)
  local p = fmt:gsub("([%^%$%(%)%%%.%[%]%*%+%-%?])", "%%%1") -- 先转义全部模式魔法字符
  p = p:gsub("%%%%s", "(.+)")                               -- 还原 %s 为捕获组
  p = p:gsub("%%%%d", "(%%d+)")                               -- 保留多件数量
  return "^" .. p .. "$"
end

local lootPatterns = {} -- { {pattern=..., selfLoot=bool, nameIdx=n} }
local function buildLootPatterns()
  local defs = {
    { fmt = LOOT_ITEM_SELF_MULTIPLE, selfLoot = true, multiple = true },
    { fmt = LOOT_ITEM_SELF, selfLoot = true },
    { fmt = LOOT_ITEM_MULTIPLE, selfLoot = false, multiple = true },
    { fmt = LOOT_ITEM, selfLoot = false },
  }
  for _, d in ipairs(defs) do
    if type(d.fmt) == "string" then
      table.insert(lootPatterns, { pattern = fmtToPattern(d.fmt), selfLoot = d.selfLoot, multiple = d.multiple })
    end
  end
end

-- ---- 首领归属上下文 ----
local lastEncounterID = nil
local lastEncounterName = nil
local lastEncounterAt = 0

-- ---- 本客户端聊天事件去重：只认lineID，不以时间窗吞掉真实多件 ----
local lastLoot = { itemID = nil, looter = nil, at = 0 } -- retained for clear compatibility
local seenLines, lineOrder = {}, {} -- local chat event identity only, never shared across clients
local pendingCount = 0
local clearGeneration = 0 -- 清空后取消尚未完成的缓存重试，防止旧记录重新出现
local failedCount, lastError = 0, nil -- 本次登录诊断，不混入可导出的拾取数组

local function notify()
  if API.RefreshUI then API.RefreshUI() end
end

-- 旧记录没有原始链接，无法核实绑定/真实装等：保留原样，但不再混入正常导出。
local function isExportable(row)
  return (row.captureVersion == "1.0.4" or row.captureVersion == "1.0.5") and row.itemLink and not row.reviewReason
    and type(row.ilvl) == "number" and row.ilvl > 0 and row.bindingStatus == "ordinary"
end

local function exportRows()
  local rows = {}
  for _, row in ipairs(WoWButlerCollectorDB) do
    if isExportable(row) then table.insert(rows, row) end
  end
  return rows
end

function API.GetState()
  local _, instanceType, difficultyID = GetInstanceInfo()
  return {
    enabled = WoWButlerCollectorSettings.enabled ~= false,
    inRaid = instanceType == "raid",
    difficulty = instanceType == "raid" and RAID_DIFFICULTY[difficultyID] or nil,
    isLfr = instanceType == "raid" and (difficultyID == 7 or difficultyID == 17),
    count = #WoWButlerCollectorDB, pending = pendingCount,
    exportable = #exportRows(), reviewCount = #WoWButlerCollectorDB - #exportRows(),
    failed = failedCount, lastError = lastError,
    latest = WoWButlerCollectorDB[#WoWButlerCollectorDB], max = MAX_ENTRIES,
  }
end

function API.SetEnabled(enabled)
  WoWButlerCollectorSettings.enabled = not not enabled
  notify() -- 暂停仅阻止新事件；暂停前已经接收的缓存加载继续完成
end

local function reportFailure(message)
  failedCount = failedCount + 1
  lastError = message
  print(message)
  notify()
end

local function trimDB()
  while #WoWButlerCollectorDB > MAX_ENTRIES do
    table.remove(WoWButlerCollectorDB, 1)
  end
end

local function safeCall(fn, ...)
  if type(fn) ~= "function" then return nil end
  local ok, value = pcall(fn, ...)
  if ok then return value end
end

-- BUG-117/118：只查这次拾取的完整链接，不能用同名/同ID另一变体推断绑定或装等。
local function linkedDetails(link)
  if not link then return nil, nil, nil end
  local account = safeCall(C_Item and C_Item.IsItemBindToAccount, link)
  local untilEquip = safeCall(C_Item and C_Item.IsItemBindToAccountUntilEquip, link)
  local bound = account == true or untilEquip == true
  local bindingKnown = bound or (account == false and untilEquip == false)
  local tooltip = safeCall(C_TooltipInfo and C_TooltipInfo.GetHyperlink, link)
  local ilvl, source
  if type(tooltip) == "table" and type(tooltip.lines) == "table" then
    for _, line in ipairs(tooltip.lines) do
      local text = type(line.leftText) == "string" and line.leftText:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "") or ""
      -- TooltipDataLineType.ItemBinding=20 / ItemLevel=31，不能把升级等级行32读成装等。
      if line.type == 20 then
        if text:find("战团绑定", 1, true) or text:find("账号绑定", 1, true)
          or text:find("帐号绑定", 1, true) or text:find("戰隊綁定", 1, true)
          or text:find("帳號綁定", 1, true) or text:lower():find("warbound", 1, true)
          or text:lower():find("account bound", 1, true) or text:lower():find("binds to account", 1, true) then
          bound, bindingKnown = true, true
        end
      elseif line.type == 31 then
        ilvl = tonumber(text:match("(%d+)"))
        if ilvl and ilvl > 0 then source = "hyperlink_tooltip" else ilvl = nil end
      end
    end
  end
  if not ilvl then
    local getLevel = (C_Item and C_Item.GetDetailedItemLevelInfo) or GetDetailedItemLevelInfo
    local actual = safeCall(getLevel, link)
    if type(actual) == "number" and actual > 0 then ilvl, source = actual, "detailed_link" end
  end
  return ilvl, bindingKnown and (bound and "account" or "ordinary") or nil, source
end

local function playerIdentity(raw, own)
  local name, realm = raw:match("^(.-)%-(.+)$")
  if name then return name, realm end
  if own then
    if type(UnitFullName) == "function" then
      local ok, n, r = pcall(UnitFullName, "player")
      if ok and n then return n, (r and r ~= "" and r) or safeCall(GetRealmName) end
    end
    return raw, safeCall(GetRealmName)
  end
  -- Resolve only a unique roster match. Never assume another player belongs to our realm.
  local foundName, foundRealm, count = nil, nil, 0
  if type(UnitFullName) == "function" then
    for i=1,(safeCall(GetNumGroupMembers) or 0) do
      local ok,n,r = pcall(UnitFullName, "raid"..i)
      if ok and n == raw then count=count+1; foundName=n; foundRealm=(r and r ~= "" and r) or safeCall(GetRealmName) end
    end
  end
  return foundName or raw, count == 1 and foundRealm or nil
end

local function recordLoot(itemID, itemLink, looterName, looterServer, quantity)
  -- 只记录团本（任务书 #75-补丁1）：raid=团本 ✅；party=大秘境/地下城 ❌；none=世界BOSS/野外 ❌
  local instName, instanceType, difficultyID = GetInstanceInfo()
  if instanceType ~= "raid" then return end
  local difficulty = RAID_DIFFICULTY[difficultyID]
  if not difficulty then return end

  -- 时间窗仅为首领候选，不证明实际掉落归属；不拿任意死亡目标编首领名。
  local bossName
  if lastEncounterName and (time() - lastEncounterAt) <= BOSS_WINDOW_SEC then
    bossName = lastEncounterName
  end
  -- 所有上下文在事件发生时捕获，缓存加载结束时可能已离开副本或击杀下一首领。
  local capturedAt, generation = time(), clearGeneration
  local encounterID, encounterAt = bossName and lastEncounterID or nil, bossName and lastEncounterAt or nil
  local settings = WoWButlerCollectorSettings
  if not settings.collectorSourceID then settings.collectorSourceID=tostring(time()).."-"..tostring(math.random(1,999999999)).."-"..tostring(math.random(1,999999999)) end
  settings.eventSequence=(tonumber(settings.eventSequence) or 0)+1
  local sourceID, eventID = settings.collectorSourceID, tostring(settings.eventSequence)
  local region = safeCall(GetCurrentRegion)
  region = region and tostring(region) or nil
  local getInfo = (C_Item and C_Item.GetItemInfo) or GetItemInfo
  if type(getInfo) ~= "function" then
    reportFailure("WoWButler: 物品接口不可用，本次拾取未记录，请检查客户端与插件版本。")
    return
  end
  pendingCount = pendingCount + 1
  notify()
  local function attempt(retries)
    if generation ~= clearGeneration then return end
    local itemName, _, quality, _, _, itemType, _, _, equipLoc, iconID, _, classID = getInfo(itemLink or itemID)
    if not itemName or not quality or not classID then
      if retries < 10 and C_Timer and C_Timer.After then
        if retries == 0 and C_Item and C_Item.RequestLoadItemDataByID then
          C_Item.RequestLoadItemDataByID(itemID)
        end
        C_Timer.After(1, function() attempt(retries + 1) end)
      else
        pendingCount = pendingCount - 1
        reportFailure("WoWButler: 物品 " .. itemID .. " 信息加载失败，本次拾取未记录。")
      end
      return
    end
    if quality < 4 or EXCLUDE_CLASS[classID] then
      pendingCount = pendingCount - 1
      notify()
      return
    end
    local ilvl, binding, levelSource = linkedDetails(itemLink)
    if binding == "account" then
      pendingCount = pendingCount - 1
      notify()
      return
    end
    if (not ilvl or not binding) and retries < 10 and C_Timer and C_Timer.After then
      C_Timer.After(1, function() attempt(retries + 1) end)
      return
    end
    pendingCount = pendingCount - 1
    local reviewReason = not binding and "绑定信息未确认" or (not ilvl and "实际装等未确认" or nil)
    table.insert(WoWButlerCollectorDB, {
    collectorSourceID = sourceID,
    sourceEventID = eventID,
    playerServer = looterServer,
    playerRegion = region,
    quantity = quantity or 1,
    encounterID = encounterID,
    encounterAt = encounterAt,
    itemLink = itemLink,
    captureVersion = API.version,
    bindingStatus = binding,
    ilvlSource = levelSource,
    reviewReason = reviewReason,
    itemName = itemName,
    itemID = itemID,
    iconID = iconID,           -- 数字 fileID（修正：API 无字符串 icon_name，见头部口径②）
    quality = quality,
    ilvl = ilvl,
    slot = equipLoc,           -- 原始 INVTYPE_*，中文映射在网站导入解析器
    itemType = itemType,       -- 本地化大类（武器/护甲）
    bossName = bossName,
    bossSource = bossName and "encounter_window" or nil,
    instanceName = instName,
    difficulty = difficulty,
    difficultyID = difficultyID,
    timestamp = capturedAt,
    playerName = looterName,
  })
    trimDB()
    if reviewReason then
      reportFailure("WoWButler: " .. itemName .. "：" .. reviewReason .. "，已保留待核对，不纳入导出。")
    end
    notify()
  end
  attempt(0)
end

-- ---- 事件分发 ----
local frame = CreateFrame("Frame")
frame:RegisterEvent("PLAYER_LOGIN")
frame:RegisterEvent("CHAT_MSG_LOOT")
frame:RegisterEvent("ENCOUNTER_END")
frame:RegisterEvent("ZONE_CHANGED_NEW_AREA")
frame:RegisterEvent("ENCOUNTER_START")

frame:SetScript("OnEvent", function(_, event, ...)
  if event == "PLAYER_LOGIN" then
    buildLootPatterns()
    if API.InitUI then API.InitUI() end
    notify()
    print(L.LOADED or "WoWButlerCollector loaded")
    if #WoWButlerCollectorDB >= CAP_WARN_AT then
      print(string.format(L.CAP_WARN or "cap warn", #WoWButlerCollectorDB, MAX_ENTRIES))
    end
  elseif event == "ZONE_CHANGED_NEW_AREA" or event == "ENCOUNTER_START" then
    lastEncounterName, lastEncounterAt, lastEncounterID = nil, 0, nil
    notify()
  elseif event == "ENCOUNTER_END" then
    local encounterID, encounterName, _, _, success = ...
    if success == 1 then
      lastEncounterID = encounterID
      lastEncounterName = encounterName
      lastEncounterAt = time()
    end
  elseif event == "CHAT_MSG_LOOT" then
    if WoWButlerCollectorSettings.enabled == false then return end
    local instName, instanceType, difficultyID = GetInstanceInfo()
    if instanceType ~= "raid" then return end
    -- 在去重、物品查询、异步等待之前拦截：随机团不增加任何采集计数。
    if not RAID_DIFFICULTY[difficultyID] then return end
    local msg = ...
    if type(msg) ~= "string" then return end
    local itemID = tonumber(msg:match("|Hitem:(%d+)"))
    if not itemID then return end
    -- 兼容 |cAARRGGBB、|cnIQ4: 与无颜色包裹的链接；不丢失bonus IDs。
    local itemLink = msg:match("(|Hitem:[^|]+|h.-|h)")
    for _, lp in ipairs(lootPatterns) do
      local caps = { msg:match(lp.pattern) }
      if #caps > 0 then
        local looter
        if lp.selfLoot then
          looter = UnitName("player")
        else
          if not IsInRaid() then return end -- 非团队场景不记他人拾取（世界频道噪声隔离）
          looter = caps[1] or "" -- 保留服务器用于身份核对
          if looter == "" then return end
        end
        local lineID = select(11, ...)
        if type(lineID) == "number" and lineID > 0 then
          if seenLines[lineID] then return end
          seenLines[lineID]=true; table.insert(lineOrder,lineID)
          if #lineOrder > MAX_ENTRIES then seenLines[table.remove(lineOrder,1)]=nil end
        end
        local name, server = playerIdentity(looter, lp.selfLoot)
        local quantity = lp.multiple and tonumber(caps[#caps]) or 1
        recordLoot(itemID, itemLink, name, server, quantity)
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
        val = "\"" .. v:gsub("\\", "\\\\"):gsub("\"", "\\\""):gsub("[%z\1-\31]", function(c)
          return string.format("\\u%04x", string.byte(c))
        end) .. "\""
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
    frame:SetSize(620, 460)
    frame:SetPoint("CENTER")
    frame:SetFrameStrata("DIALOG")
    frame:SetClampedToScreen(true)
    frame:SetMovable(true)
    frame:EnableMouse(true)
    frame:RegisterForDrag("LeftButton")
    frame:SetScript("OnDragStart", function(self) self:StartMoving() end)
    frame:SetScript("OnDragStop", function(self) self:StopMovingOrSizing() end)
    table.insert(UISpecialFrames, "WoWButlerExportFrame")
    frame.TitleBg:SetHeight(30)
    frame.title = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
    frame.title:SetPoint("TOP", frame.TitleBg, "TOP", 0, -8)

    local scroll = CreateFrame("ScrollFrame", nil, frame, "UIPanelScrollFrameTemplate")
    scroll:SetPoint("TOPLEFT", 24, -60)
    scroll:SetPoint("BOTTOMRIGHT", -44, 110)

    local editBox = CreateFrame("EditBox", nil, scroll)
    editBox:SetMultiLine(true)
    editBox:SetFontObject("ChatFontNormal")
    editBox:SetWidth(540)
    editBox:SetHeight(1)
    editBox:SetAutoFocus(false)
    editBox:SetMaxLetters(0)
    editBox:SetScript("OnEscapePressed", function() frame:Hide() end)
    scroll:SetScrollChild(editBox)
    frame.editBox = editBox
    local hint = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
    hint:SetPoint("BOTTOMLEFT", 24, 52)
    hint:SetWidth(572)
    hint:SetJustifyH("LEFT")
    hint:SetText(L.EXPORT_HINT)
    local selectButton = CreateFrame("Button", nil, frame, "UIPanelButtonTemplate")
    selectButton:SetSize(160, 28)
    selectButton:SetPoint("BOTTOMLEFT", 24, 16)
    selectButton:SetText(L.SELECT_ALL)
    selectButton:SetScript("OnClick", function()
      editBox:SetFocus()
      editBox:HighlightText()
    end)
    frame.selectButton = selectButton
    frame:SetScript("OnHide", function() editBox:ClearFocus() end)
  end
  frame.title:SetText(L.EXPORT_TITLE or "WoWButler 拾取记录导出")
  frame.editBox:SetText(json)
  frame:Show()
  frame.editBox:SetFocus()
  frame.editBox:HighlightText() -- 先聚焦再高亮，保证 Ctrl+C 一键复制全文
  print(L.EXPORT_DONE or "WoWButler: JSON 已生成，请按 Ctrl+C 复制全部内容")
end

function API.Export()
  if pendingCount > 0 then
    print("WoWButler: 仍有 " .. pendingCount .. " 条等待物品信息，请稍后再导出。")
    return
  end
  if #WoWButlerCollectorDB == 0 then
    print(L.EXPORT_EMPTY or "尚无拾取记录；进入团本后会自动记录符合条件的拾取。")
    return
  end
  local rows = exportRows()
  local held = #WoWButlerCollectorDB - #rows
  if held > 0 then
    print("WoWButler: " .. held .. " 条旧版或信息未确认记录已保留待核对，不纳入本次导出。")
  end
  if #rows == 0 then return end
  showExportFrame(JSONEncode(rows))
end

function API.RequestClear()
  StaticPopupDialogs["WBC_CLEAR_CONFIRM"] = {
    text = L.CLEAR_CONFIRM_TEXT or "确定清空所有拾取记录？",
    button1 = L.BTN_OK or "确定",
    button2 = L.BTN_CANCEL or "取消",
    OnAccept = function()
      clearGeneration = clearGeneration + 1
      pendingCount = 0
      lastLoot = { itemID = nil, looter = nil, at = 0 }
      wipe(WoWButlerCollectorDB)
      if _G.WoWButlerExportFrame then _G.WoWButlerExportFrame:Hide() end
      print(L.CLEARED or "拾取记录已清空")
      notify()
    end,
    timeout = 0, whileDead = true, hideOnEscape = true,
  }
  StaticPopup_Show("WBC_CLEAR_CONFIRM")
end

-- ---- 斜杠命令 ----
SLASH_WBC1 = "/wbc"
SlashCmdList["WBC"] = function(msg)
  msg = (msg or ""):gsub("^%s+", ""):gsub("%s+$", "")
  if msg == "" and API.OpenPanel then
    API.OpenPanel()
  elseif msg == "" or msg == "help" then
    print(L.HELP_1 or "commands:")
    print(L.HELP_COUNT or "")
    print(L.HELP_EXPORT or "")
    print(L.HELP_CLEAR or "")
  elseif msg == "count" then
    print(string.format(L.COUNT or "%d", #WoWButlerCollectorDB))
    print("WoWButler: 等待物品信息 " .. pendingCount .. " 条；仅采集普通/英雄/史诗团本中史诗品质及以上物品，随机团不计数。")
  elseif msg == "export" then
    API.Export()
  elseif msg == "clear" then
    API.RequestClear()
  else
    print(L.HELP_1 or "commands:")
  end
end
