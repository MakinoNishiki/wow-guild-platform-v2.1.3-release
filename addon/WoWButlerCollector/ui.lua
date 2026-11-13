-- REQ-189：原生设置页与小地图入口。数据与动作只走 core.lua 的窄接口。
local API, L = WBC_Collector, WBC_LOCALE
local panel, category, launcher
local enabled, minimap, status, counts, latest, errors, exportButton, clearButton
local textBlocks = {}

local function label(parent, text, font, anchor, y)
  local fs = parent:CreateFontString(nil, "OVERLAY", font or "GameFontHighlight")
  fs:SetPoint("TOPLEFT", anchor or parent, anchor and "BOTTOMLEFT" or "TOPLEFT", 0, y or -16)
  fs:SetWidth(parent:GetWidth())
  fs:SetJustifyH("LEFT")
  fs:SetText(text)
  table.insert(textBlocks, fs)
  return fs
end

local function positionLauncher()
  launcher:ClearAllPoints()
  launcher:SetPoint("CENTER", Minimap, "CENTER",
    WoWButlerCollectorSettings.minimapX or -85, WoWButlerCollectorSettings.minimapY or -45)
end

function API.RefreshUI()
  if not panel then return end
  local s = API.GetState()
  enabled:SetChecked(s.enabled)
  minimap:SetChecked(not WoWButlerCollectorSettings.hideMinimap)
  local stateText
  if not s.enabled then stateText = L.STATUS_PAUSED
  elseif s.difficulty then stateText = string.format(L.STATUS_READY, s.difficulty)
  elseif s.isLfr then stateText = L.STATUS_LFR
  elseif s.inRaid then stateText = L.STATUS_UNSUPPORTED
  else stateText = L.STATUS_OUTSIDE end
  status:SetText(stateText)
  if not s.enabled then status:SetTextColor(1, 0.75, 0.25)
  elseif s.difficulty then status:SetTextColor(0.3, 1, 0.4)
  else status:SetTextColor(0.8, 0.85, 0.9) end
  counts:SetText(string.format(L.PANEL_COUNTS, s.count, s.pending, s.failed)
    .. "\n" .. string.format(L.PANEL_REVIEW_COUNTS, s.exportable, s.reviewCount))
  local row = s.latest
  -- 纯文本显示，不把原始物品/玩家名当成可点击的富文本。
  local function plain(value) return tostring(value or ""):gsub("|", "||") end
  latest:SetText(row and string.format(L.PANEL_LATEST, plain(row.playerName), plain(row.itemName), plain(row.difficulty or "未记录难度")) or L.PANEL_EMPTY)
  local warning = s.lastError or L.PANEL_HEALTHY
  if s.reviewCount > 0 then warning = warning .. "\n" .. L.PANEL_REVIEW_WARNING end
  if s.count >= 1000 then warning = warning .. "\n" .. string.format(L.PANEL_CAPACITY, s.max) end
  errors:SetText(warning)
  errors:SetTextColor((s.failed > 0 or s.reviewCount > 0) and 1 or 0.85, s.failed > 0 and 0.35 or 0.85, s.failed > 0 and 0.3 or 0.85)
  exportButton:SetEnabled(s.exportable > 0 and s.pending == 0)
  exportButton:SetText(s.pending > 0 and L.EXPORT_WAIT or L.EXPORT_BUTTON)
  clearButton:SetEnabled(s.count > 0 or s.pending > 0)
  if launcher then launcher:SetShown(not WoWButlerCollectorSettings.hideMinimap) end
end

function API.OpenPanel()
  if InCombatLockdown and InCombatLockdown() then
    print(L.PANEL_COMBAT)
    return
  end
  if category and Settings and Settings.OpenToCategory then
    Settings.OpenToCategory(category:GetID())
  else
    print(L.PANEL_UNAVAILABLE)
  end
end

function API.InitUI()
  if panel then return end
  if not (Settings and Settings.RegisterCanvasLayoutCategory and Settings.RegisterAddOnCategory) then
    print(L.PANEL_UNAVAILABLE)
    return
  end
  panel = CreateFrame("Frame", "WoWButlerCollectorPanel", UIParent)
  panel:Hide()
  -- 原生设置窗口尺寸由客户端管理；内容独立滚动，避免 UI 缩放后底部控件丢失。
  local scroll = CreateFrame("ScrollFrame", nil, panel, "UIPanelScrollFrameTemplate")
  scroll:SetPoint("TOPLEFT", 24, -24)
  scroll:SetPoint("BOTTOMRIGHT", -32, 16)
  local content = CreateFrame("Frame", nil, scroll)
  content:SetSize(560, 660)
  content:SetScript("OnSizeChanged", function(self, width)
    for _, fs in ipairs(textBlocks) do fs:SetWidth(width) end
  end)
  scroll:SetScrollChild(content)
  scroll:SetScript("OnSizeChanged", function(self, width) content:SetWidth(math.max(260, width - 8)) end)

  local title = label(content, L.PANEL_TITLE .. "  " .. API.version, "GameFontNormalLarge", nil, 0)
  local intro = label(content, L.PANEL_INTRO, nil, title, -12)
  enabled = CreateFrame("CheckButton", "WoWButlerCollectorEnabled", content, "UICheckButtonTemplate")
  enabled:SetSize(28, 28)
  enabled:SetHitRectInsets(0, -280, 0, 0)
  enabled:SetPoint("TOPLEFT", intro, "BOTTOMLEFT", -4, -16)
  local enabledText = enabled.Text or _G.WoWButlerCollectorEnabledText
  if not enabledText then
    enabledText = enabled:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
    enabledText:SetPoint("LEFT", enabled, "RIGHT", 4, 0)
  end
  enabledText:SetText(L.ENABLE_LABEL)
  enabled:SetScript("OnClick", function(self) API.SetEnabled(self:GetChecked()) end)
  -- 独立锚点保持所有正文在同一左对齐线上。
  local stateAnchor = CreateFrame("Frame", nil, content)
  stateAnchor:SetSize(1, 1)
  stateAnchor:SetPoint("TOPLEFT", enabled, "BOTTOMLEFT", 4, -8)
  status = label(content, "", "GameFontNormalLarge", stateAnchor, -8)
  counts = label(content, "", nil, status, -12)
  latest = label(content, "", nil, counts, -16)
  errors = label(content, "", nil, latest, -16)

  exportButton = CreateFrame("Button", "WoWButlerCollectorExportButton", content, "UIPanelButtonTemplate")
  exportButton:SetSize(190, 28)
  exportButton:SetPoint("TOPLEFT", errors, "BOTTOMLEFT", 0, -20)
  exportButton:SetScript("OnClick", API.Export)
  local steps = label(content, L.PANEL_STEPS, nil, exportButton, -16)
  local boundary = label(content, L.PANEL_BOUNDARY, nil, steps, -16)
  minimap = CreateFrame("CheckButton", "WoWButlerCollectorMinimapToggle", content, "UICheckButtonTemplate")
  minimap:SetSize(28, 28)
  minimap:SetHitRectInsets(0, -170, 0, 0)
  minimap:SetPoint("TOPLEFT", boundary, "BOTTOMLEFT", -4, -16)
  local minimapText = minimap.Text or _G.WoWButlerCollectorMinimapToggleText
  if not minimapText then
    minimapText = minimap:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
    minimapText:SetPoint("LEFT", minimap, "RIGHT", 4, 0)
  end
  minimapText:SetText(L.MINIMAP_LABEL)
  minimap:SetScript("OnClick", function(self)
    WoWButlerCollectorSettings.hideMinimap = not self:GetChecked()
    API.RefreshUI()
  end)
  clearButton = CreateFrame("Button", "WoWButlerCollectorClearButton", content, "UIPanelButtonTemplate")
  clearButton:SetSize(190, 28)
  clearButton:SetPoint("TOPLEFT", minimap, "BOTTOMLEFT", 4, -24)
  clearButton:SetText(L.CLEAR_BUTTON)
  clearButton:SetScript("OnClick", API.RequestClear)
  local tail = label(content, L.CLEAR_NOTE, "GameFontHighlightSmall", clearButton, -8)
  -- 长文案/错误换行后按真实底边扩展滚动内容，保底660。
  local layoutElapsed = 0
  content:SetScript("OnUpdate", function(self, elapsed)
    layoutElapsed = layoutElapsed + elapsed
    if layoutElapsed < 0.2 then return end
    layoutElapsed = 0
    if self:GetTop() and tail:GetBottom() then
      local height = math.max(660, self:GetTop() - tail:GetBottom() + 24)
      if math.abs(self:GetHeight() - height) > 1 then self:SetHeight(height) end
    end
  end)
  panel:SetScript("OnShow", API.RefreshUI)
  category = Settings.RegisterCanvasLayoutCategory(panel, L.PANEL_TITLE)
  Settings.RegisterAddOnCategory(category)

  if Minimap then
    launcher = CreateFrame("Button", "WoWButlerCollectorMinimapButton", Minimap)
    launcher:SetSize(32, 32)
    launcher:SetFrameStrata("MEDIUM")
    launcher:SetNormalTexture("Interface\\Icons\\INV_Misc_Bag_10")
    launcher:SetHighlightTexture("Interface\\Buttons\\ButtonHilight-Square", "ADD")
    launcher:SetPushedTexture("Interface\\Buttons\\UI-Quickslot-Depress")
    launcher:SetMovable(true)
    launcher:SetClampedToScreen(true)
    launcher:RegisterForDrag("LeftButton")
    positionLauncher()
    launcher:SetScript("OnClick", API.OpenPanel)
    launcher:SetScript("OnDragStart", function(self) self:StartMoving() end)
    launcher:SetScript("OnDragStop", function(self)
      self:StopMovingOrSizing()
      local x, y = self:GetCenter()
      local mx, my = Minimap:GetCenter()
      if x and mx then
        WoWButlerCollectorSettings.minimapX = math.max(-120, math.min(120, x - mx))
        WoWButlerCollectorSettings.minimapY = math.max(-120, math.min(120, y - my))
      end
      positionLauncher()
    end)
    launcher:SetScript("OnEnter", function(self)
      GameTooltip:SetOwner(self, "ANCHOR_LEFT")
      GameTooltip:AddLine(L.PANEL_TITLE)
      GameTooltip:AddLine(L.MINIMAP_HINT, 1, 1, 1, true)
      GameTooltip:Show()
    end)
    launcher:SetScript("OnLeave", function() GameTooltip:Hide() end)
  end
  API.RefreshUI()
end
