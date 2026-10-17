-- ============================================================
-- 诊断模块（任务书 #26-fix3）：/wjdc probe [团本序号，默认 1]
-- 1.0.6 新增物品级诊断：/wjdc probe <物品ID>（数值采集链核验，任务书 #28 WP1-fix）
-- 1.0.7 新增四难度档通道诊断（任务书 #29 WP1）：切档函数存在性/试切读回/link 字段/同件两档缩放实证
-- 1.0.9 物品级诊断加 tooltip 全行原样 dump（任务书 #46，REQ-088 取证）：
--   | 转义为 || 使色码/图标码以可见文本输出，对照剥离后形态定论特效行失配原因
-- 1.0.11 新增悬停链接直读模式：/wjdc probe hover（REQ-088 终案取证标准件）——
--   GameTooltip:GetItem() 取当前悬停物品的实物链接（带完整 bonusID/难度上下文，
--   区别于 GetItemInfo 裸链接），直读 tooltip 全行 dump + 特效/毒咒判定 + API 对照；
--   物品级诊断的 API 通道检测同步切换 C_Item.GetItemStats 优先（12.1 全局 GetItemStats 已移除）
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
  -- 1.0.11：12.1 起全局 GetItemStats 已移除，优先 C_Item.GetItemStats（与导出 statValuesFromApi 同序）
  local apiFn = (C_Item and C_Item.GetItemStats) or GetItemStats
  local apiName = (C_Item and type(C_Item.GetItemStats) == "function") and "C_Item.GetItemStats" or "GetItemStats"
  if type(apiFn) == "function" then
    local ok, stats = pcall(apiFn, "item:" .. itemID)
    if not ok then
      msg(apiName .. " 调用报错：" .. tostring(stats))
    elseif type(stats) ~= "table" then
      msg(apiName .. " 返回非表：" .. tostring(stats))
    else
      local n = 0
      for _ in pairs(stats) do n = n + 1 end
      msg(apiName .. " 返回表，共 " .. n .. " 项：")
      local keys = {}
      for k in pairs(stats) do keys[#keys + 1] = k end
      table.sort(keys, function(x, y) return tostring(x) < tostring(y) end)
      for _, k in ipairs(keys) do
        msg("  " .. tostring(k) .. " = " .. tostring(stats[k]) .. "（_G 解析名：" .. tostring(_G[k]) .. "）")
      end
    end
  else
    msg("GetItemStats / C_Item.GetItemStats：均不存在（API 通道不可用）")
  end
  -- ② 通道判定（与导出同函数）
  local pv, sv = WJDCShared.statValuesFromApi(itemID)
  if pv then
    msg("通道判定：" .. apiName .. " 命中")
  else
    msg("通道判定：API 通道未命中（不存在/报错/空表），导出将回退 tooltip 解析")
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
    -- ③+ tooltip 全行原样 dump（1.0.9，REQ-088 取证）：| 转义为 || 使 |cffRRGGBB/|r/|T..|t
    -- 以可见文本输出；每行附剥离后形态（stripLineCodes）对照，定论特效行失配形态
    -- 1.0.10 加完整性计数：NumLines vs 实际读到的非空行 vs 缺失字体串序号（漏读通道取证）
    local nTotal = 0
    do
      local tipFrame = _G["WJDCScanTip"]
      nTotal = tipFrame and tipFrame:NumLines() or -1
    end
    msg("tooltip 全行原样 dump（A 通道=SetItemByID，| 已转义 ||，NumLines=" .. nTotal .. " 读到非空 " .. #lines .. " 行）：")
    for i, t in ipairs(lines) do
      msg("  A[" .. i .. "] " .. t:gsub("|", "||"))
      if WJDCShared.stripLineCodes then
        local plain = WJDCShared.stripLineCodes(t)
        if plain ~= t then msg("      剥离后 → " .. plain:gsub("|", "||")) end
      end
    end
    -- ③++ 双通道对照（1.0.10，REQ-088 真机报障取证）：B 通道 = SetHyperlink(GetItemInfo 物品链接)——
    -- A 通道缺特效/毒咒行而 B 通道有 = 手册预览与实物 tooltip 来源差异实锤，导出 1.0.10 起已自动双通道回退
    local _, itemLink = GetItemInfo(itemID)
    if itemLink and WJDCShared.scanLink then
      local blines = WJDCShared.scanLink(itemLink)
      if blines then
        local function hasFx(ls)
          local fx, vc = false, false
          for _, t in ipairs(ls) do
            local p = WJDCShared.stripLineCodes and WJDCShared.stripLineCodes(t) or t
            if p:match("^(装备：") or p:match("^(使用：") then fx = true end
            if p == "毒咒" then vc = true end
          end
          return fx, vc
        end
        local afx, avc = hasFx(lines)
        local bfx, bvc = hasFx(blines)
        msg(string.format("通道判定：A(SetItemByID) 特效行=%s 毒咒行=%s ｜ B(SetHyperlink) 特效行=%s 毒咒行=%s",
          tostring(afx), tostring(avc), tostring(bfx), tostring(bvc)))
        msg("tooltip 全行原样 dump（B 通道=SetHyperlink 物品链接，共 " .. #blines .. " 行）：")
        for i, t in ipairs(blines) do
          msg("  B[" .. i .. "] " .. t:gsub("|", "||"))
        end
      else
        msg("B 通道 SetHyperlink 扫描失败")
      end
    else
      msg("B 通道：GetItemInfo 未返回物品链接")
    end
  else
    msg("tooltip 扫描失败（物品未缓存？/reload 后重试）")
  end
  -- ④ 解析结果（与导出同函数）
  local d = WJDCShared.parseItemDetail(itemID)
  msg("parseItemDetail：primary=" .. retstr(d.primary) .. " ｜ secondary=" .. retstr(d.secondary))
  msg("  tooltip 数值：primary_values=" .. kv(d.primary_values) .. " secondary_values=" .. kv(d.secondary_values))
  msg("  effect=" .. tostring(d.effect) .. " ｜ venomcurse=" .. tostring(d.venomcurse))
  msg("  API 数值：primary_values=" .. kv(pv or {}) .. " secondary_values=" .. kv(sv or {}))
  msg("===== probe 物品结束，请把聊天框完整截图反馈顾问侧 =====")
end

-- 悬停链接直读模式（1.0.11，REQ-088 终案取证标准件）：GameTooltip:GetItem() 取当前悬停
-- 物品的实物链接——带完整 bonusID/难度上下文，区别于 GetItemInfo 裸链接（平面通道）。
-- 用法：鼠标悬停任意装备（背包/角色面板/聊天链接/副本手册掉落均可）保持不动，输入 /wjdc probe hover
local function probeHover()
  msg("===== probe 悬停直读（GameTooltip:GetItem） =====")
  if not (GameTooltip and GameTooltip.GetItem) then
    err("GameTooltip:GetItem 不可用")
    return
  end
  local name, link = GameTooltip:GetItem()
  if not link then
    err("未读到悬停物品——请保持鼠标悬停在装备上不动，再输入 /wjdc probe hover")
    return
  end
  msg("悬停物品：" .. tostring(name))
  msg("悬停链接（| 已转义 ||）：" .. link:gsub("|", "||"))
  -- H 通道：悬停链接 SetHyperlink 全行原样 dump（与物品级诊断同口径）
  local lines = WJDCShared.scanLink(link)
  if not lines then
    err("悬停链接 SetHyperlink 扫描失败")
    return
  end
  local fx, vc = false, false
  for _, t in ipairs(lines) do
    local p = WJDCShared.stripLineCodes and WJDCShared.stripLineCodes(t) or t
    if p:match("^装备：") or p:match("^使用：") then fx = true end
    if p == "毒咒" then vc = true end
  end
  msg(string.format("悬停通道判定：特效行=%s 毒咒行=%s（共 %d 行）", tostring(fx), tostring(vc), #lines))
  msg("tooltip 全行原样 dump（H 通道=悬停链接 SetHyperlink，| 已转义 ||）：")
  for i, t in ipairs(lines) do
    msg("  H[" .. i .. "] " .. t:gsub("|", "||"))
  end
  -- 解析结果对照（与导出 parseStatLines 同函数同口径）
  local d = { primary = {}, secondary = {}, effect = "", venomcurse = "", primary_values = {}, secondary_values = {} }
  WJDCShared.parseStatLines(lines, d)
  msg("parseStatLines：primary=" .. retstr(d.primary) .. " ｜ secondary=" .. retstr(d.secondary))
  msg("  数值：primary_values=" .. kv(d.primary_values) .. " secondary_values=" .. kv(d.secondary_values))
  msg("  effect=" .. tostring(d.effect) .. " ｜ venomcurse=" .. tostring(d.venomcurse))
  -- API 通道对照：悬停链接直传 C_Item.GetItemStats（实物链接上下文）
  local apiFn = C_Item and C_Item.GetItemStats
  if type(apiFn) == "function" then
    local ok, stats = pcall(apiFn, link)
    if ok and type(stats) == "table" then
      local n = 0
      for _ in pairs(stats) do n = n + 1 end
      msg("C_Item.GetItemStats(悬停链接) 返回表，共 " .. n .. " 项")
    else
      msg("C_Item.GetItemStats(悬停链接)：" .. (ok and ("返回非表：" .. tostring(stats)) or ("调用报错：" .. tostring(stats))))
    end
  else
    msg("C_Item.GetItemStats：函数不存在")
  end
  msg("===== probe 悬停直读结束，请把聊天框完整截图反馈顾问侧 =====")
end

function WJDCProbe(arg)
  -- 悬停直读分支（1.0.11）：/wjdc probe hover
  if type(arg) == "string" and arg:lower() == "hover" then probeHover() return end
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
