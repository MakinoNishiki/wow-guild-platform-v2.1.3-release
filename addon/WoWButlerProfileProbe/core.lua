-- REQ-093: manual, local-only CN retail capability probe. No business writes.
local VERSION = "0.1.0"
local busy, current
local frame = CreateFrame("Frame")
local function msg(text) DEFAULT_CHAT_FRAME:AddMessage("|cffffd200[个人档案验证]|r " .. text) end
local function scalar(v)
    if issecretvalue and issecretvalue(v) then return nil end
    local t = type(v)
    if t == "string" or t == "boolean" then return v end
    if t == "number" and v == v and v ~= math.huge and v ~= -math.huge then return v end
end
local function call(label, fn, ...)
    if type(fn) ~= "function" then current.diagnostics[label] = "unavailable"; return end
    local r = {pcall(fn, ...)}
    if not r[1] then current.diagnostics[label] = "call_failed"; return end
    return unpack(r, 2, 18)
end
local function fields(src, names)
    local dst = {}
    if type(src) == "table" then
        for _, key in ipairs(names) do dst[key] = scalar(src[key]) end
    end
    return dst
end
local function equipment()
    local result = {}
    for slot = 1, 19 do
        local id = scalar(call("GetInventoryItemID", GetInventoryItemID, "player", slot))
        local link = scalar(call("GetInventoryItemLink", GetInventoryItemLink, "player", slot))
        local row = {slot = slot, itemID = id, itemLink = link}
        if link then
            row.actualItemLevel = scalar(call("GetDetailedItemLevelInfo", C_Item and C_Item.GetDetailedItemLevelInfo, link))
            row.name = scalar(call("GetItemInfo", C_Item and C_Item.GetItemInfo, link))
        end
        row.state = id and (row.actualItemLevel and "read" or "pending_item_data") or "empty_or_unavailable"
        result[#result + 1] = row
    end
    current.equipment = result
    local overall, equipped = call("GetAverageItemLevel", GetAverageItemLevel)
    current.itemLevel = {overall = scalar(overall), equipped = scalar(equipped)}
end
local function mythicPlus()
    local raw = call("GetPlayerMythicPlusRatingSummary", C_PlayerInfo and C_PlayerInfo.GetPlayerMythicPlusRatingSummary, "player")
    local result = fields(raw, {"currentSeasonScore"})
    result.season = scalar(call("GetCurrentSeason", C_MythicPlus and C_MythicPlus.GetCurrentSeason))
    result.state = result.currentSeasonScore ~= nil and "returned_unverified" or "unknown"
    result.runs = {}
    if type(raw) == "table" and type(raw.runs) == "table" then
        for i, run in ipairs(raw.runs) do
            if i > 100 then break end
            result.runs[#result.runs + 1] = fields(run, {"challengeModeID", "mapChallengeModeID", "mapScore", "bestRunLevel", "bestRunDurationMS", "finishedSuccess"})
        end
    end
    current.mythicPlus = result
end
local function raids()
    local rows = {}
    local count = scalar(call("GetNumSavedInstances", GetNumSavedInstances))
    for i = 1, math.min(count or 0, 100) do
        local name, _, reset, difficultyID, locked, extended, _, isRaid, _, difficultyName, total, killed = call("GetSavedInstanceInfo", GetSavedInstanceInfo, i)
        if scalar(isRaid) then
            local row = {name = scalar(name), resetSeconds = scalar(reset), difficultyID = scalar(difficultyID),
                locked = scalar(locked), extended = scalar(extended), difficultyName = scalar(difficultyName),
                encounters = scalar(total), killed = scalar(killed), bosses = {}}
            for boss = 1, math.min(row.encounters or 0, 50) do
                local bossName, _, dead = call("GetSavedInstanceEncounterInfo", GetSavedInstanceEncounterInfo, i, boss)
                row.bosses[#row.bosses + 1] = {name = scalar(bossName), killed = scalar(dead)}
            end
            rows[#rows + 1] = row
        end
    end
    current.raidLockouts = {scope = "weekly_lockouts_not_season_progress", serverUpdateReceived = current.raidInfoReceived or false, rows = rows}
end
local function housing()
    local result = {state = "unknown", entries = {}, scope = "catalog_search_results_not_collection_percentage"}
    current.housing = result
    local searcher = call("CreateCatalogSearcher", C_HousingCatalog and C_HousingCatalog.CreateCatalogSearcher)
    if not searcher then return end
    call("Housing.SetSearchText", searcher.SetSearchText, searcher, "")
    call("Housing.RunSearch", searcher.RunSearch, searcher)
    current.searcher = searcher -- removed before SavedVariables; never persist game objects
end
local function readHousing()
    local searcher = current.searcher
    if not searcher then return end
    local results = call("Housing.GetCatalogSearchResults", searcher.GetCatalogSearchResults, searcher)
    if type(results) ~= "table" then return end
    local seen, rows = {}, {}
    for i, variant in ipairs(results) do
        if i > 10000 then current.housing.truncated = true; break end
        local id = type(variant) == "table" and scalar(variant.recordID) or scalar(variant)
        local kind = type(variant) == "table" and scalar(variant.entryType) or nil
        if id then
            local key = tostring(kind) .. ":" .. tostring(id)
            if not seen[key] then
                seen[key] = true
                local entry = type(variant) == "table" and {recordID = id, entryType = kind} or id
                local info = call("GetCatalogEntryInfo", C_HousingCatalog and C_HousingCatalog.GetCatalogEntryInfo, entry)
                local row = fields(info, {"name", "itemID", "totalNumStored", "totalNumPlaced", "remainingRedeemable", "firstAcquisitionBonus"})
                row.recordID, row.entryType = id, kind
                row.state = type(info) == "table" and "returned_unverified" or "unknown"
                rows[#rows + 1] = row
            end
        end
    end
    current.housing.entries = rows
    current.housing.state = #rows > 0 and "returned_unverified" or "empty_unverified"
end
local function finish()
    if not busy then return end
    equipment(); mythicPlus(); raids(); readHousing()
    current.searcher = nil
    current.finishedAt = time()
    WoWButlerProfileProbeDB = type(WoWButlerProfileProbeDB) == "table" and WoWButlerProfileProbeDB or {}
    local db = WoWButlerProfileProbeDB
    db.schemaVersion = 1
    -- Two snapshots suffice for a controlled before/after comparison; bounded local retention.
    db.previous, db.latest = db.latest, current
    busy = false
    msg("采集完成（仅在游戏内存中）。请输入 /reload 保存；之后由代理读取本地结果。")
end
local function scan()
    if busy then msg("正在采集，请等待约 10 秒。"); return end
    if InCombatLockdown and InCombatLockdown() then msg("请先脱离战斗再验证。"); return end
    if not C_Timer or not C_Timer.After then msg("计时接口不可用，尚未开始采集。"); return end
    busy = true
    current = {probeVersion = VERSION, startedAt = time(), diagnostics = {}}
    local ver, build, _, iface = call("GetBuildInfo", GetBuildInfo)
    current.client = {version = scalar(ver), build = scalar(build), interface = scalar(iface), locale = scalar(call("GetLocale", GetLocale))}
    local class, classToken, classID = call("UnitClass", UnitClass, "player")
    local race, raceToken, raceID = call("UnitRace", UnitRace, "player")
    current.identity = {name = scalar(call("UnitName", UnitName, "player")), realm = scalar(call("GetRealmName", GetRealmName)),
        region = scalar(call("GetCurrentRegion", GetCurrentRegion)), class = scalar(class), classToken = scalar(classToken), classID = scalar(classID),
        race = scalar(race), raceToken = scalar(raceToken), raceID = scalar(raceID), sex = scalar(call("UnitSex", UnitSex, "player")),
        level = scalar(call("UnitLevel", UnitLevel, "player"))}
    local specIndex = scalar(call("GetSpecialization", GetSpecialization))
    if specIndex then
        local id, name = call("GetSpecializationInfo", GetSpecializationInfo, specIndex)
        current.identity.specID, current.identity.spec = scalar(id), scalar(name)
    end
    equipment(); mythicPlus(); housing()
    call("RequestRaidInfo", RequestRaidInfo)
    call("RequestMapInfo", C_MythicPlus and C_MythicPlus.RequestMapInfo)
    C_Timer.After(10, function()
        local ok = pcall(finish)
        if not ok then
            current.searcher = nil; current.diagnostics.finish = "call_failed"
            WoWButlerProfileProbeDB = {schemaVersion = 1, latest = current}
            busy = false; msg("采集未完整完成，诊断已保留；/reload 后由代理检查。")
        end
    end)
    msg("开始本地只读采集，请保持脱战，约 10 秒后提示完成。")
end
frame:RegisterEvent("UPDATE_INSTANCE_INFO")
frame:SetScript("OnEvent", function()
    if busy and current then current.raidInfoReceived = true end
end)
SLASH_WBPROFILEPROBE1 = "/wbprofile"
SlashCmdList.WBPROFILEPROBE = function()
    local ok = pcall(scan)
    if not ok then
        if current then current.searcher = nil end
        busy = false; msg("采集启动失败，未覆盖既有快照，请让代理检查。")
    end
end
