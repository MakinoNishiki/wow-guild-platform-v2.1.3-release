-- ============================================================
-- 魔兽管家-家宅装饰 WoWButlerDecor（任务书 #48，REQ-137 数据切片）
-- 纯只读探针：只调 Get/Search/Create 类查询 API，零写入、不访问网络、不碰账号数据
-- 导出目标：SavedVariables 全局表 WoWButlerDecorDB（/reload 或退出游戏后写盘）
-- 命令：/wbd scan
-- 调研依据（任务书 #48「调研依据」节 + 本节允许范围内的 wiki 补充）：
--   warcraft.wiki.gg《World of Warcraft API》HousingCatalogUI 系统
--   - C_HousingCatalog.CreateCatalogSearcher()：创建 HousingCatalogSearcher 搜索器对象
--   - HousingCatalogSearcher:RunSearch()：按当前参数跑搜索
--   - HousingCatalogSearcher:GetCatalogSearchResults()：取最近搜索结果，
--     返回 matchingEntryVariantIDs（12.0.5 起；元素={recordID,entryType,variantIdentifier}，
--     旧形态 matchingEntryIDs 元素为纯数字 entryID）——两种形态本插件都兼容并记入 diag
--   - HousingCatalogSearcher:SetSearchText([searchText])：搜索参数，空串=显式空搜索条件
--   - C_HousingCatalog.GetCatalogEntryInfo(entryID)：entryID={recordID,entryType}，
--     返回条目详情表（name/sourceText/iconTexture/categoryIDs/size/quality/
--     placementCost/totalNumStored/totalNumPlaced/firstAcquisitionBonus 等）
-- 残留不确定点（任务书原文，如实保留）：
--   ①搜索器是否需要显式设置过滤条件才返回全量——容错分支已覆盖，diag 会记录真实形态；
--   ②国服客户端 API 可用性——若国服阉割，第一次真机跑即暴露（failCount=总数 或 枚举 0 结果）。
-- ============================================================

local ADDON_VERSION = "0.1.1"

local function msg(s) DEFAULT_CHAT_FRAME:AddMessage("|cffffd200[wbd]|r " .. s) end
local function err(s) DEFAULT_CHAT_FRAME:AddMessage("|cffff4040[wbd]|r " .. s) end

local MAX_SAMPLES = 30
local MAX_RETRIES = 3

-- 搜索器方法能力探测候选清单：前 4 个为 wiki 文档在案方法，IsSearchInProgress
-- 为未证实候选（只探测不调用）；另对搜索器做 pairs 全量扫面，实测方法集如实记 diag
local SEARCHER_METHOD_CANDIDATES = {
  "CreateCatalogSearcher", -- 占位防呆：正常不会出现在对象上
  "RunSearch",
  "GetCatalogSearchResults",
  "SetSearchText",
  "GetSearchCount",
  "IsSearchInProgress",
}

local function buildMeta()
  local ver, build, _, iface = GetBuildInfo()
  return { addon = ADDON_VERSION, client = ver, build = build, interface = iface,
           time = date("%Y-%m-%d %H:%M:%S"), run_id = date("%Y%m%d-%H%M%S") }
end

local function deepCopy(v, depth)
  if type(v) ~= "table" then return v end
  depth = depth or 0
  if depth > 8 then return "<max-depth>" end
  local t = {}
  for k, val in pairs(v) do
    t[k] = deepCopy(val, depth + 1)
  end
  return t
end

-- 返回形态描述（type + 表规模 + 首键形态），供 diag 如实记录
local function shapeOf(v)
  local ty = type(v)
  if ty ~= "table" then return ty end
  local n, first = 0, nil
  for k, val in pairs(v) do
    n = n + 1
    if first == nil then first = tostring(k) .. ":" .. type(val) end
  end
  return "table(n=" .. n .. (first and (",first=" .. first) or "") .. ")"
end

-- 搜索结果元素 → GetCatalogEntryInfo 入参 entryID
-- 新形态元素={recordID,entryType,variantIdentifier}（取 recordID/entryType 两键），
-- 旧形态元素=纯数字直接透传；其他形态原样透传由 pcall 兜底
local function toEntryID(e)
  if type(e) == "table" then return { recordID = e.recordID, entryType = e.entryType } end
  return e
end

local function saveFailure(diag, reason)
  WoWButlerDecorDB = { runMeta = buildMeta(), totalCount = 0, failCount = 0,
                       stats = {}, samples = {}, diag = diag }
  err(reason .. "（诊断信息已写入 SavedVariables，/reload 后可取文件）")
end

-- 枚举一次（可选先显式设置空搜索条件）；成功返回结果表，失败/空返回 nil，过程记 diag
local function tryEnumerate(searcher, diag, useExplicitEmpty)
  if useExplicitEmpty then
    if type(searcher.SetSearchText) == "function" then
      local okT, eT = pcall(function() searcher:SetSearchText("") end)
      diag.steps[#diag.steps + 1] = "SetSearchText(\"\") 显式空搜索条件 ok=" .. tostring(okT)
        .. (okT and "" or (" err=" .. tostring(eT)))
    else
      diag.steps[#diag.steps + 1] = "SetSearchText 缺失，跳过显式空搜索条件"
    end
  end
  if type(searcher.RunSearch) == "function" then
    local okR, eR = pcall(function() searcher:RunSearch() end)
    diag.steps[#diag.steps + 1] = "RunSearch ok=" .. tostring(okR)
      .. (okR and "" or (" err=" .. tostring(eR)))
  else
    diag.steps[#diag.steps + 1] = "RunSearch 缺失"
  end
  if type(searcher.GetCatalogSearchResults) ~= "function" then
    diag.steps[#diag.steps + 1] = "GetCatalogSearchResults 缺失，无法取结果"
    return nil
  end
  local okG, res = pcall(function() return searcher:GetCatalogSearchResults() end)
  diag.steps[#diag.steps + 1] = "GetCatalogSearchResults ok=" .. tostring(okG)
    .. " shape=" .. (okG and shapeOf(res) or tostring(res))
  if okG and type(res) == "table" and #res > 0 then return res end
  return nil
end

local function collectAndSave(results, diag, t0)
  local tEnum = GetTime()
  diag.enumShape = shapeOf(results)
  diag.firstResultShape = shapeOf(results[1])

  local total, fail = 0, 0
  local stats = {
    sourceText = { empty = 0, nonempty = 0 },
    placementCost = { ["1"] = 0, ["2"] = 0, ["3"] = 0, ["4"] = 0, ["5"] = 0, empty = 0, other = 0 },
    category = { form = "", counts = {} },
    icon = { fileID = 0, other = 0, missing = 0 },
    size = { nonempty = 0 },
    quality = { nonempty = 0 },
  }
  local samples = {}

  for _, e in ipairs(results) do
    total = total + 1
    local entryID = toEntryID(e)
    local ok, info = pcall(C_HousingCatalog.GetCatalogEntryInfo, entryID)
    if not ok or type(info) ~= "table" then
      fail = fail + 1
    else
      -- sourceText 空/非空
      if info.sourceText == nil or info.sourceText == "" then
        stats.sourceText.empty = stats.sourceText.empty + 1
      else
        stats.sourceText.nonempty = stats.sourceText.nonempty + 1
      end
      -- placementCost 分布（1~5/空/其他形态）
      local pc = info.placementCost
      if pc == nil then
        stats.placementCost.empty = stats.placementCost.empty + 1
      elseif type(pc) == "number" and pc >= 1 and pc <= 5 and pc == math.floor(pc) then
        local key = tostring(pc)
        stats.placementCost[key] = stats.placementCost[key] + 1
      else
        stats.placementCost.other = stats.placementCost.other + 1
      end
      -- 分类分布（categoryIDs/category 字段形态如实记录，多形态并存拼接记录）
      local cat = info.categoryIDs
      local catKey = "categoryIDs"
      if cat == nil then cat = info.category; catKey = "category" end
      if cat ~= nil then
        local form = catKey .. ":" .. type(cat)
        if stats.category.form == "" then
          stats.category.form = form
        elseif not stats.category.form:find(form, 1, true) then
          stats.category.form = stats.category.form .. "|" .. form
        end
        if type(cat) == "table" then
          for _, c in ipairs(cat) do
            local ck = tostring(c)
            stats.category.counts[ck] = (stats.category.counts[ck] or 0) + 1
          end
        else
          local ck = tostring(cat)
          stats.category.counts[ck] = (stats.category.counts[ck] or 0) + 1
        end
      end
      -- iconTexture 形态（数字 fileID vs 其他形态 vs 缺失）
      local ic = info.iconTexture
      if ic == nil then
        stats.icon.missing = stats.icon.missing + 1
      elseif type(ic) == "number" then
        stats.icon.fileID = stats.icon.fileID + 1
      else
        stats.icon.other = stats.icon.other + 1
      end
      -- 尺寸/品质字段非空计数（非空率 = nonempty / totalCount）
      if info.size ~= nil then stats.size.nonempty = stats.size.nonempty + 1 end
      if info.quality ~= nil then stats.quality.nonempty = stats.quality.nonempty + 1 end
      -- samples：前 30 条返回表全键值原样深拷贝 + 本条 entryID
      if #samples < MAX_SAMPLES then
        local s = deepCopy(info, 0)
        s.entryID = deepCopy(entryID, 0)
        samples[#samples + 1] = s
      end
    end
  end

  local tEnd = GetTime()
  diag.steps[#diag.steps + 1] = string.format("逐条取字段 %d 件（失败 %d）耗时 %.2fs", total, fail, tEnd - tEnum)
  diag.totalElapsedSec = tonumber(string.format("%.2f", tEnd - t0))

  WoWButlerDecorDB = { runMeta = buildMeta(), totalCount = total, failCount = fail,
                       stats = stats, samples = samples, diag = diag }

  msg(string.format("扫描完成：总数 %d；sourceText 非空 %d / 空 %d；取字段失败 %d 件",
    total, stats.sourceText.nonempty, stats.sourceText.empty, fail))
  if total < 100 or total > 10000 then
    msg("数量异常，可能枚举通道不符预期（判据参照 3000±500）——数据照常落盘")
  end
  msg("数据已写入 SavedVariables，/reload 后取文件（WTF/Account/<你的账号名>/SavedVariables/WoWButlerDecorDB.lua）")
end

local function doScan()
  msg("开始扫描家宅装饰目录（/wbd scan，插件 v" .. ADDON_VERSION .. "，纯只读）…")
  local t0 = GetTime()
  local diag = { probedMethods = {}, pairsSweep = "未执行", steps = {}, retries = 0 }

  if type(C_HousingCatalog) ~= "table" or type(C_HousingCatalog.CreateCatalogSearcher) ~= "function"
     or type(C_HousingCatalog.GetCatalogEntryInfo) ~= "function" then
    diag.steps[#diag.steps + 1] = "C_HousingCatalog=" .. type(C_HousingCatalog)
      .. " CreateCatalogSearcher=" .. type(C_HousingCatalog and C_HousingCatalog.CreateCatalogSearcher)
      .. " GetCatalogEntryInfo=" .. type(C_HousingCatalog and C_HousingCatalog.GetCatalogEntryInfo)
    saveFailure(diag, "目录枚举失败：C_HousingCatalog 命名空间或查询函数不存在（本客户端 Housing API 不可用）")
    return
  end

  local okS, searcher = pcall(C_HousingCatalog.CreateCatalogSearcher)
  diag.steps[#diag.steps + 1] = string.format("CreateCatalogSearcher ok=%s type=%s (%.2fs)",
    tostring(okS), tostring(okS and type(searcher) or searcher), GetTime() - t0)
  if not okS or (type(searcher) ~= "table" and type(searcher) ~= "userdata") then
    saveFailure(diag, "目录枚举失败：CreateCatalogSearcher 未返回搜索器对象")
    return
  end

  -- 元表形态摸底（只读）：userdata 经元表 __index 取值，记录元表是否存在及 __index 类型
  local okM, mt = pcall(getmetatable, searcher)
  if okM then
    diag.steps[#diag.steps + 1] = string.format("getmetatable: %s, __index type=%s",
      tostring(mt ~= nil), type(mt and mt.__index))
  else
    diag.steps[#diag.steps + 1] = "getmetatable 异常（" .. tostring(mt) .. "）"
  end

  -- 能力探测：候选清单 type() 判 function + pairs 全量扫面（只探测不调用）
  for _, m in ipairs(SEARCHER_METHOD_CANDIDATES) do
    if type(searcher[m]) == "function" then
      diag.probedMethods[#diag.probedMethods + 1] = m
    end
  end
  local okP, sweep = pcall(function()
    local found = {}
    for k, v in pairs(searcher) do
      if type(v) == "function" then found[#found + 1] = tostring(k) end
    end
    table.sort(found)
    return found
  end)
  if okP and type(sweep) == "table" and #sweep > 0 then
    diag.pairsSweep = table.concat(sweep, ",")
  elseif okP then
    diag.pairsSweep = "pairs 可遍历但无函数成员"
  else
    diag.pairsSweep = "pairs 不可遍历（" .. tostring(sweep) .. "）"
  end

  -- 枚举链：直取 → 显式空搜索条件再取 → C_Timer.After(0.5) 重试至多 3 次
  local results = tryEnumerate(searcher, diag, false)
  if not results then results = tryEnumerate(searcher, diag, true) end
  if results then
    collectAndSave(results, diag, t0)
    return
  end

  local attempt = 0
  local function retry()
    attempt = attempt + 1
    diag.retries = attempt
    local r = tryEnumerate(searcher, diag, false)
    if r then
      collectAndSave(r, diag, t0)
    elseif attempt < MAX_RETRIES then
      C_Timer.After(0.5, retry)
    else
      saveFailure(diag, "目录枚举失败：搜索器 0 结果（重试 " .. attempt .. " 次仍空）")
    end
  end
  C_Timer.After(0.5, retry)
end

SLASH_WBD1 = "/wbd"
SlashCmdList["WBD"] = function(input)
  local cmd = (input or ""):gsub("^%s+", ""):gsub("%s+$", ""):lower()
  if cmd == "scan" then
    doScan()
  else
    msg("用法：/wbd scan（扫描家宅装饰目录，写入 SavedVariables WoWButlerDecorDB）")
  end
end
