-- ============================================================
-- 诊断模块（任务书 #26-fix3）：/wjdc probe [团本序号，默认 1]
-- 只读诊断，不改导出逻辑；输出全部走聊天框，请完整截图反馈顾问侧
-- ============================================================
local msg = WJDCShared.msg
local err = WJDCShared.err

local function retstr(t)
  local o = {}
  for i, v in ipairs(t) do o[i] = tostring(v) end
  return table.concat(o, ", ")
end

-- 全字段 dump（含全部 key 名；嵌套 table 只报项数）
local function dumpRaw(tag, t)
  local keys = {}
  for k in pairs(t) do keys[#keys + 1] = k end
  table.sort(keys, function(x, y) return tostring(x) < tostring(y) end)
  for _, k in ipairs(keys) do
    local v = t[k]
    if type(v) == "table" then v = "<table " .. #v .. " 项>" end
    msg(tag .. tostring(k) .. " = " .. tostring(v))
  end
end

-- 前 3 件掉落的原始返回 dump（找出 ilvl 真实字段名）
local function probeLoot(label, encounterID)
  local fn = C_EncounterJournal and C_EncounterJournal.GetLootInfoByIndex
  msg("----- " .. label .. " -----")
  if type(fn) ~= "function" then msg("C_EncounterJournal.GetLootInfoByIndex 不存在"); return end
  for i = 1, 3 do
    local r
    if encounterID then r = { pcall(fn, i, encounterID) } else r = { pcall(fn, i) } end
    local ok = table.remove(r, 1)
    if not ok then
      msg("第" .. i .. "件：调用报错 " .. tostring(r[1]))
    elseif #r == 0 or r[1] == nil then
      msg("第" .. i .. "件：nil（无返回）")
    else
      msg("第" .. i .. "件：返回值数=" .. #r)
      for ri, v in ipairs(r) do
        if type(v) == "table" then dumpRaw("  [" .. ri .. "].", v)
        else msg("  [" .. ri .. "] " .. tostring(v)) end
      end
    end
  end
end

function WJDCProbe(arg)
  if C_AddOns and C_AddOns.IsAddOnLoaded and C_AddOns.LoadAddOn
     and not C_AddOns.IsAddOnLoaded("Blizzard_EncounterJournal") then
    pcall(C_AddOns.LoadAddOn, "Blizzard_EncounterJournal")
  end
  if not WJDCShared.ejAvailable() then
    err("probe：副本手册接口不可用，请确认 12.x 正式服")
    return
  end
  local tier = EJ_GetCurrentTier()
  if tier then pcall(EJ_SelectTier, tier) end
  local idx = tonumber(arg) or 1
  local instanceID, iname = EJ_GetInstanceByIndex(idx, true)
  if not instanceID then err("probe：第 " .. idx .. " 个团本实例不存在"); return end
  msg("===== probe 目标：" .. tostring(iname) .. "（instanceID=" .. tostring(instanceID) .. "）=====")

  local r1 = { pcall(EJ_SelectInstance, instanceID) }
  msg("EJ_SelectInstance(" .. instanceID .. ")：ok=" .. tostring(table.remove(r1, 1)) .. " 返回[" .. retstr(r1) .. "]")

  local bname, _, encounterID = EJ_GetEncounterInfoByIndex(1, instanceID)
  msg("BOSS#1：" .. tostring(bname) .. "（encounterID=" .. tostring(encounterID) .. "）")
  if not encounterID then err("probe：拿不到 encounterID，终止"); return end
  local r2 = { pcall(EJ_SelectEncounter, encounterID) }
  msg("EJ_SelectEncounter(" .. encounterID .. ")：ok=" .. tostring(table.remove(r2, 1)) .. " 返回[" .. retstr(r2) .. "]")

  if C_EncounterJournal and C_EncounterJournal.GetSlotFilter then
    local ok, f = pcall(C_EncounterJournal.GetSlotFilter)
    msg("GetSlotFilter() = " .. (ok and tostring(f) or ("报错：" .. tostring(f))))
  else
    msg("GetSlotFilter：函数不存在")
  end

  probeLoot("GetLootInfoByIndex(i) 单参")
  probeLoot("GetLootInfoByIndex(i, encounterID) 双参", encounterID)

  -- 单件详查 + ilvl 字段排查（拿到第一个 itemID 才做）
  local firstID
  local fn = C_EncounterJournal and C_EncounterJournal.GetLootInfoByIndex
  if fn then
    for i = 1, 5 do
      local ok, a = pcall(fn, i)
      if ok and type(a) == "table" and a.itemID then firstID = a.itemID break end
    end
  end
  if firstID then
    msg("----- 单件详查 itemID=" .. firstID .. " -----")
    if C_EncounterJournal.GetLootInfo then
      local ok, info = pcall(C_EncounterJournal.GetLootInfo, firstID)
      if ok and type(info) == "table" then dumpRaw("GetLootInfo.", info)
      else msg("GetLootInfo 返回：" .. tostring(info)) end
    else
      msg("C_EncounterJournal.GetLootInfo：函数不存在")
    end
    if type(GetDetailedItemLevelInfo) == "function" then
      local ok, l1, l2 = pcall(GetDetailedItemLevelInfo, firstID)
      msg("GetDetailedItemLevelInfo：" .. (ok and (tostring(l1) .. ", " .. tostring(l2)) or ("报错：" .. tostring(l1))))
    else
      msg("GetDetailedItemLevelInfo：全局函数不存在（病害②嫌疑：ilvl 字段错位/函数移除）")
    end
    if C_Item and C_Item.GetDetailedItemLevelInfo then
      local ok, l1, l2 = pcall(C_Item.GetDetailedItemLevelInfo, firstID)
      msg("C_Item.GetDetailedItemLevelInfo：" .. (ok and (tostring(l1) .. ", " .. tostring(l2)) or ("报错：" .. tostring(l1))))
    else
      msg("C_Item.GetDetailedItemLevelInfo：不存在")
    end
  else
    msg("未能从 GetLootInfoByIndex 拿到任何 itemID，单件详查跳过（=病害①现场）")
  end
  -- 存档记录（任务书 #26-fix4）：套装专精级 API 存在性，供顾问侧 OCR 管道对照
  msg("存档：C_Item.GetSetBonusesForSpecializationByItemID = " .. tostring(type(C_Item and C_Item.GetSetBonusesForSpecializationByItemID)))
  msg("===== probe 结束，请把聊天框完整截图反馈顾问侧 =====")
end
