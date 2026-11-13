"""Actual core + ui Lua 5.1, with simulated WoW controls/events.
Verifies action wiring/state/JSON, NOT game rendering, clipboard or raid coverage.
No game/SavedVariables writes. Optional --output evidence-path.
"""
import argparse
import importlib.util
import json
from pathlib import Path
from lupa.lua51 import LuaRuntime

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('collector_runtime', ROOT / 'scripts/verify-collector-runtime.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
UI = (ROOT / 'addon/WoWButlerCollector/ui.lua').read_text(encoding='utf-8-sig')
LOCALE = (ROOT / 'addon/WoWButlerCollector/locales/zhCN.lua').read_text(encoding='utf-8-sig')
CONTROLS = r'''
widgets={}; UISpecialFrames={}; registrations=0; combat=false
local Methods={}
function Methods:SetScript(event,fn) self.scripts[event]=fn; if event=='OnEvent' then handler=fn end end
function Methods:RegisterEvent() end
function Methods:SetSize(w,h) self.width=w; self.height=h end
function Methods:SetWidth(w) self.width=w; if self.scripts.OnSizeChanged then self.scripts.OnSizeChanged(self,w,self.height) end end
function Methods:SetHeight(h) self.height=h end
function Methods:GetHeight() return self.height end
function Methods:GetWidth() return self.width end
function Methods:SetPoint(...) self.point={...} end
function Methods:ClearAllPoints() end
function Methods:SetText(text) self.text=text end
function Methods:SetTextColor(...) self.color={...} end
function Methods:SetChecked(value) self.checked=not not value end
function Methods:GetChecked() return self.checked end
function Methods:SetEnabled(value) self.enabled=value end
function Methods:Show() self.visible=true; if self.scripts.OnShow then self.scripts.OnShow(self) end end
function Methods:Hide() self.visible=false; if self.scripts.OnHide then self.scripts.OnHide(self) end end
function Methods:SetShown(value) if value then self:Show() else self:Hide() end end
function Methods:SetFocus() self.focused=true end
function Methods:ClearFocus() self.focused=false end
function Methods:HighlightText() assert(self.focused,'must focus before selecting'); self.highlighted=true end
function Methods:SetScrollChild(child) self.child=child end
function Methods:GetTop() return nil end -- no geometry simulation: do not claim layout validation
function Methods:GetBottom() return nil end
function Methods:GetCenter() return self.x or 100,self.y or 100 end
function Methods:StartMoving() self.moving=true end
function Methods:StopMovingOrSizing() self.moving=false end
function Methods:CreateFontString() return widget('FontString',nil,self) end
for _,name in ipairs({'SetJustifyH','SetFrameStrata','SetClampedToScreen','SetMovable','EnableMouse',
 'RegisterForDrag','SetNormalTexture','SetHighlightTexture','SetPushedTexture','SetMultiLine',
 'SetFontObject','SetAutoFocus','SetMaxLetters','SetOwner','AddLine','SetHitRectInsets'}) do Methods[name]=function() end end
function widget(kind,name,parent,template)
 local f=setmetatable({kind=kind,name=name,parent=parent,template=template,scripts={},visible=true,
  enabled=true,width=560,height=660},{__index=Methods})
 table.insert(widgets,f); if name then _G[name]=f end
 if template=='UICheckButtonTemplate' then
  local text=widget('FontString',name..'Text',f)
  if not legacyText then f.Text=text end
 end
 if template=='BasicFrameTemplateWithInset' then f.TitleBg=widget('Texture',nil,f) end
 return f
end
CreateFrame=widget
UIParent=widget('Frame'); Minimap=widget('Frame'); GameTooltip=widget('Tooltip')
function InCombatLockdown() return combat end
Settings={
 RegisterCanvasLayoutCategory=function(panel,name) registeredPanel=panel; return {GetID=function() return 7 end} end,
 RegisterAddOnCategory=function(category) registrations=registrations+1 end,
 OpenToCategory=function(id) openedCategory=id; registeredPanel:Show() end
}
function click(button)
 if not button.enabled then return end
 if button.kind=='CheckButton' then button.checked=not button.checked end
 button.scripts.OnClick(button)
end
function hasText(part)
 for _,f in ipairs(widgets) do if f.text and string.find(f.text,part,1,true) then return true end end
 return false
end
function StaticPopup_Show(key) popup=key end
'''

def runtime(preset=''):
    lua = LuaRuntime(unpack_returned_tuples=True)
    lua.execute(base.STUB)
    lua.execute(CONTROLS)
    lua.execute(preset)
    lua.execute(LOCALE)
    lua.execute(base.CORE)
    lua.execute(UI)
    lua.execute("handler(nil,'PLAYER_LOGIN')")
    return lua

def check(script, preset=''):
    runtime(preset).execute(script)

def json_export():
    lua = runtime()
    lua.execute('loot()')
    text = '测试"物品\\换行\n制表\t回车\r零\x00'
    lua.globals().WoWButlerCollectorDB[1].itemName = text
    lua.execute('click(WoWButlerCollectorExportButton)')
    data = json.loads(lua.globals().WoWButlerExportFrame.editBox.text)
    assert data[0]['itemName'] == text
    assert data[0]['playerName'] == 'Player' and data[0]['ilvl'] == 200
    assert data[0]['difficulty'] == '史诗' and data[0]['difficultyID'] == 16

def variant_batch_export():
    # Synthetic five-event scenario follows the screenshot's shape, not its missing raw links.
    # Levels below are fixture values, not asserted real-game levels.
    lua = runtime()
    lua.execute(r'''
    C_Item.IsItemBindToAccountUntilEquip=function(link) return string.find(link,':999',1,true)~=nil end
    C_Item.GetDetailedItemLevelInfo=function() return 219 end
    C_TooltipInfo={GetHyperlink=function(link)
      local value=string.find(link,':999',1,true) and 305 or 318
      return {lines={{type=31,leftText='物品等级 '..value}}}
    end}
    local function emit(player,id,bonus)
      handler(nil,'CHAT_MSG_LOOT',player..' receives loot: |cnIQ4:|Hitem:'..id..':'..bonus..'|h[Fixture Item]|h|r.')
    end
    emit('Extra',268236,999)
    emit('RecipientA',268237,1)
    emit('RecipientB',268238,1)
    emit('RecipientB',268236,1)
    emit('RecipientA',268235,1)
    click(WoWButlerCollectorExportButton)
    ''')
    rows = json.loads(lua.globals().WoWButlerExportFrame.editBox.text)
    assert len(rows) == 4 and all(r['ilvl'] == 318 for r in rows)
    assert all(r['playerName'] != 'Extra' and r['itemLink'] for r in rows)
    assert sum(r['itemID'] == 268236 for r in rows) == 1

CASES = {
    'login registers one settings panel and default-enabled launcher': lambda: check("assert(registrations==1); assert(WoWButlerCollectorEnabled.checked); assert(WoWButlerCollectorMinimapButton.visible); WBC_Collector.InitUI(); assert(registrations==1)"),
    'minimap and slash open the same registered page': lambda: check("click(WoWButlerCollectorMinimapButton); assert(openedCategory==7); openedCategory=nil; SlashCmdList.WBC(''); assert(openedCategory==7)"),
    'empty state blocks button and legacy export': lambda: check("assert(not WoWButlerCollectorExportButton.enabled); click(WoWButlerCollectorExportButton); SlashCmdList.WBC('export'); assert(not WoWButlerExportFrame); assert(hasText('暂无记录'))"),
    'pause blocks new events and resume captures again': lambda: check("click(WoWButlerCollectorEnabled); loot(); assert(#WoWButlerCollectorDB==0); assert(hasText('已暂停采集')); click(WoWButlerCollectorEnabled); loot(); assert(#WoWButlerCollectorDB==1 and WoWButlerCollectorExportButton.enabled)"),
    'saved paused/hidden settings and history survive initialization': lambda: check("assert(not WoWButlerCollectorEnabled.checked); assert(not WoWButlerCollectorMinimapButton.visible); loot(); assert(#WoWButlerCollectorDB==1); assert(WoWButlerCollectorDB[1].itemName=='History')", "WoWButlerCollectorSettings={enabled=false,hideMinimap=true}; WoWButlerCollectorDB={{itemName='History'}}"),
    'pending visible; disabling capture does not discard accepted event': lambda: check("ready=false; loot(); assert(hasText('等待物品信息 1 条')); assert(not WoWButlerCollectorExportButton.enabled); click(WoWButlerCollectorEnabled); ready=true; flush(); assert(#WoWButlerCollectorDB==1 and WBC_Collector.GetState().pending==0); assert(WoWButlerCollectorExportButton.enabled)"),
    'failed item leaves persistent panel diagnostic': lambda: check("ready=false; loot(); for i=1,11 do flush() end; assert(WBC_Collector.GetState().failed==1); assert(hasText('信息加载失败')); assert(hasText('本次登录失败 1 条')); assert(WBC_Collector.GetState().pending==0)"),
    'zone status refreshes without re-opening': lambda: check("kind='none'; handler(nil,'ZONE_CHANGED_NEW_AREA'); assert(hasText('进入普通/英雄/史诗团本后自动记录')); kind='raid'; handler(nil,'ZONE_CHANGED_NEW_AREA'); assert(hasText('史诗难度 · 等待团本拾取'))"),
    'LFR and unsupported status are not shown as ready': lambda: check("for _,id in ipairs({7,17}) do difficultyID=id; handler(nil,'ZONE_CHANGED_NEW_AREA'); assert(hasText('当前为随机团队 · 不采集、不计数')); assert(not hasText('难度 · 等待团本拾取')); loot(); assert(hasText('已记录 0 条')) end; difficultyID=33; handler(nil,'ZONE_CHANGED_NEW_AREA'); assert(hasText('当前团本难度不在采集范围')); click(WoWButlerCollectorEnabled); assert(hasText('已暂停采集'))"),
    'normal heroic mythic status and recent record have correct labels': lambda: check("for i,id in ipairs({14,15,16}) do difficultyID=id; handler(nil,'ZONE_CHANGED_NEW_AREA'); local name=({'普通','英雄','史诗'})[i]; assert(hasText(name..'难度 · 等待团本拾取')); loot(); assert(hasText('Test Item · '..name..'难度')) end"),
    'export real JSON handles control characters': json_export,
    'five variant events export four ordinary drops with linked levels': variant_batch_export,
    'export reuses frame and supports reselect/escape': lambda: check("loot(); click(WoWButlerCollectorExportButton); local f=WoWButlerExportFrame; assert(f.visible and f.editBox.highlighted); f.editBox:ClearFocus(); click(f.selectButton); assert(f.editBox.focused); f.editBox.scripts.OnEscapePressed(); assert(not f.visible and #WoWButlerCollectorDB==1); click(WoWButlerCollectorExportButton); assert(WoWButlerExportFrame==f and #UISpecialFrames==1)"),
    'clear is confirmation-only and preserves configuration': lambda: check("loot(); click(WoWButlerCollectorExportButton); click(WoWButlerCollectorClearButton); assert(popup=='WBC_CLEAR_CONFIRM' and #WoWButlerCollectorDB==1); popup=nil; assert(#WoWButlerCollectorDB==1); click(WoWButlerCollectorClearButton); StaticPopupDialogs[popup].OnAccept(); assert(#WoWButlerCollectorDB==0 and WoWButlerCollectorSettings.enabled); assert(not WoWButlerExportFrame.visible and not WoWButlerCollectorExportButton.enabled)"),
    'clear cancels queued item and refreshes disabled states': lambda: check("ready=false; loot(); click(WoWButlerCollectorClearButton); StaticPopupDialogs[popup].OnAccept(); ready=true; flush(); assert(#WoWButlerCollectorDB==0 and WBC_Collector.GetState().pending==0); assert(not WoWButlerCollectorClearButton.enabled)"),
    'hidden launcher retains settings entry and can be restored': lambda: check("click(WoWButlerCollectorMinimapToggle); assert(not WoWButlerCollectorMinimapButton.visible); Settings.OpenToCategory(7); assert(registeredPanel.visible); click(WoWButlerCollectorMinimapToggle); assert(WoWButlerCollectorMinimapButton.visible)"),
    'combat blocks settings opening but not capture': lambda: check("combat=true; click(WoWButlerCollectorMinimapButton); assert(openedCategory==nil); loot(); assert(#WoWButlerCollectorDB==1); combat=false; click(WoWButlerCollectorMinimapButton); assert(openedCategory==7)"),
    'missing settings API degrades to legacy commands': lambda: check("loot(); SlashCmdList.WBC('export'); assert(WoWButlerExportFrame.visible and #WoWButlerCollectorDB==1)", 'Settings=nil'),
    'legacy checkbutton label global works': lambda: check("assert(WoWButlerCollectorEnabledText.text==WBC_LOCALE.ENABLE_LABEL)", 'legacyText=true'),
    'launcher drag retains bounded placement': lambda: check("local b=WoWButlerCollectorMinimapButton; b.x=500; b.y=-500; b.scripts.OnDragStart(b); b.scripts.OnDragStop(b); assert(not b.moving); assert(WoWButlerCollectorSettings.minimapX==120 and WoWButlerCollectorSettings.minimapY==-120)"),
    'legacy rows remain visible but cannot be exported': lambda: check("assert(WBC_Collector.GetState().count==1 and WBC_Collector.GetState().reviewCount==1); assert(not WoWButlerCollectorExportButton.enabled); assert(hasText('可导出 0 条')); SlashCmdList.WBC('export'); assert(not WoWButlerExportFrame); assert(WoWButlerCollectorDB[1].ilvl==219)", "WoWButlerCollectorDB={{itemName='Old',ilvl=219}}"),
    'mixed old and new exports verified rows only': lambda: check("loot(); assert(WBC_Collector.GetState().count==2 and WBC_Collector.GetState().exportable==1); click(WoWButlerCollectorExportButton); assert(not string.find(WoWButlerExportFrame.editBox.text,'Old',1,true)); assert(#WoWButlerCollectorDB==2)", "WoWButlerCollectorDB={{itemName='Old',ilvl=219}}"),
    'missing actual level is visible and blocks export': lambda: check("C_Item.GetDetailedItemLevelInfo=function() return nil end; loot(); for i=1,11 do flush() end; assert(hasText('实际装等未确认')); assert(hasText('待核对 1 条')); assert(not WoWButlerCollectorExportButton.enabled)"),
    'export includes capacity-sized dataset without truncating JSON': lambda: check("for i=1,2000 do WoWButlerCollectorDB[i]={playerName='Player',itemName='Test',itemID=i,timestamp=i,captureVersion='1.0.4',itemLink='|Hitem:123:0|h[Test]|h',ilvl=318,bindingStatus='ordinary'} end; WBC_Collector.RefreshUI(); click(WoWButlerCollectorExportButton); assert(#WoWButlerExportFrame.editBox.text>100000)")
}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output')
    args = parser.parse_args()
    results = []
    for name, fn in CASES.items():
        try:
            fn()
            results.append({'name': name, 'ok': True})
        except Exception as e:
            results.append({'name': name, 'ok': False, 'error': str(e)})
    report = {'environment': 'Lua 5.1; simulated game controls/events, no visual or live game validation',
              'version': '1.0.5', 'results': results}
    if args.output:
        Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0 if all(r['ok'] for r in results) else 1)
