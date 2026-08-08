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
-- （1.0.7：四难度档采集（任务书 #29 WP1）——团本掉落按 随机/普通/英雄/史诗
--   四档切 EJ 难度、取当档 link 重扫 tooltip，产出 primary_tiers/secondary_tiers
--   （{lfr/normal/heroic/mythic} 枚举 key，只记存在的档）；
--   切档通道不可用自动回退单档采集（tiers 不产出）并红字报告；
--   大秘境无四难度（钥石层数缩放）不产 tiers；原字段格式零改动、向后兼容）
-- ============================================================
local ADDON_VERSION = "1.0.7"

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

local function readTipLines()
  local lines, n = {}, tip:NumLines() or 0
  for i = 1, n do
    local fs = _G["WJDCScanTipTextLeft" .. i]
    local t = fs and fs:GetText()
    if t and t ~= "" then lines[#lines + 1] = t end
  end
  return lines
end

local function scanLines(itemID)
  tip:ClearLines()
  local ok = pcall(function() tip:SetItemByID(itemID) end)
  if not ok then return nil end
  return readTipLines()
end

-- 链接扫描（1.0.7，任务书 #29 WP1）：EJ 掉落表 link 字段已按当前手册难度缩放，
-- SetHyperlink 重扫拿到的即该档数值（SetItemByID 不受 EJ 难度影响，四档同值，不能用于切档）
local function scanLink(link)
  tip:ClearLines()
  local ok = pcall(function() tip:SetHyperlink(link) end)
  if not ok then return nil end
  return readTipLines()
end

-- ---------- 物品明细：主副属性 / 特效（tooltip 扫描；装等走 GetItemInfo 见 getItemBasics） ----------
local PRIMARY   = { ["力量"] = 1, ["敏捷"] = 1, ["智力"] = 1 }
local SECONDARY = { ["爆击"] = 1, ["急速"] = 1, ["精通"] = 1, ["全能"] = 1,
                    ["吸血"] = 1, ["闪避"] = 1, ["加速"] = 1 }

local function addUnique(list, v)
  for _, x in ipairs(list) do if x == v then return end end
  list[#list + 1] = v
end

-- 属性行解析（1.0.7 抽公共）："+1,234 爆击" → 名 + 数值（千分位逗号剥离）；
-- d.effect 字段缺省时跳过特效提取（四档重扫只取数值，不重复解析特效）
local function parseStatLines(lines, d)
  for _, t in ipairs(lines) do
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
end

local function parseItemDetail(itemID)
  local d = { primary = {}, secondary = {}, effect = "", primary_values = {}, secondary_values = {} }
  local lines = scanLines(itemID)
  if lines then parseStatLines(lines, d) end
  return d
end

-- ---------- 属性数值 API 通道（任务书 #28 WP1，优先于 tooltip 解析） ----------
-- GetItemStats 返回 { [属性常量 key] = 数值 }，key 经 _G 解析为本地化短名后与 PRIMARY/SECONDARY 对照；
-- API 不存在 / 返回空表 → 返回 nil，由调用方回退 tooltip 解析
-- （真机定论 1.0.6 probe：GetItemStats 12.x 不存在，数值链实际唯一通道 = tooltip 解析；本通道保留作未来兼容）
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

-- 诊断模块共享（1.0.6，/wjdc probe <物品ID> 物品级诊断用，任务书 #28 WP1-fix；
-- 1.0.7 增 scanLink/parseStatLines 供四档实证诊断）
WJDCShared.scanLines = scanLines
WJDCShared.scanLink = scanLink
WJDCShared.parseItemDetail = parseItemDetail
WJDCShared.parseStatLines = parseStatLines
WJDCShared.statValuesFromApi = statValuesFromApi

-- ---------- 四难度档采集（1.0.7，任务书 #29 WP1） ----------
-- 侦察结论（2026-08-08 桌面研究，warcraft.wiki.gg + 12.0 客户端 Blizzard UI 源码交叉验证）：
--   EJ_SetDifficulty/EJ_GetDifficulty 12.x 仍存在（暴雪 EJ 界面源码在用），5.4 起吃标准
--   DifficultyID：随机团队=17 / 普通=14 / 英雄=15 / 史诗=16；C_EncounterJournal 无等价替代。
--   GetLootInfoByIndex 返回表的 link 字段由 C++ 按当前手册难度生成——切档→重取 link→
--   SetHyperlink 重扫为暴雪原生路径；真机唯一待验证点 = 12.x 稀疏表是否带 link 字段，
--   不在场则自动回退单档（tiers 不产出），不硬磕。
local RAID_TIERS = {
  { key = "lfr",    id = 17 },  -- 随机团队
  { key = "normal", id = 14 },  -- 普通
  { key = "heroic", id = 15 },  -- 英雄
  { key = "mythic", id = 16 },  -- 史诗
}

local function tierChannelAvailable()
  return type(EJ_SetDifficulty) == "function" and type(EJ_GetDifficulty) == "function"
     and C_EncounterJournal and type(C_EncounterJournal.GetLootInfoByIndex) == "function"
end

local function stripTiers(loot)
  for _, it in ipairs(loot) do it.primary_tiers = nil it.secondary_tiers = nil end
end

-- 逐 BOSS 四档重扫（loot 行需带 li = GetLootInfoByIndex 序号，切档后按同序号重取该档 link）。
-- 返回 true,带档件数 ｜ false,原因（硬失败：切档读回不通过；软失败：全 BOSS 无一件扫出档值）
local function collectTiers(loot)
  for _, tier in ipairs(RAID_TIERS) do
    local okSet = pcall(EJ_SetDifficulty, tier.id)
    local okGet, cur = pcall(EJ_GetDifficulty)
    if not okSet or not okGet or cur ~= tier.id then
      return false, "切档读回失败（" .. tier.key .. "/" .. tostring(tier.id) .. " 档）"
    end
    for _, it in ipairs(loot) do
      -- 同序号重取：itemID 一致性校验防「不同难度掉落列表错位」串行（对不上即放弃本件本档）
      local okQ, info = pcall(C_EncounterJournal.GetLootInfoByIndex, it.li)
      local link = okQ and type(info) == "table" and info.itemID == it.id and info.link or nil
      if link then
        local lines = scanLink(link)
        if lines then
          local d = { primary = {}, secondary = {}, primary_values = {}, secondary_values = {} }
          parseStatLines(lines, d)
          -- 只记有数值的档：无静态属性的品类（纯特效饰品/杂项）天然空档，与「缺档不记」同口径
          if next(d.primary_values) then
            it.primary_tiers = it.primary_tiers or {}
            it.primary_tiers[tier.key] = d.primary_values
          end
          if next(d.secondary_values) then
            it.secondary_tiers = it.secondary_tiers or {}
            it.secondary_tiers[tier.key] = d.secondary_values
          end
        end
      end
    end
  end
  local tiered = 0
  for _, it in ipairs(loot) do
    if it.primary_tiers or it.secondary_tiers then tiered = tiered + 1 end
  end
  if tiered == 0 and #loot > 0 then
    return false, "link 字段全缺或无一件物品扫出档位数值（12.x 稀疏表病害嫌疑）"
  end
  return true, tiered
end

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

local function exportInstances(isRaid, label, tierOn)
  local out, idx = {}, 1
  -- 四档采集前置（1.0.7）：EJ 难度是全局手册状态，采集前保存原档，收尾还原
  local tierAlive = tierOn and true or false
  local softFail = 0
  local origDiff
  if tierAlive then
    local ok, d = pcall(EJ_GetDifficulty)
    if ok then origDiff = d end
  end
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
                              effect = d.effect,
                              li = li }  -- li 仅四档重扫用，出库前抹除
        else
          failed[#failed + 1] = itemID  -- 禁静默：记入 boss.failed 并红字报告
        end
        li = li + 1
      end
      if #failed > 0 then
        err(string.format("%s · %s：%d 件物品未缓存记 failed（/reload 后重跑可补齐）", iname, bname, #failed))
      end
      -- 四难度档重扫（1.0.7，仅团本且通道在场）：逐件切档重扫，失败只降级不拖垮单档数据
      if tierAlive then
        local okT, res, extra = pcall(collectTiers, loot)
        if not okT then
          err(string.format("%s · %s：四档采集报错中断（%s），本 BOSS 回退单档", iname, bname, tostring(res)))
          stripTiers(loot)
          softFail = softFail + 1
        elseif res == false then
          err(string.format("%s · %s：四档通道异常（%s），本 BOSS 回退单档", iname, bname, tostring(extra)))
          stripTiers(loot)
          softFail = softFail + 1
        else
          softFail = 0
          msg(string.format("%s · %s：四档重扫完成（%d/%d 件带档）", iname, bname, extra, #loot))
        end
        if softFail >= 2 then
          tierAlive = false
          err("四档通道连续异常，后续 BOSS 不再切档（回退单档采集）——请把聊天框完整截图反馈顾问侧")
        end
      end
      for _, it in ipairs(loot) do it.li = nil end
      bosses[#bosses + 1] = { boss = bname, loot = loot, failed = failed }
      bi = bi + 1
    end
    out[#out + 1] = { instance = iname, bosses = bosses }
    msg(string.format("%s：%s（%d 个 BOSS，%d 件掉落）", label, iname, #bosses,
      (function() local c = 0 for _, b in ipairs(bosses) do c = c + #b.loot end return c end)()))
    idx = idx + 1
  end
  if origDiff then pcall(EJ_SetDifficulty, origDiff) end  -- 还原手册难度档，不留全局副作用
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
  -- 四难度档通道探测（1.0.7，仅团本段用）：EJ 切档函数 + 掉落表 link 通道双条件在场才启用；
  -- 不可用回退单档采集（tiers 不产出），红字明示——大秘境无四难度，永不启用
  local tierOn = false
  if kind == "all" or kind == "raid" then
    tierOn = tierChannelAvailable()
    dump.meta.tier_channel = tierOn and "ej-link" or "unavailable"
    if tierOn then
      msg("四难度档采集已启用（1.0.7）：随机/普通/英雄/史诗逐档切档重扫，时长约为单档 4 倍属预期，请耐心等待")
    else
      err("四档采集通道不可用（EJ_SetDifficulty/EJ_GetDifficulty 或 GetLootInfoByIndex 缺失），本次回退单档采集，tiers 不产出——请截图反馈顾问侧")
    end
  else
    dump.meta.tier_channel = "n/a"
  end
  msg("开始导出（" .. kind .. "），数据量大请稍候……")
  -- 分段独立 pcall（任务书 #26-fix4）：任一段失败不拖垮其他段
  local function guard(label, fn)
    local ok, e = pcall(fn)
    if not ok then err(label .. "段导出中断：" .. tostring(e) .. "（其余段落不受影响，建议重跑）") end
  end
  if kind == "all" or kind == "raid" then guard("团本", function() dump.raids = exportInstances(true, "团本", tierOn) end) end
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
