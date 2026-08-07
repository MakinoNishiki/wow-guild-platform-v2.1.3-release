-- ============================================================
-- 魔兽管家数据导出器 WoWButler Data Exporter（任务书 #26 WP1）
-- 零外部依赖；只读副本手册（EJ）与角色信息；不访问网络、不碰账号数据
-- 导出目标：SavedVariables 全局表 WJDCDump（/reload 或退出游戏后写盘）
-- 命令：/wjdc all | raid | mplus | me | probe [团本序号]
-- （套装效果导出于 1.0.4 移除：走顾问侧文章/OCR 管道，任务书 #26-fix4）
-- （1.0.5：掉落新增主/副属性数值字段 primary_values/secondary_values，
--   优先 GetItemStats，不可用回退 tooltip 解析——任务书 #28 WP1 星标数据链；
--   原有字段格式不变，向后兼容）
-- （1.0.6：修复 gsub 次返回值误入 tonumber base 致数值行必炸（bad argument #2）；
--   probe 新增物品级诊断 /wjdc probe <物品ID>）
-- ============================================================
local ADDON_VERSION = "1.0.6"

local function msg(s) DEFAULT_CHAT_FRAME:AddMessage("|cffffd200[wjdc]|r " .. s) end
local function err(s) DEFAULT_CHAT_FRAME:AddMessage("|cffff4040[wjdc]|r " .. s) end

local function ejAvailable()
  -- 掉落兼容位（任务书 #26-fix2）：12.x 起 EJ_GetLootInfoByIndex 移除，迁移至 C_EncounterJournal.GetLootInfoByIndex，居其一即可
  local lootFn = EJ_GetLootInfoByIndex or (C_EncounterJournal and C_EncounterJournal.GetLootInfoByIndex)
  return type(EJ_GetCurrentTier) == "function" and type(EJ_GetInstanceByIndex) == "function"
     and type(EJ_GetEncounterInfoByIndex) == "function" and type(lootFn) == "function"
end

-- 诊断模块共享（/wjdc probe，任务书 #26-fix3，实现见 WoWButlerExporter_Probe.lua）
WJDCShared = { msg = msg, err = err, ejAvailable = ejAvailable }

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

-- ---------- 物品明细：主副属性 / 特效（tooltip 扫描；装等走 GetItemInfo 见 getItemBasics） ----------
local PRIMARY   = { ["力量"] = 1, ["敏捷"] = 1, ["智力"] = 1 }
local SECONDARY = { ["爆击"] = 1, ["急速"] = 1, ["精通"] = 1, ["全能"] = 1,
                    ["吸血"] = 1, ["闪避"] = 1, ["加速"] = 1 }

local function addUnique(list, v)
  for _, x in ipairs(list) do if x == v then return end end
  list[#list + 1] = v
end

local function parseItemDetail(itemID)
  local d = { primary = {}, secondary = {}, effect = "", primary_values = {}, secondary_values = {} }
  local lines = scanLines(itemID)
  if not lines then return d end
  for _, t in ipairs(lines) do
    -- 数值一并采集（任务书 #28 WP1）："+1,234 爆击" → 名 + 数值（千分位逗号剥离）
    local num, stat = t:match("^%+([%d,]+)%s*(.+)$")
    if stat then
      stat = stat:gsub("%s", "")
      local v = num and tonumber((num:gsub(",", ""))) or nil  -- 括号截断 gsub 多返回值（1.0.6 修复：次返回值曾被当作 tonumber 的 base）
      if PRIMARY[stat] then
        addUnique(d.primary, stat)
        if v then d.primary_values[stat] = v end
      elseif SECONDARY[stat] then
        addUnique(d.secondary, stat)
        if v then d.secondary_values[stat] = v end
      end
    end
    if d.effect == "" then
      d.effect = t:match("^(装备：.+)$") or t:match("^(使用：.+)$") or ""
    end
  end
  return d
end

-- ---------- 属性数值 API 通道（任务书 #28 WP1，优先于 tooltip 解析） ----------
-- GetItemStats 返回 { [属性常量 key] = 数值 }，key 经 _G 解析为本地化短名后与 PRIMARY/SECONDARY 对照；
-- API 不存在 / 返回空表 → 返回 nil，由调用方回退 tooltip 解析值
local function statValuesFromApi(itemID)
  if type(GetItemStats) ~= "function" then return nil end
  local ok, stats = pcall(GetItemStats, "item:" .. itemID)
  if not ok or type(stats) ~= "table" then return nil end
  local pv, sv, n = {}, {}, 0
  for key, val in pairs(stats) do
    local name = type(key) == "string" and _G[key] or nil
    if type(name) == "string" and type(val) == "number" and val > 0 then
      name = name:gsub("%s", "")
      if PRIMARY[name] then pv[name] = val; n = n + 1
      elseif SECONDARY[name] then sv[name] = val; n = n + 1 end
    end
  end
  if n == 0 then return nil end
  return pv, sv
end

-- 诊断模块共享（1.0.6，/wjdc probe <物品ID> 物品级诊断用，任务书 #28 WP1-fix）
WJDCShared.scanLines = scanLines
WJDCShared.parseItemDetail = parseItemDetail
WJDCShared.statValuesFromApi = statValuesFromApi

-- ---------- 副本手册遍历（团本 / 大秘境共用） ----------
-- 掉落枚举（任务书 #26-fix4）：EJ_SelectEncounter 后只许单参调用（实测双参全 nil）；
-- 12.x 返回稀疏表（仅 itemID/encounterID/稀有度标记），老函数为多元返回值
-- （name, icon, slot, armorType, itemID, ...），归一化为只取 itemID——其余字段一律走 GetItemInfo
local function getLootItemID(i)
  local fn = (C_EncounterJournal and C_EncounterJournal.GetLootInfoByIndex) or EJ_GetLootInfoByIndex
  if type(fn) ~= "function" then return nil end
  local ok, a, _, _, _, e5 = pcall(fn, i)  -- 单参；e5 = 老 tuple 第 5 位 itemID
  if not ok or a == nil then return nil end
  if type(a) == "table" then return a.itemID end
  return e5
end

-- 物品详情通道（任务书 #26-fix4）：名称/部位/类型/装等一律走 GetItemInfo（装等=第 4 返回值）；
-- GetDetailedItemLevelInfo / C_EncounterJournal.GetLootInfo 已死，废弃；
-- 未缓存先 RequestLoadItemDataByID 重试一次，仍拿不到或装等非法 → 返回 nil 走 failed（禁 ilvl=44 类错位值）
local function getItemBasics(itemID)
  local name, _, _, ilvl, _, _, subType, _, equipLoc = GetItemInfo(itemID)
  if not name and C_Item and C_Item.RequestLoadItemDataByID then
    pcall(C_Item.RequestLoadItemDataByID, itemID)
    name, _, _, ilvl, _, _, subType, _, equipLoc = GetItemInfo(itemID)
  end
  if not name or type(ilvl) ~= "number" or ilvl <= 0 then return nil end
  return { name = name, ilvl = ilvl, type = subType or "", slot = (equipLoc and _G[equipLoc]) or "" }
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
      -- 掉落计数不依赖 EJ_GetNumLoot（12.x 已死）：按 index 递增取到 nil 为止，500 封顶防呆
      local loot, failed, li = {}, {}, 1
      while li <= 500 do
        local itemID = getLootItemID(li)
        if not itemID then break end
        local basics = getItemBasics(itemID)
        if basics then
          local d = parseItemDetail(itemID)
          -- 数值：API 通道优先（整表采用），不可用/空表回退 tooltip 解析值（任务书 #28 WP1）
          local pv, sv = statValuesFromApi(itemID)
          if not pv then pv, sv = d.primary_values, d.secondary_values end
          loot[#loot + 1] = { id = itemID, name = basics.name, slot = basics.slot,
                              type = basics.type, ilvl = basics.ilvl,
                              primary = d.primary, secondary = d.secondary,
                              primary_values = pv, secondary_values = sv,
                              effect = d.effect }
        else
          failed[#failed + 1] = itemID  -- 禁静默：记入 boss.failed 并红字报告
        end
        li = li + 1
      end
      if #failed > 0 then
        err(string.format("%s · %s：%d 件物品未缓存记 failed（/reload 后重跑可补齐）", iname, bname, #failed))
      end
      bosses[#bosses + 1] = { boss = bname, loot = loot, failed = failed }
      bi = bi + 1
    end
    out[#out + 1] = { instance = iname, bosses = bosses }
    msg(string.format("%s：%s（%d 个 BOSS，%d 件掉落）", label, iname, #bosses,
      (function() local c = 0 for _, b in ipairs(bosses) do c = c + #b.loot end return c end)()))
    idx = idx + 1
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
    msg("已导出本人角色档案（" .. tostring(WJDCDump.me.name) .. "-" .. tostring(WJDCDump.me.realm) .. "），请 /reload 或退出游戏写入文件")
    return
  end
  if kind == "tier" then
    msg("套装效果导出已于 1.0.4 移除：套装数据走顾问侧文章/OCR 管道（详见 README）")
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
  local ejTier = EJ_GetCurrentTier()
  if ejTier then pcall(EJ_SelectTier, ejTier) end  -- 只导当前资料片，旧实例一律不导
  local dump = { meta = buildMeta(kind) }
  msg("开始导出（" .. kind .. "），数据量大请稍候……")
  -- 分段独立 pcall（任务书 #26-fix4）：任一段失败不拖垮其他段
  local function guard(label, fn)
    local ok, e = pcall(fn)
    if not ok then err(label .. "段导出中断：" .. tostring(e) .. "（其余段落不受影响，建议重跑）") end
  end
  if kind == "all" or kind == "raid" then guard("团本", function() dump.raids = exportInstances(true, "团本") end) end
  if kind == "all" or kind == "mplus" then guard("大秘境", function() dump.dungeons = exportInstances(false, "大秘境") end) end
  WJDCDump = dump
  msg("已导出，请 /reload 或退出游戏写入文件")
  msg("文件位置：WTF/Account/<你的账号名>/SavedVariables/WoWButlerExporter.lua")
end

SLASH_WJDC1 = "/wjdc"
SlashCmdList["WJDC"] = function(input)
  local cmd = (input or ""):gsub("^%s+", ""):gsub("%s+$", ""):lower()
  local probeArg = cmd:match("^probe%s*(%d*)$")
  if probeArg then
    if WJDCProbe then WJDCProbe(probeArg) else err("诊断模块 WoWButlerExporter_Probe.lua 未加载") end
    return
  end
  if cmd == "all" or cmd == "raid" or cmd == "mplus" or cmd == "tier" or cmd == "me" then
    doExport(cmd)
  else
    msg("用法：/wjdc all（全量）| raid（团本）| mplus（大秘境）| me（本人角色档案）| probe [团本序号|物品ID]（诊断）")
  end
end
