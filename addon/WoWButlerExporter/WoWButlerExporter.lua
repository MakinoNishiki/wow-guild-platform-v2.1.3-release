-- ============================================================
-- 魔兽管家数据导出器 WoWButler Data Exporter（任务书 #26 WP1）
-- 零外部依赖；只读副本手册（EJ）与角色信息；不访问网络、不碰账号数据
-- 导出目标：SavedVariables 全局表 WJDCDump（/reload 或退出游戏后写盘）
-- 命令：/wjdc all | raid | mplus | tier | me
-- ============================================================
local ADDON_VERSION = "1.0.1"

local function msg(s) DEFAULT_CHAT_FRAME:AddMessage("|cffffd200[wjdc]|r " .. s) end
local function err(s) DEFAULT_CHAT_FRAME:AddMessage("|cffff4040[wjdc]|r " .. s) end

local function ejAvailable()
  return type(EJ_GetCurrentTier) == "function"
     and type(EJ_GetInstanceByIndex) == "function"
     and type(EJ_GetEncounterInfoByIndex) == "function"
     and type(EJ_GetLootInfoByIndex) == "function"
end

local function buildMeta(kind)
  local ver, build, _, iface = GetBuildInfo()
  return { addon = ADDON_VERSION, client = ver, build = build, interface = iface,
           time = date("%Y-%m-%d %H:%M:%S"), type = kind }
end

-- ---------- 隐藏 tooltip（tooltip 扫描法唯一工具） ----------
local tip = CreateFrame("GameTooltip", "WJDCScanTip", UIParent, "GameTooltipTemplate")
tip:SetOwner(WorldFrame, "ANCHOR_NONE")

local function scanLines(itemID)
  tip:ClearLines()
  local ok = pcall(function() tip:SetItemByID(itemID) end)
  if not ok then return nil end
  local lines, n = {}, tip:NumLines() or 0
  for i = 1, n do
    local fs = _G["WJDCScanTipTextLeft" .. i]
    local t = fs and fs:GetText()
    if t and t ~= "" then lines[#lines + 1] = t end
  end
  return lines
end

-- ---------- 物品明细：装等 / 主副属性 / 特效 ----------
local PRIMARY   = { ["力量"] = 1, ["敏捷"] = 1, ["智力"] = 1 }
local SECONDARY = { ["爆击"] = 1, ["急速"] = 1, ["精通"] = 1, ["全能"] = 1,
                    ["吸血"] = 1, ["闪避"] = 1, ["加速"] = 1 }

local function addUnique(list, v)
  for _, x in ipairs(list) do if x == v then return end end
  list[#list + 1] = v
end

local function parseItemDetail(itemID)
  local d = { ilvl = nil, primary = {}, secondary = {}, effect = "" }
  local okL, lvl = pcall(GetDetailedItemLevelInfo, itemID)
  if okL and type(lvl) == "number" and lvl > 0 then d.ilvl = lvl end
  local lines = scanLines(itemID)
  if not lines then return d end
  for _, t in ipairs(lines) do
    local stat = t:match("^%+[%d,]+%s*(.+)$")
    if stat then
      stat = stat:gsub("%s", "")
      if PRIMARY[stat] then addUnique(d.primary, stat)
      elseif SECONDARY[stat] then addUnique(d.secondary, stat) end
    end
    if d.effect == "" then
      d.effect = t:match("^(装备：.+)$") or t:match("^(使用：.+)$") or ""
    end
  end
  return d
end

-- ---------- 副本手册遍历（团本 / 大秘境共用） ----------
local function getLootInfo(i)
  -- 10.x 起返回 table；保留旧版多返回值兼容
  local info = EJ_GetLootInfoByIndex(i)
  if type(info) == "table" then
    return info.itemID, info.name, info.slot, info.armorType
  end
  local name, _, slot, armorType, itemID = EJ_GetLootInfoByIndex(i)
  return itemID, name, slot, armorType
end

local function exportInstances(isRaid, label)
  local out, idx = {}, 1
  while true do
    local instanceID, iname = EJ_GetInstanceByIndex(idx, isRaid)
    if not instanceID then break end
    EJ_SelectInstance(instanceID)
    local bosses, bi = {}, 1
    while true do
      local bname, _, encounterID = EJ_GetEncounterInfoByIndex(bi, instanceID)
      if not bname then break end
      EJ_SelectEncounter(encounterID)
      local loot, n = {}, EJ_GetNumLoot() or 0
      for li = 1, n do
        local itemID, name, slot, itype = getLootInfo(li)
        if itemID and name then
          local d = parseItemDetail(itemID)
          loot[#loot + 1] = { id = itemID, name = name, slot = slot or "",
                              type = itype or "", ilvl = d.ilvl,
                              primary = d.primary, secondary = d.secondary,
                              effect = d.effect }
        end
      end
      bosses[#bosses + 1] = { boss = bname, loot = loot }
      bi = bi + 1
    end
    out[#out + 1] = { instance = iname, bosses = bosses }
    msg(string.format("%s：%s（%d 个 BOSS，%d 件掉落）", label, iname, #bosses,
      (function() local c = 0 for _, b in ipairs(bosses) do c = c + #b.loot end return c end)()))
    idx = idx + 1
  end
  return out
end

-- ---------- 套装效果（tooltip 扫描法；失败记 failed 并聊天框报告） ----------
local TIER_SLOTS = { ["头部"] = 1, ["肩部"] = 1, ["胸部"] = 1, ["手"] = 1, ["腿部"] = 1 }

local function matchBonus(t, n)  -- 兼容半角 (2) 与全角 （2）
  return t:match("^%(" .. n .. "%)%s*套装[：:]%s*(.+)$")
      or t:match("^（" .. n .. "）%s*套装[：:]%s*(.+)$")
end

local function findTierItems(raids)
  -- 从团本掉落五部位里按 tooltip「职业：」行归属各职业的套装件 itemID
  local classItem = {}
  for _, inst in ipairs(raids) do
    for _, b in ipairs(inst.bosses) do
      for _, it in ipairs(b.loot) do
        if TIER_SLOTS[it.slot] then
          local lines = scanLines(it.id)
          if lines then
            for _, t in ipairs(lines) do
              local cl = t:match("^职业：(.+)$")
              if cl then
                for cn in cl:gmatch("[^，,%s、]+") do
                  if not classItem[cn] then classItem[cn] = it.id end
                end
              end
            end
          end
        end
      end
    end
  end
  return classItem
end

local function exportTier(raids)
  local classItem = findTierItems(raids)
  local out, failed = {}, {}
  local nClass = GetNumClasses and GetNumClasses() or 0
  for ci = 1, nClass do
    local okC, cname, cfile, classID = pcall(GetClassInfo, ci)
    if okC and cname and classID then
      local itemID = classItem[cname]
      local setName, generic = ""
      if itemID then
        generic = scanLines(itemID)
        if generic then
          for _, t in ipairs(generic) do
            setName = setName ~= "" and setName
              or t:match("^(.-)%s*（%d+/%d+）%s*$") or t:match("^(.-)%s*%(%d+/%d+%)%s*$") or ""
          end
        end
      end
      local specs, nSpec = {}, 0
      if GetNumSpecializationsForClassID then nSpec = GetNumSpecializationsForClassID(classID) or 0 end
      for si = 1, nSpec do
        local okS, specID, specName = pcall(GetSpecializationInfoForClassID, classID, si)
        specName = (okS and specName) or ("专精" .. si)
        local b2, b4
        if itemID then
          -- 专精级效果优先走 C_Item（官方 tooltip 数据源），失败回退通用 tooltip 行
          if okS and specID and C_Item and C_Item.GetSetBonusesForSpecializationByItemID then
            local okB, _, blines = pcall(C_Item.GetSetBonusesForSpecializationByItemID, itemID, specID)
            if okB and type(blines) == "table" then
              for _, t in ipairs(blines) do
                b2 = b2 or matchBonus(t, "2"); b4 = b4 or matchBonus(t, "4")
              end
            end
          end
          if not b2 and not b4 and generic then
            for _, t in ipairs(generic) do
              b2 = b2 or matchBonus(t, "2"); b4 = b4 or matchBonus(t, "4")
            end
          end
        end
        local entry = { spec = specName }
        if b2 or b4 then
          entry.set, entry.bonus2, entry.bonus4 = setName, b2 or "", b4 or ""
        else
          entry.status = "failed"
          failed[#failed + 1] = cname .. "-" .. specName
        end
        specs[#specs + 1] = entry
      end
      out[#out + 1] = { class = cname, classEn = cfile, specs = specs }
      msg("套装：" .. cname .. "（" .. nSpec .. " 个专精）")
    end
  end
  if #failed > 0 then
    err("套装效果提取失败的专精（" .. #failed .. "）：" .. table.concat(failed, "、"))
    err("请先 /reload 再重跑 /wjdc tier；仍失败请截图本信息反馈顾问侧")
  end
  return out
end

-- ---------- 本人角色档案（/wjdc me） ----------
local REGION = { [1] = "US", [2] = "KR", [3] = "EU", [4] = "TW", [5] = "CN" }

local function exportMe()
  local me = {}
  me.name = UnitName("player")
  me.realm = GetRealmName()
  local rid = GetCurrentRegion and GetCurrentRegion() or nil
  me.region = (rid and REGION[rid]) or "CN"
  me.faction = UnitFactionGroup("player") or ""
  me.race = UnitRace("player") or ""
  local classLoc, classEn = UnitClass("player")
  me.class, me.classEn = classLoc or "", classEn or ""
  local si = GetSpecialization and GetSpecialization() or nil
  if si then
    local _, specName = GetSpecializationInfo(si)
    me.spec = specName or ""
  else
    me.spec = ""
  end
  me.level = UnitLevel("player") or 0
  local _, equipped = GetAverageItemLevel()
  me.ilvl = equipped and math.floor(equipped + 0.5) or 0
  me.guild = GetGuildInfo("player") or ""
  return me
end

-- ---------- 命令入口 ----------
local function doExport(kind)
  if kind == "me" then
    WJDCDump = { meta = buildMeta(kind), me = exportMe() }
    msg("已导出本人角色档案（" .. tostring(WJDCDump.me.name) .. "-" ..
        tostring(WJDCDump.me.realm) .. "），请 /reload 或退出游戏写入文件")
    return
  end
  -- Blizzard_EncounterJournal 是懒加载模块：登录后未打开过手册时 EJ API 不存在，
  -- 必须在 ejAvailable 检测之前显式加载；加载失败则走原有中文报错退出（提示语不变）
  if C_AddOns and C_AddOns.IsAddOnLoaded and C_AddOns.LoadAddOn
     and not C_AddOns.IsAddOnLoaded("Blizzard_EncounterJournal") then
    pcall(C_AddOns.LoadAddOn, "Blizzard_EncounterJournal")
  end
  if not ejAvailable() then
    err("当前客户端不支持副本手册接口（EJ），无法导出")
    err("本插件仅支持 12.x 正式服，请确认没有误装到怀旧服/其他版本")
    return
  end
  local tier = EJ_GetCurrentTier()
  if tier then pcall(EJ_SelectTier, tier) end  -- 只导当前资料片，旧实例一律不导
  local dump = { meta = buildMeta(kind) }
  msg("开始导出（" .. kind .. "），数据量大请稍候……")
  local ok, e = pcall(function()
    if kind == "all" or kind == "raid" then dump.raids = exportInstances(true, "团本") end
    if kind == "all" or kind == "mplus" then dump.dungeons = exportInstances(false, "大秘境") end
    if kind == "all" or kind == "tier" then
      if not dump.raids then dump.raids = exportInstances(true, "团本") end  -- 套装件从团本掉落定位
      dump.tier = exportTier(dump.raids)
    end
  end)
  WJDCDump = dump
  if not ok then err("导出中断：" .. tostring(e) .. "（已写出的部分数据仍保留，建议重跑）") end
  msg("已导出，请 /reload 或退出游戏写入文件")
  msg("文件位置：WTF/Account/<你的账号名>/SavedVariables/WoWButlerExporter.lua")
end

SLASH_WJDC1 = "/wjdc"
SlashCmdList["WJDC"] = function(input)
  local cmd = (input or ""):gsub("^%s+", ""):gsub("%s+$", ""):lower()
  if cmd == "all" or cmd == "raid" or cmd == "mplus" or cmd == "tier" or cmd == "me" then
    doExport(cmd)
  else
    msg("用法：/wjdc all（全量）| raid（团本）| mplus（大秘境）| tier（套装）| me（本人角色档案）")
  end
end
