-- ============================================================
-- 诊断模块（任务书 #26-fix3）：/wjdc probe [团本序号，默认 1]
-- 1.0.6 新增物品级诊断：/wjdc probe <物品ID>（数值采集链核验，任务书 #28 WP1-fix）
-- 1.0.7 新增四难度档通道诊断（任务书 #29 WP1）：切档函数存在性/试切读回/link 字段/同件两档缩放实证
-- 只读诊断，不改导出逻辑；输出全部走聊天框，请完整截图反馈顾问侧
-- ============================================================
local msg = WJDCShared.msg
local err = WJDCShared.err

local function retstr(t)
  local o = {}
  for i, v in ipairs(t) do o[i] = tostring(v) end
  return table.concat(o, ", ")
end

local function kv(t)
  local o = {}
  for k, v in pairs(t) do o[#o + 1] = tostring(k) .. "=" .. tostring(v) end
  table.sort(o)
  return "{" .. table.concat(o, ", ") .. "}"
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

-- 物品级诊断（1.0.6，任务书 #28 WP1-fix）：/wjdc probe <物品ID>
-- 验证数值采集链：GetItemStats 原始返回 + 通道判定 + tooltip 原行 + 解析结果
local function probeItem(itemID)
  msg("===== probe 物品：" .. tostring(itemID) .. " =====")
  local name, _, _, ilvl = GetItemInfo(itemID)
  if not name and C_Item and C_Item.RequestLoadItemDataByID then
    pcall(C_Item.RequestLoadItemDataByID, itemID)
    name, _, _, ilvl = GetItemInfo(itemID)
  end
  msg("GetItemInfo：name=" .. tostring(name) .. " ilvl=" .. tostring(ilvl))
  -- ① API 通道原始返回（key / 原始值 / _G 解析名）
  if type(GetItemStats) == "function" then
    local ok, stats = pcall(GetItemStats, "item:" .. itemID)
    if not ok then
      msg("GetItemStats 调用报错：" .. tostring(stats))
    elseif type(stats) ~= "table" then
      msg("GetItemStats 返回非表：" .. tostring(stats))
    else
      local n = 0
      for _ in pairs(stats) do n = n + 1 end
      msg("GetItemStats 返回表，共 " .. n .. " 项：")
      local keys = {}
      for k in pairs(stats) do keys[#keys + 1] = k end
      table.sort(keys, function(x, y) return tostring(x) < tostring(y) end)
      for _, k in ipairs(keys) do
        msg("  " .. tostring(k) .. " = " .. tostring(stats[k]) .. "（_G 解析名：" .. tostring(_G[k]) .. "）")
      end
    end
  else
    msg("GetItemStats：函数不存在（API 通道不可用）")
  end
  -- ② 通道判定（与导出同函数）
  local pv, sv = WJDCShared.statValuesFromApi(itemID)
  if pv then
    msg("通道判定：GetItemStats 命中")
  else
    msg("通道判定：GetItemStats 未命中（不存在/报错/空表），导出将回退 tooltip 解析")
  end
  -- ③ tooltip 原行（仅属性相关行，原样输出——含前导 + 有无，供主属性行格式核对）
  local lines = WJDCShared.scanLines(itemID)
  if lines then
    msg("tooltip 属性相关原行：")
    for _, t in ipairs(lines) do
      if t:match("力量") or t:match("敏捷") or t:match("智力")
         or t:match("爆击") or t:match("急速") or t:match("精通") or t:match("全能") then
        msg("  | " .. t)
      end
    end
  else
    msg("tooltip 扫描失败（物品未缓存？/reload 后重试）")
  end
  -- ④ 解析结果（与导出同函数）
  local d = WJDCShared.parseItemDetail(itemID)
  msg("parseItemDetail：primary=" .. retstr(d.primary) .. " ｜ secondary=" .. retstr(d.secondary))
  msg("  tooltip 数值：primary_values=" .. kv(d.primary_values) .. " secondary_values=" .. kv(d.secondary_values))
  msg("  API 数值：primary_values=" .. kv(pv or {}) .. " secondary_values=" .. kv(sv or {}))
  msg("===== probe 物品结束，请把聊天框完整截图反馈顾问侧 =====")
end

function WJDCProbe(arg)
  -- 物品级诊断分支（1.0.6）：纯数字且 ≥100000 视为物品 ID（实例序号两位数量级，不会撞号）
  local asItem = tonumber(arg)
  if asItem and asItem >= 100000 then probeItem(asItem) return end
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

  -- 四难度档通道诊断（1.0.7，任务书 #29 WP1）：
  -- ① 切档函数存在性 ② 试切 LFR(17) 读回 + 还原 ③ 旁证 API 存在性存档
  msg("----- 四难度档通道诊断（1.0.7） -----")
  msg("EJ_SetDifficulty = " .. type(EJ_SetDifficulty) .. " ｜ EJ_GetDifficulty = " .. type(EJ_GetDifficulty))
  if type(EJ_GetDifficulty) == "function" then
    local ok, d = pcall(EJ_GetDifficulty)
    msg("EJ_GetDifficulty() 当前值 = " .. (ok and tostring(d) or ("报错：" .. tostring(d))))
  end
  if type(EJ_SetDifficulty) == "function" and type(EJ_GetDifficulty) == "function" then
    local okS = pcall(EJ_SetDifficulty, 17)
    local okG, cur = pcall(EJ_GetDifficulty)
    msg("试切 LFR(17)：set ok=" .. tostring(okS) .. " ｜ 读回=" .. (okG and tostring(cur) or ("报错：" .. tostring(cur))))
    pcall(EJ_SetDifficulty, 14)
    local okG2, cur2 = pcall(EJ_GetDifficulty)
    msg("还原 Normal(14)：读回=" .. (okG2 and tostring(cur2) or ("报错：" .. tostring(cur2))))
  end
  msg("存档：C_Item.GetItemStats = " .. tostring(type(C_Item and C_Item.GetItemStats))
      .. " ｜ C_TooltipInfo.GetHyperlink = " .. tostring(type(C_TooltipInfo and C_TooltipInfo.GetHyperlink)))

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
  -- 四档缩放实证（1.0.7）：同一切换 LFR(17)/史诗(16) 重取 link 重扫，两档值应不同；
  -- link 字段缺失或两档同值 = 通道不实，导出会自动回退单档（此段为唯一真机待验证点）
  if firstID and WJDCShared.scanLink and type(EJ_SetDifficulty) == "function"
     and type(EJ_GetDifficulty) == "function" and C_EncounterJournal
     and type(C_EncounterJournal.GetLootInfoByIndex) == "function" then
    msg("----- 四档缩放实证（itemID=" .. firstID .. "） -----")
    for _, td in ipairs({ { 17, "lfr" }, { 16, "mythic" } }) do
      pcall(EJ_SetDifficulty, td[1])
      local okQ, info = pcall(C_EncounterJournal.GetLootInfoByIndex, 1)
      local link = okQ and type(info) == "table" and info.link or nil
      if link then
        local lines = WJDCShared.scanLink(link)
        local d = { primary = {}, secondary = {}, primary_values = {}, secondary_values = {} }
        if lines then WJDCShared.parseStatLines(lines, d) end
        msg(td[2] .. "(" .. td[1] .. ")：pv=" .. kv(d.primary_values) .. " sv=" .. kv(d.secondary_values))
      else
        msg(td[2] .. "(" .. td[1] .. ")：GetLootInfoByIndex(1) 无 link 字段（稀疏表现场）")
      end
    end
    pcall(EJ_SetDifficulty, 14)
    msg("（两档 pv/sv 应有可见差异；完全相同请截图反馈顾问侧）")
  end
  -- 存档记录（任务书 #26-fix4）：套装专精级 API 存在性，供顾问侧 OCR 管道对照
  msg("存档：C_Item.GetSetBonusesForSpecializationByItemID = " .. tostring(type(C_Item and C_Item.GetSetBonusesForSpecializationByItemID)))
  msg("===== probe 结束，请把聊天框完整截图反馈顾问侧 =====")
end
