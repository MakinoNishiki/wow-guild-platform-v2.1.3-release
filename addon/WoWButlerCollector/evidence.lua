-- REQ-192/199. Loot history and local-participant trade evidence, never automatic allocation.
local API = WBC_Collector
-- SavedVariables can replace the table created while the addon files were loading.
local function evidenceSettings()
  local settings = WoWButlerCollectorSettings
  settings.evidence = settings.evidence or {}
  return settings
end
local contexts, seen, trade, tradeSerial = {}, {}, nil, 0
local function safe(fn, ...)
  if type(fn) ~= 'function' then return nil end
  local ok, value = pcall(fn, ...)
  if ok then return value end
end
local function clean(link) return type(link)=='string' and link:match('(|Hitem:[^|]+|h.-|h)') or nil end
local function emit(row)
  local settings = evidenceSettings()
  row.collectorSourceID, row.sequence = API.NextEventIdentity()
  row.sourceEventID = 'e'..row.sequence
  row.captureVersion=API.version
  row.timestamp=time()
  table.insert(settings.evidence,row)
  while #settings.evidence>500 do table.remove(settings.evidence,1); settings.evidenceTrimmed=true end
  if API.RefreshUI then API.RefreshUI() end
end
local function captureHistory(encounterID)
  if evidenceSettings().enabled==false then return end
  local ctx=contexts[encounterID]
  if not ctx or not C_LootHistory then return end
  local drops=safe(C_LootHistory.GetSortedDropsForEncounter,encounterID)
  if type(drops)~='table' then return end
  for _,d in ipairs(drops) do
    local link=clean(d.itemHyperlink)
    local info=(C_Item and C_Item.GetItemInfo) or GetItemInfo
    local name,_,quality,_,_,_,_,_,_,_,_,classID
    if link and type(info)=='function' then name,_,quality,_,_,_,_,_,_,_,_,classID=info(link) end
    if name and quality and quality>=4 and (classID==2 or classID==4 or classID==15) then
      local _,binding=API.LinkedDetails(link)
      local winner=d.winner and d.winner.playerName or ''
      local wn,ws=API.PlayerIdentity(winner,false)
      local observation='drop:'..encounterID..':'..ctx.at..':'..tostring(d.lootListID)
      local signature=link..'|'..(binding or 'unknown')..'|'..winner
      if seen[observation]~=signature then
        seen[observation]=signature
        emit({kind='drop',observationKey=observation,encounterID=encounterID,encounterAt=ctx.at,
          instanceName=ctx.instance,difficultyID=ctx.difficulty,bossName=ctx.name,
          itemName=name,itemID=tonumber(link:match('|Hitem:(%d+)')),itemLink=link,quantity=1,
          bindingStatus=binding or 'unknown',winnerName=wn,winnerServer=ws})
      end
    end
  end
end
function API.MatchEncounter(link,name,server,instance,difficulty)
  local latest={}
  for _,e in ipairs(evidenceSettings().evidence) do if e.kind=='drop' then latest[e.observationKey]=e end end
  local candidates={}
  for _,e in pairs(latest) do
    if e.itemLink==link and e.bindingStatus=='ordinary' and e.instanceName==instance and e.difficultyID==difficulty
      and time()>=e.encounterAt and time()-e.encounterAt<=86400
      and (not e.winnerName or e.winnerName=='' or e.winnerName==name and (not e.winnerServer or e.winnerServer=='' or e.winnerServer==server)) then
      local used=0
      for _,r in ipairs(WoWButlerCollectorDB) do
        if r.itemLink==link and r.encounterID==e.encounterID and r.encounterAt==e.encounterAt then used=used+(r.quantity or 1) end
      end
      local total=0
      for _,d in pairs(latest) do if d.encounterID==e.encounterID and d.encounterAt==e.encounterAt and d.itemLink==link then total=total+1 end end
      if used<total then candidates[e.encounterID..':'..e.encounterAt]=e end
    end
  end
  local result,count=nil,0
  for _,e in pairs(candidates) do result=e;count=count+1 end
  if count==1 then return result end
  if count>1 then return false end
end
function API.ExportPayload(rows)
  local evidence,latest={},{}
  for _,e in ipairs(evidenceSettings().evidence) do latest[e.observationKey]=e end
  for _,e in pairs(latest) do table.insert(evidence,e) end
  table.sort(evidence,function(a,b)return a.sequence<b.sequence end)
  return {schemaVersion=2,rows=rows,evidence=evidence}
end
function API.ClearEvidence()
  local settings = evidenceSettings()
  wipe(settings.evidence);wipe(contexts);wipe(seen);trade=nil;settings.evidenceTrimmed=nil
end
local function identity(unit)
  local name,realm=UnitFullName(unit)
  return name,realm and realm~='' and realm or safe(GetRealmName)
end
local function relevant(link)
  for i=#WoWButlerCollectorDB,1,-1 do
    local r=WoWButlerCollectorDB[i]
    if r.itemLink==link and time()-(r.timestamp or 0)<=86400 and r.bindingStatus=='ordinary' then return r end
  end
end
local function snapshot()
  if not trade or trade.closed then return end
  local items={}
  for side=1,2 do
    local getLink=side==1 and GetTradePlayerItemLink or GetTradeTargetItemLink
    local getInfo=side==1 and GetTradePlayerItemInfo or GetTradeTargetItemInfo
    for slot=1,6 do -- Enchant/service slot is not transferred equipment.
      local link=clean(safe(getLink,slot));local source=link and relevant(link)
      if source and type(getInfo)=='function' then
        local name,_,quantity=getInfo(slot)
        if name then table.insert(items,{kind='trade',observationKey='trade:'..trade.id..':'..side..':'..slot,
          itemName=name,itemID=source.itemID,itemLink=link,quantity=quantity or 1,bindingStatus='ordinary',
          instanceName=source.instanceName,difficultyID=source.difficultyID,bossName=source.bossName,
          encounterID=source.encounterID,encounterAt=source.encounterAt,
          fromName=side==1 and trade.own or trade.other,fromServer=side==1 and trade.ownServer or trade.otherServer,
          toName=side==1 and trade.other or trade.own,toServer=side==1 and trade.otherServer or trade.ownServer}) end
      end
    end
  end
  trade.items=items
end
local function finish(outcome)
  if not trade then return end
  for _,r in ipairs(trade.items or {}) do r.outcome=outcome;emit(r) end
  trade=nil
end
local f=CreateFrame('Frame')
for _,ev in ipairs({'ENCOUNTER_END','LOOT_HISTORY_UPDATE_ENCOUNTER','LOOT_HISTORY_UPDATE_DROP','TRADE_SHOW','TRADE_PLAYER_ITEM_CHANGED','TRADE_TARGET_ITEM_CHANGED','TRADE_ACCEPT_UPDATE','TRADE_REQUEST_CANCEL','TRADE_CLOSED','UI_INFO_MESSAGE'}) do
  pcall(f.RegisterEvent,f,ev)
end
local function onEvent(_,ev,...)
  local settings = evidenceSettings()
  if settings.enabled==false then trade=nil;return end
  if ev=='ENCOUNTER_END' then
    local id,name,difficulty,_,success=...
    local instance,kind,actual=GetInstanceInfo()
    if success==1 and kind=='raid' and API.RaidDifficulty[actual] then
      contexts[id]={at=time(),name=name,instance=instance,difficulty=actual}
      captureHistory(id)
      if C_Timer then for _,delay in ipairs({1,3,10}) do C_Timer.After(delay,function()captureHistory(id)end) end end
    end
  elseif ev=='LOOT_HISTORY_UPDATE_ENCOUNTER' or ev=='LOOT_HISTORY_UPDATE_DROP' then captureHistory(...)
  elseif ev=='TRADE_SHOW' then
    finish('unknown');settings.tradeSequence=(tonumber(settings.tradeSequence) or 0)+1;tradeSerial=settings.tradeSequence
    local own,ownServer=identity('player');local other,otherServer=identity('NPC')
    if own and other then trade={id=tostring(time())..':'..tradeSerial,own=own,ownServer=ownServer,other=other,otherServer=otherServer};snapshot() end
  elseif ev=='TRADE_PLAYER_ITEM_CHANGED' or ev=='TRADE_TARGET_ITEM_CHANGED' then if trade then trade.accepted=false end;snapshot()
  elseif ev=='TRADE_ACCEPT_UPDATE' then
    snapshot();local a,b=...;if trade then trade.accepted=a==1 and b==1 end
  elseif ev=='TRADE_REQUEST_CANCEL' then finish('cancelled')
  elseif ev=='TRADE_CLOSED' then
    local current=trade
    if current then current.closed=true;current.closedAt=time() end
    if C_Timer then C_Timer.After(3,function()if trade==current then finish('unknown') end end) end
  elseif ev=='UI_INFO_MESSAGE' then
    local _,message=...
    if trade and trade.accepted and message==ERR_TRADE_COMPLETE and (not trade.closedAt or time()-trade.closedAt<=3) then finish('success') end
  end
end
local lastWarning=0
f:SetScript('OnEvent',function(...)
  local ok=pcall(onEvent,...)
  if not ok and time()-lastWarning>60 then
    lastWarning=time()
    print('WoWButler: 本次掉落/交易观察接口不可用，已有拾取保留；请在网站人工核对。')
  end
end)
