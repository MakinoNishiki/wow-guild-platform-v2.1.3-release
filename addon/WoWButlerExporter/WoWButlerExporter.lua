-- ============================================================
-- 魔兽管家数据导出器 WoWButler Data Exporter（任务书 #26 WP1）
-- 零外部依赖；只读副本手册（EJ）与角色信息；不访问网络、不碰账号数据
-- 导出目标：SavedVariables 全局表 WJDCDump（/reload 或退出游戏后写盘）
-- 命令：/wjdc all | raid | mplus | smoke | me | probe [团本序号]
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
-- （1.0.8：跳号——追平登记口径，无功能变更）
-- （1.0.9：四合一（任务书 #46）——
--   ①特效补采 REQ-088：装备/使用特效行匹配前剥离行首色码 |cffRRGGBB、
--     图标码 |T..|t 与前导空白（纯文本行零影响），修复色码个体级致 effect 空串；
--   ②毒咒采集 REQ-110③：tooltip 品质行下绿字独立行，剥色码后整行恰为「毒咒」
--     → loot 行新增 venomcurse 字段（无毒咒为空串）；
--   ③iconID REQ-092：GetItemInfo 第 10 返回值（icon fileID）透传，loot 行新增 iconID；
--   ④probe 物品级诊断加 tooltip 全行原样 dump（| 转义 || 可见化），供真机定论 REQ-088 取证；
--   原字段格式零改动、向后兼容）
-- （1.0.10：1.0.9 真机终验报障修复（S2 实采 360 件：觉醒恐牙胸甲 id=271876 tooltip 有毒咒
--   绿字行+特效行但导出双空；全库 venomcurse 360 空、饰品特效 43 件仅 1 非空）——
--   ①parseItemDetail 双通道：SetItemByID 通道扫不到特效/毒咒行时，回退 GetItemInfo
--     物品链接的 SetHyperlink 通道补扫（EJ 预览态/实物 tooltip 来源差异嫌疑面的对冲，
--     属性行两通道同值经 addUnique 去重、首条命中守卫语义不变）；
--   ②probe 物品级诊断加双通道对照 dump（A=SetItemByID / B=SetHyperlink）+ NumLines
--     完整性计数，一次取证定位漏读通道；
--   ③启动语版本硬编码「1.0.7」修正为跟随 ADDON_VERSION）
-- （1.0.11：S2 录库前修复包（BUG-082 + REQ-088 终案 + REQ-089 基数订正配套）——
--   ①冷缓存 P1（BUG-082）：物品数据未加载完即解析曾致 31 件武器/护甲主属性缺损、
--     3 件毒锻兑换物 type 被污染错标武器；现为占位检测（IsItemDataCachedByID）+
--     延迟重试队列（Item:ContinueOnItemLoad 回调驱动）——未就绪件绝不解析，
--     导出链路异步串行化（逐实例→逐 BOSS→逐件），并加导出并发锁；
--   ②特效/毒咒挂难度上下文通道（REQ-088 终案）：两轮 probe 实锤 A(SetItemByID)/
--     B(裸链接 SetHyperlink) 平面通道对 EJ 预览态装备天生缺特效/毒咒绿字段落
--     （271876 双通道 13 行全 dump 均无）；改为与 primary_tiers 同源——按档构建
--     链接读 tooltip，特效按档读、毒咒读史诗档判有；导出 effect 存史诗档文本；
--   ③GetItemStats 全局函数 12.1 已移除，API 通道改 C_Item.GetItemStats 优先；
--   ④probe 加悬停链接直读模式 /wjdc probe hover（GameTooltip:GetItem() 实物链接，
--     带完整 bonusID/难度上下文，以后同类取证的标准件，实现见 Probe 文件）；
--   原字段格式零改动、向后兼容）
-- （1.0.12：两跑实测定损修复包（BUG-083~087 + REQ-118/119，顾问终审签字放行）——
--   ①跨跑态污染根治（BUG-086）：难度档段首无条件捕获、finalize 必经还原，
--     origDiff=nil（手册从未设档）归位普通档 14——1.0.11 会残留 mythic(16) 致次跑
--     枚举口径漂移（run2 实证：团本无该档表全灭 0 件、大米两本错档 +29）；
--     异步回调链 pcall 包裹防链死锁死、段 abort 标记防 pcall 失效段双推进、
--     EJ 选中态设置补 pcall；
--   ②熔断器整删（BUG-083）：撤 softFail>=2 全段熔断与整 BOSS tiered=0 判死，
--     软失败不再 stripTiers 销毁已采部分档值，每 BOSS 独立切档（读回校验即天然闸）；
--   ③分案报错（BUG-084）：逐件逐路径计数 noLink/idMismatch/scanFail/noValue/notReady，
--     「稀疏表缺 link」「跨难度列表错位（守卫拦截）」「0 档值」三条路径分开报；
--   ④四档重扫纳入就绪门（BUG-085）：BOSS 收尾 collectTiers 前全件预热+逐件确认
--     （whenAllReady），未就绪件单列不计入「无静态值」；
--   ⑤伪实例过滤（BUG-087）：「史诗钥石地下城」名表过滤 + 全 BOSS 零掉落空实例跳过；
--   ⑥大米段难度档通道（REQ-118）：普通(1)/英雄(2)/史诗(23)/时空漫游(24) 逐档探测回读
--     （因本而异，读回不过跳过该档），特效读史诗档，M+ 免毒咒判定；
--     档通道不可用回退 1.0.9 平面单档路径（原样保留）；
--   ⑦导出可观测性（REQ-119）：每实例枚举前钉难度+回读+难度档快照打印、
--     逐实例计数与上次（WJDCLastCounts）不一致黄字对比、导出开始/结束 run 标记+时间戳；
--   原字段格式零改动、向后兼容）
-- （1.0.13：断链零留存（D7/BUG-088，P1）——旧设计「全部跑完才一次性提交 WJDCDump」，
--   链死/中途中断后 /reload 存档表仍是上跑旧数据，整跑采集全丢（三场 1.0.12 跑断实证）；
--   现改按段提交：每实例收尾即落 WJDCDump 并置 meta.partial=true 断链标记，
--   全部段落跑完终局提交才清标记；段级中断（pcall 捕获）终局保留 partial=true。
--   WJDCLastCounts 仍只在完整跑终局覆写（断链跑不污染计数对比基线）；
--   导出字段格式零改动、向后兼容）
-- （1.0.14：链死与跨难度错位根治（D1/BUG-089 + D4/BUG-090，P0 关键路径）——
--   ①C stack overflow 根治（D1）：whenItemReady 就绪路径由同步直调改下一帧执行——
--     旧同步路径让 stepItem/whenAllReady/finishBoss/nextBoss 全链递归深度随暖缓存件数
--     线性增长（每件 2 层 pcall C 边界），暖缓存跑百件量级即爆栈；帧延迟后每回调独立浅栈。
--     回调报错文案诚实化（fn 内含续推，抛错=链实际已断，旧「链继续」系谎报，段提交已保底）；
--   ②跨难度错位根治（D4）：collectTiers 序号对齐改 itemID 建索引（切档后枚举当档全列表
--     建 map，档间列表顺序/件数差异天然免疫）；切档读回通过后延迟一帧再扫（EJ 掉落列表
--     重建无同步保证，立即读撞未重建窗口——二跑带档率跨跑波动实证）；陈旧列表校验
--     （枚举采样 encounterID，整表残留上一选中态则帧延迟重试至多 2 次，仍陈旧记 staleSkip
--     跳该档续扫，不跨 BOSS 蔓延）；stats 口径 absent 取代 idMismatch；collectTiers 异步化
--     （签名带 done 回调，扫描异常记 stats.hardFail）；li 序号字段随索引化退役（三处清除）；
--   导出字段格式零改动、向后兼容）
-- （1.0.15：D6 收尾哨兵（BUG-089 谎报案收尾半，顾问终审裁定施工）——看门狗计时器：
--   超 300s 无心跳判链死，红字提示一次并重武装（不刷屏）；心跳打点全部落在 doExport
--   自有回调闭包（段完成/1.0.13 onProgress 落表/段中断），数据路径零触碰；不做超时
--   自解锁（/reload 兜底，步骤卡 Q1 已写明）；正常跑完解除哨兵。
--   导出字段格式零改动、向后兼容）
-- （1.0.16：真机核毕打回三修（E1/E2/E3）——
--   ①E1/BUG-091（P0）：EJ 拾取过滤器污染枚举——GetLootInfoByIndex 继承手册职业/专精/槽位
--     过滤态（真机实证锁甲职业态：团本 144→65、大米 225→93、皮/板/盾全灭、世界 boss 反增）；
--     枚举全路径前置显式重置（段首+每实例+档扫每档三处兜底），段首捕获原态 finalize 还原，
--     过滤器状态快照并入难度快照黄字（REQ-119 仪器化）；
--   ②E2/REQ-088 残差（P1）：毒咒读取点不再只锚史诗档——任一档 tooltip 出现即采（安全超集，
--     防史诗档被跳档/陈旧拦截漏采），精确匹配容许行尾空白；史诗档未命中时含「毒咒」字样的
--     疑似行原样黄字 dump 取证；
--   ③E3/BUG-092（P2）：属性行解析先剥行首码再匹配（258045 黎明之刃的战刃 primary 空嫌疑位）；
--   导出字段格式零改动、向后兼容）
-- （1.0.17：1.0.16 真机翻车打回修 v2（F1-F5，调研前置首件——依据见修改报告「调研依据」节）——
--   ①F1（P0）：槽位清零置毒根治——Blizzard 官方文档实证 Enum.ItemSlotFilterType 字面 0=Head、
--     NoFilter=15（1.0.16 传 0 反把过滤器钉成头部槽，幸存 11 件全头部即此）；且职业/专精过滤
--     不属 C_EncounterJournal 命名空间（1.0.16 清零空转从未生效），属 EJ_ 全系——清零改
--     EJ_ResetLootFilter() + C_EncounterJournal.ResetSlotFilter()（NoFilter 枚举常量兜底，禁字面 0）；
--   ②F2（P0）：过滤器/选中态变更后列表异步重建——官方检测 EJ_IsLootListOutOfDate() 轮询
--     false 再枚举（60 帧封顶超时红字后放行），阶段一枚举链全量异步化过钩子，
--     collectTiers 切档后同改挂钩（run A 全 0/run B 24s 后稀疏 11 = 打在重建窗实证）；
--   ③F3（P1）：枚举 0 件不再静默判空——过重建钩子重试封顶 3 次，仍 0 红字记空掉落占位；
--     空实例判定同改红字；
--   ④F4（P1）：LastCounts 计数质量门——任一实例 0 件即标记 abnormal 红字，拒覆写基线；
--     断链跑（meta.partial）同不覆写（1.0.13「只在完整跑终局覆写」注释口径落实为 gating）；
--   ⑤F5/BUG-093（P2）：同 BOSS 掉落枚举按 itemID 去重（250459×4 重复实证）；
--   ⑥冒烟模式 /wjdc smoke（顾问增补②）：只扫至暗之夜第 1 BOSS+毒牙祭坛第 1 BOSS，
--     落表+黄字全要素与全量同链（过滤器快照/档值/effect/毒咒疑似行 dump），3 分钟出数；
--     冒烟跑 meta.smoke=true 标记、跳过计数对比/质量门/LastCounts 基线覆写（防污染全量基线）；
--   导出字段格式零改动、向后兼容）
-- （1.0.18：1.0.17 双跑打回三修（BUG-094/095/096 + 毒咒跨行形态，调研依据见修改报告）——
--   ①BUG-094（P0，大米全灭+至暗/潮缚失踪）：钉档合法性闸——EJ_SetDifficulty 前必过
--     EJ_IsValidInstanceDifficulty（暴雪自家 EJ 界面同型守卫，Mainline :768/:3564），
--     锚档改候选探测（团本 14/15/16/17、大米 23/2/1/24，首选无效按序改钉首个合法档，
--     单难度本不再被硬钉空档）；判空跳过实例除红字外加记 dump.skipped_instances（禁无痕失踪）；
--   ②BUG-095（P0）：gating 第四条=期望实例集完整性校验（团本 3/大米 8 常量口径+基线具名
--     比对+0 件点名），缺任一或任一 0 件即拒写 WJDCLastCounts 红字点名，判空跳过不计入覆写集；
--   ③BUG-096（P1）：EJ_SelectEncounter 读回校验（不符重试 3 次仍不符记 selectFail 空占位，
--     禁错配上一 BOSS 掉落列表）+ 单 BOSS 件数 sanity 守卫（>40 判异常红字+abnormal，不静默）+
--     G1 查证（IsLootListOutOfDate 恒 true 嫌疑）：重建钩子即时/等待/超时三段计数、段尾黄字汇总；
--   ④毒咒两行形态（真机取证「史诗↵毒咒」）：跨行匹配——上一行以「史诗」收尾且本行剥码后
--     为「毒咒」即判有，单行精确判定保留（判据不变）；
--   导出字段新增（向后兼容）：skipped_instances（仅非空产出）/boss.selectFail/meta.abnormal）
-- （1.0.19：1.0.18 冒烟红打回修（BUG-096 转码——弃读回、改显式枚举；顾问调研三信源在案：
--   暴雪官方 APIDocumentation 生成件 encounterIndex luaIndex Nilable（省略才回落「当前选中
--   encounter」）、暴雪自用实证 Mainline :226 传字面 2、wiki 同载）——
--   ①备案现形特征逐字应验：鲁阿夏尔/拉维 selectFail 三连=无参 EJ_GetEncounterInfo() 读回
--     此路不通；读回校验链整体拆除（encounterSelectReadback/重试 3 次/selectFail 空占位全撤），
--     EJ_SelectEncounter 选中态退出掉落归因关键路径（阶段二仍保留选中调用——collectTiers
--     档扫单参取数语义依赖之，BUG-094 链不动）；
--   ②阶段一枚举改显式传参 GetLootInfoByIndex(li, bossIndex)（bossIndex=该 BOSS 在当前选中
--     实例内的序号，与 EJ_GetEncounterInfoByIndex 同源），nil 终止（MayReturnNothing 明载）
--     + 硬上限 60；单 BOSS>40 sanity 守卫保留作纯保险；
--   ③冒烟文案按实态修正（实例在册已钉档，实态=采集 0 件判空跳过，非「未在手册枚举到」）；
--   导出字段：boss.selectFail 随读回链整撤退役（1.0.18 新增字段未出过正式数据，零消费方））
-- ============================================================
local ADDON_VERSION = "1.0.19"

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
           time = date("%Y-%m-%d %H:%M:%S"), type = kind,
           run_id = date("%Y%m%d-%H%M%S") }  -- REQ-119③：run 标记，日志与导出文件可互查
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
-- d.effect 字段缺省时跳过特效提取（四档重扫只取数值，不重复解析特效）；
-- d.venomcurse 同理（1.0.9）：缺省跳过毒咒标签识别
-- 行首码剥离（1.0.9，REQ-088）：WoW 文本行内联码——开色码 |cffRRGGBB / 收色码 |r /
-- 图标码 |T..|t；特效行首带码时 ^ 锚定失配致 effect 空串（同版本 3 件采到证明色码个体级）。
-- 匹配前剥离行首码与前导空白、行尾收色码，对纯文本行零影响
local function stripLineCodes(t)
  local prev
  repeat
    prev = t
    t = t:gsub("^%s+", "")                  -- 前导空白
    t = t:gsub("^|[Tt][^|]*|[tT]", "")      -- 行首图标码 |T..|t
    t = t:gsub("^|[Cc]%x+", "")             -- 行首开色码 |cffRRGGBB
    t = t:gsub("^|[Rr]", "")                -- 行首收色码 |r
  until t == prev
  t = t:gsub("%s*|[Rr]%s*$", "")            -- 行尾收色码 |r
  return t
end

local function parseStatLines(lines, d)
  local prevPlain
  for _, t in ipairs(lines) do
    -- 1.0.16（E3/BUG-092）：属性行同样可能带行首码/行尾收色码，先剥再匹配（纯文本行零影响）——
    -- 258045 黎明之刃的战刃 primary 空（81 件唯一真缺损）的代码面嫌疑位：行首码致 ^%+ 锚定失配
    local plain = stripLineCodes(t)
    local num, stat = plain:match("^%+([%d,]+)%s*(.+)$")
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
    if d.effect == "" or d.venomcurse == "" then
      if d.effect == "" then
        d.effect = plain:match("^(装备：.+)$") or plain:match("^(使用：.+)$") or ""
      end
      -- 毒咒标签行（1.0.9，REQ-110③）：品质行下绿字独立行，剥色码后整行恰为「毒咒」
      -- （1.0.16 E2/REQ-088 残差：容许行尾空白——真机全场零命中，精确等值疑似被尾随空白/残留码击穿）
      -- 1.0.18（毒咒两行形态，1.0.17 双跑真机取证「史诗↵毒咒」）：跨行匹配——上一行剥码后
      -- 以「史诗」收尾且与本行拼接恰成「史诗…毒咒」即判有（单行精确判定保留，判据不变）
      if d.venomcurse == "" then
        if plain:match("^毒咒%s*$") then
          d.venomcurse = "毒咒"
        elseif prevPlain and (prevPlain .. plain):match("史诗%s*毒咒%s*$") then
          d.venomcurse = "毒咒"
        end
      end
    end
    prevPlain = plain
  end
end

local function parseItemDetail(itemID)
  local d = { primary = {}, secondary = {}, effect = "", venomcurse = "", primary_values = {}, secondary_values = {} }
  local lines = scanLines(itemID)
  if lines then parseStatLines(lines, d) end
  -- 双通道回退（1.0.10，REQ-088 真机报障）：SetItemByID 通道对 EJ 预览态装备可能缺特效/毒咒行
  -- （冒险手册预览与实物 tooltip 来源差异嫌疑面），回退 GetItemInfo 物品链接的 SetHyperlink 通道补扫；
  -- 属性行两通道同值经 addUnique 去重，effect/venomcurse 首条命中守卫语义不变
  if d.effect == "" or d.venomcurse == "" then
    local _, link = GetItemInfo(itemID)
    if link then
      local l2 = scanLink(link)
      if l2 then parseStatLines(l2, d) end
    end
  end
  return d
end

-- ---------- 属性数值 API 通道（任务书 #28 WP1，优先于 tooltip 解析） ----------
-- 返回 { [属性常量 key] = 数值 }，key 经 _G 解析为本地化短名后与 PRIMARY/SECONDARY 对照；
-- API 不存在 / 返回空表 → 返回 nil，由调用方回退 tooltip 解析
-- （1.0.11：12.1 起全局 GetItemStats 已移除（两轮 probe 实锤「函数不存在」），
--   正主 = C_Item.GetItemStats，优先使用；旧全局保留作回退）
local function statValuesFromApi(itemID)
  local fn = (C_Item and C_Item.GetItemStats) or GetItemStats
  if type(fn) ~= "function" then return nil end
  local ok, stats = pcall(fn, "item:" .. itemID)
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
-- 1.0.7 增 scanLink/parseStatLines 供四档实证诊断；1.0.9 增 stripLineCodes 供 REQ-088 取证对照）
WJDCShared.scanLines = scanLines
WJDCShared.scanLink = scanLink
WJDCShared.parseItemDetail = parseItemDetail
WJDCShared.parseStatLines = parseStatLines
WJDCShared.statValuesFromApi = statValuesFromApi
WJDCShared.stripLineCodes = stripLineCodes

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

-- REQ-118（1.0.12）：大米段难度档候选——普通(1)/英雄(2)/史诗(23)/时空漫游(24)；
-- 因本而异（有的没普通、有的没时空漫游），逐档切档读回探测，读回不通过即跳过该档（不中断余档）
local DUNGEON_TIERS = {
  { key = "normal",      id = 1  },  -- 普通（地下城）
  { key = "heroic",      id = 2  },  -- 英雄（地下城）
  { key = "mythic",      id = 23 },  -- 史诗（地下城；特效读取档）
  { key = "timewalking", id = 24 },  -- 时空漫游
}

-- BUG-087（1.0.12）：伪实例名表（S2 两跑实证「史诗钥石地下城」= 史诗钥石/词缀 2 空 BOSS 混入导出）
local PSEUDO_INSTANCE_NAMES = { ["史诗钥石地下城"] = true }

local function tierChannelAvailable()
  return type(EJ_SetDifficulty) == "function" and type(EJ_GetDifficulty) == "function"
     and C_EncounterJournal and type(C_EncounterJournal.GetLootInfoByIndex) == "function"
end

-- BUG-094（1.0.18）：钉档合法性闸——暴雪自家 EJ 界面在 EJ_SetDifficulty 前必过
-- EJ_IsValidInstanceDifficulty（Mainline Blizzard_EncounterJournal.lua:768/:3564，顾问调研锚点，
-- Gethe/wow-ui-source live@12.1.0 逐字复核）；无该档实例被硬钉后掉落列表枚举全空
-- （BUG-086 run2「团本无该档表全灭」同型；1.0.17 双跑至暗之夜/潮缚 0 件判空、大米段全灭）。
-- 返回 nil = API 缺位/读不出（不明，调用方走旧行为）；true/false = 明确判定
local function isDifficultyValidForInstance(diffID)
  if type(EJ_IsValidInstanceDifficulty) ~= "function" then return nil end
  local ok, valid = pcall(EJ_IsValidInstanceDifficulty, diffID)
  if not ok then return nil end
  return valid and true or false
end

-- 锚档候选（首选在前）：单难度本（世界 BOSS 型等）首选档无效时按序改钉首个合法档；
-- 全部钉不上返回 nil，调用方按当前档枚举并明示（禁静默）
local RAID_ANCHOR_CANDIDATES    = { 14, 15, 16, 17 }  -- 首选普通
local DUNGEON_ANCHOR_CANDIDATES = { 23, 2, 1, 24 }    -- 首选史诗

local function pinInstanceDifficulty(candidates)
  for _, d in ipairs(candidates) do
    if isDifficultyValidForInstance(d) ~= false then
      local okSet = pcall(EJ_SetDifficulty, d)
      local okGet, cur = pcall(EJ_GetDifficulty)
      if okSet and okGet and cur == d then return d end
    end
  end
  return nil
end

-- BUG-096②（1.0.18）：单 BOSS 件数 sanity 上限——历史最大单 BOSS 18 件
-- （1.0.6 全量 dump 逐 BOSS 校准），超 40 = 列表异常（疑串 BOSS/串档/重复枚举），判异常不静默
local BOSS_ITEM_SANITY_MAX = 40

-- BUG-095（1.0.18）：期望实例集口径（随赛季更替由运营/顾问更新；伪实例不计入大米数）
local EXPECTED_INSTANCE_COUNT = { ["团本"] = 3, ["大秘境"] = 8 }

-- BUG-091 v2（1.0.17，F1 调研前置落实——依据见完工报文「调研依据」节）：
-- Blizzard 官方 API 文档实证：Enum.ItemSlotFilterType 0=Head…14=Other、15=NoFilter——
-- 1.0.16 传字面 0 反把槽位过滤器钉成「头部」（幸存 11 件全头部槽即此）；
-- 且 C_EncounterJournal 命名空间根本无 Set/GetClassFilter/SetSpecFilter——1.0.16 的
-- 职业/专精清零因 type 守卫静默空转，从未生效。职业/专精过滤属 EJ_ 全系：
-- EJ_SetLootFilter(classID, specID)/EJ_GetLootFilter()→classID,specID/EJ_ResetLootFilter()=清全部。
local function captureLootFilter()
  local snap = {}
  if type(EJ_GetLootFilter) == "function" then
    local ok, c, s = pcall(EJ_GetLootFilter)
    if ok then snap.class, snap.spec = c, s end
  end
  local CJ = C_EncounterJournal
  if CJ and type(CJ.GetSlotFilter) == "function" then
    local ok, v = pcall(CJ.GetSlotFilter)
    if ok then snap.slot = v end  -- getter 返回真实枚举值（无过滤=NoFilter=15），可安全回设
  end
  return snap
end

local function resetLootFilter()
  if type(EJ_ResetLootFilter) == "function" then
    pcall(EJ_ResetLootFilter)  -- 清全部过滤器（职业/专精，wiki 12.0.0 在册 "Clear all filters"）
  elseif type(EJ_SetLootFilter) == "function" then
    pcall(EJ_SetLootFilter, 0, 0)  -- 回退：getter 往返口径 0,0=无过滤
  end
  local CJ = C_EncounterJournal
  if CJ then
    if type(CJ.ResetSlotFilter) == "function" then
      pcall(CJ.ResetSlotFilter)  -- F1：槽位专用重置优先（Blizzard 官方文档在册）
    elseif type(CJ.SetSlotFilter) == "function"
       and Enum and Enum.ItemSlotFilterType and Enum.ItemSlotFilterType.NoFilter ~= nil then
      pcall(CJ.SetSlotFilter, Enum.ItemSlotFilterType.NoFilter)  -- 枚举常量兜底，禁字面 0（0=Head 实证）
    end
  end
end

local function restoreLootFilter(snap)
  if not snap then return end
  if snap.class ~= nil and type(EJ_SetLootFilter) == "function" then
    pcall(EJ_SetLootFilter, snap.class, snap.spec or 0)
  end
  local CJ = C_EncounterJournal
  if CJ and type(CJ.SetSlotFilter) == "function" then
    if snap.slot ~= nil then
      pcall(CJ.SetSlotFilter, snap.slot)
    elseif type(CJ.ResetSlotFilter) == "function" then
      pcall(CJ.ResetSlotFilter)
    end
  end
end

local function lootFilterSnapshotText()
  local s = captureLootFilter()
  return string.format("class=%s/spec=%s/slot=%s", tostring(s.class), tostring(s.spec), tostring(s.slot))
end

-- F2（1.0.17）：过滤器/选中态变更后列表异步重建——官方检测 EJ_IsLootListOutOfDate()
-- （wiki 在册："returns whether the loot list is out of date in relation to any filters"），
-- 轮询 false（每帧，60 帧封顶超时红字后放行）再枚举；函数缺位回退让一帧（D4 口径）。
-- run A 全 0 / run B（24s 后）稀疏 11 = 枚举打在重建窗实证（与 BUG-090 切档让帧同型教训）。
-- 就绪后同样下一帧执行（D1 浅栈纪律：枚举链全程零同步递归，杜绝长链 C stack overflow 隐患）。
-- G1 查证（1.0.18，BUG-096③）：钩子健康度三段计数——即时就绪/等待后就绪/超时放行，
-- 按段归零、段尾黄字汇总；超时红字每段最多 3 次（防恒 true 时刷屏），
-- 超时占比≈100% 即坐实「IsLootListOutOfDate 恒 true」嫌疑（FrameXML 无从判定，只能真机取证——
-- 暴雪唯一调用点在 EJ_LOOT_DATA_RECIEVED 事件内，Mainline :1005，顾问调研在案）
local lootFreshStats = { fresh = 0, waited = 0, timeout = 0, reported = 0 }
local function resetLootFreshStats() lootFreshStats = { fresh = 0, waited = 0, timeout = 0, reported = 0 } end
local function lootFreshStatsText()
  local t = lootFreshStats
  return string.format("即时就绪 %d / 等待后就绪 %d / 超时放行 %d", t.fresh, t.waited, t.timeout)
end

local function whenLootListFresh(fn, attempt)
  attempt = attempt or 1
  if type(EJ_IsLootListOutOfDate) == "function" then
    local ok, out = pcall(EJ_IsLootListOutOfDate)
    if ok and not out then
      if attempt == 1 then lootFreshStats.fresh = lootFreshStats.fresh + 1
      else lootFreshStats.waited = lootFreshStats.waited + 1 end
      C_Timer.After(0, fn)
      return
    end
    if attempt >= 60 then
      lootFreshStats.timeout = lootFreshStats.timeout + 1
      if lootFreshStats.reported < 3 then
        lootFreshStats.reported = lootFreshStats.reported + 1
        err("副本手册掉落列表重建等待超 60 帧仍未就绪——按当前状态继续枚举（件数可能不全，请截图反馈顾问侧）")
      end
      C_Timer.After(0, fn)
      return
    end
    C_Timer.After(0, function() whenLootListFresh(fn, attempt + 1) end)
  else
    C_Timer.After(0, fn)
  end
end

local function stripTiers(loot)
  for _, it in ipairs(loot) do it.primary_tiers = nil it.secondary_tiers = nil end
end

-- 逐 BOSS 难度档重扫（loot 行需带 li = GetLootInfoByIndex 序号，切档后按同序号重取该档 link）。
-- 1.0.11（REQ-088 终案）：特效/毒咒同挂本难度上下文通道——平面通道（SetItemByID / 裸链接
-- SetHyperlink）对 EJ 预览态装备天生缺特效/毒咒绿字段落（两轮 probe 实锤：271876 双通道
-- 13 行全 dump 均无），只有带难度上下文的当档 link 才给全 tooltip。
-- 1.0.12（BUG-083/084，顾问终审放行）：
--   · 整 BOSS tiered=0 判死删除、软失败不再由调用方 stripTiers 销毁——已采部分档值保留；
--   · 返回值改逐件逐路径计数 stats（noLink 稀疏表缺 link / idMismatch 跨难度列表错位守卫拦截 /
--     scanFail SetHyperlink 失败 / noValue 扫到 tooltip 无静态值 / scanned 成功扫描件次），
--     分案文案由调用方出（1.0.14 起 idMismatch 口径由 absent/staleSkip 取代，见下）；
--   · 档位表参数化（团本 RAID_TIERS / 大米 DUNGEON_TIERS，REQ-118），opts.effectTier=特效读取档、
--     opts.venomcurse=true 才扫毒咒（M+ 免毒咒判定）、opts.skipBadTier=true 时单档读回失败
--     跳过该档继续余档（大米档因本而异），否则记 switchFail 并终止本 BOSS 余档（保留已采）。
-- 特效读 opts.effectTier 档、毒咒读史诗档判有；导出 effect 存特效档文本（非空才覆盖基础通道值）。
-- 1.0.14（D4/BUG-090 跨难度错位根治 + D1 异步化）：
--   · 序号对齐改 itemID 建索引——切档后枚举当档全列表建 map(itemID→info)，档间列表
--     顺序/件数差异天然免疫（旧 li 同序号重取对错位只能守卫检测、不能纠正）；
--   · 切档读回通过后延迟一帧再枚举——EJ 掉落列表重建无同步保证，立即读会撞未重建窗口
--     （二跑暖缓存执行更快更易撞，鲁阿夏尔 1/7→3/3、索姆贝兰 1/7→4/4 跨跑带档率波动实证）；
--   · 陈旧列表校验：枚举时采样 encounterID（12.x 稀疏表自带字段），整表均属其他 BOSS =
--     上一选中态残留 → 帧延迟重试至多 2 次，仍陈旧记 staleSkip 跳该档续扫（不跨 BOSS 蔓延）；
--   · stats 口径：absent（当档列表无此件）取代 idMismatch（序号错位概念随索引化消失）；
--   · 签名改异步 collectTiers(loot, tiers, opts, done)——扫描异常不再抛给调用方 pcall，
--     记 stats.hardFail 交调用方按硬失败处置；opts.encounterID=当前 BOSS 的 encounterID
--     （陈旧校验键，调用方逐 BOSS 注入）。
local function collectTiers(loot, tiers, opts, done)
  opts = opts or {}
  local stats = { tiered = 0, scanned = 0, noLink = 0, absent = 0, scanFail = 0, noValue = 0,
                  switchFail = nil, tierSkip = nil, staleSkip = nil, hardFail = nil }
  local ti = 0
  local nextTier, scanTier
  local function finish()
    for _, it in ipairs(loot) do
      if it.primary_tiers or it.secondary_tiers then stats.tiered = stats.tiered + 1 end
    end
    done(stats)
  end
  -- 单档扫描体（只抛给 scanTier 的 pcall）：帧后枚举当档列表 → 建索引 → 逐件扫
  local function scanTierBody(tier, attempt)
    local map, total, staleHit = {}, 0, 0
    local li = 1
    while li <= 500 do  -- 档扫重取防呆：GetLootInfoByIndex 取到 nil 为止，500 封顶（单参语义依赖当前选中 BOSS，与 1.0.19 阶段一显式传参路径无关）
      local okQ, info = pcall(C_EncounterJournal.GetLootInfoByIndex, li)
      if not okQ or type(info) ~= "table" or not info.itemID then break end
      total = total + 1
      if opts.encounterID and info.encounterID and info.encounterID ~= opts.encounterID then
        staleHit = staleHit + 1  -- 条目属于其他 BOSS = 上一选中态/旧难度列表残留
      end
      map[info.itemID] = info
      li = li + 1
    end
    if total > 0 and staleHit == total then
      -- 整表陈旧：帧延迟重试至多 2 次，仍陈旧跳该档续扫（单档粒度，不跨 BOSS）
      if attempt < 3 then
        C_Timer.After(0, function() scanTier(tier, attempt + 1) end)
      else
        stats.staleSkip = (stats.staleSkip and (stats.staleSkip .. ",") or "") .. tier.key
        nextTier()
      end
      return
    end
    for _, it in ipairs(loot) do
      local info = map[it.id]
      if not info then
        stats.absent = stats.absent + 1          -- 当档列表无此件（该档不掉/列表数据缺）
      elseif not info.link then
        stats.noLink = stats.noLink + 1          -- 12.x 稀疏表缺 link 字段（数据源缺字段）
      else
        local lines = scanLink(info.link)
        if not lines then
          stats.scanFail = stats.scanFail + 1
        else
          stats.scanned = stats.scanned + 1
          local d = { primary = {}, secondary = {}, primary_values = {}, secondary_values = {},
                      effect = "", venomcurse = "" }
          parseStatLines(lines, d)
          -- 只记有数值的档：无静态属性的品类（纯特效饰品/杂项）天然空档，计 noValue 单列
          if next(d.primary_values) then
            it.primary_tiers = it.primary_tiers or {}
            it.primary_tiers[tier.key] = d.primary_values
          end
          if next(d.secondary_values) then
            it.secondary_tiers = it.secondary_tiers or {}
            it.secondary_tiers[tier.key] = d.secondary_values
          end
          if not next(d.primary_values) and not next(d.secondary_values) then
            stats.noValue = stats.noValue + 1
          end
          if tier.key == opts.effectTier then
            if d.effect ~= "" then it.effect = d.effect end                       -- 导出 effect 存特效档文本
          end
          -- 1.0.16（E2/REQ-088 残差）：毒咒读取点不再只锚史诗档——任一档 tooltip 出现即采
          -- （毒咒行=史诗难度独有终案在案，则其他档天然无此行，全档读为安全超集，
          --   防史诗档被跳档/陈旧拦截时漏采）；史诗档未命中时做疑似行取证（剥码后含「毒咒」
          -- 字样但非精确行的原行黄字 dump，| 转义 ||）——真机全场零命中的定位靠它一锤定音
          if opts.venomcurse then
            if d.venomcurse ~= "" then
              it.venomcurse = d.venomcurse
            elseif tier.key == opts.effectTier then
              for _, raw in ipairs(lines) do
                local p = stripLineCodes(raw)
                if p:find("毒咒") and not p:match("^毒咒%s*$") then
                  msg(string.format("毒咒疑似行未精确命中（物品 %s，%s 档）：%s",
                    tostring(it.id), tier.key, (raw:gsub("|", "||"))))
                end
              end
            end
          end
        end
      end
    end
    nextTier()
  end
  scanTier = function(tier, attempt)
    local okS, eS = pcall(scanTierBody, tier, attempt)
    if not okS then stats.hardFail = tostring(eS) finish() end  -- 硬失败：保留已采计数交调用方处置
  end
  nextTier = function()
    ti = ti + 1
    local tier = tiers[ti]
    if not tier then finish() return end
    -- BUG-094（1.0.18）：切档合法性闸——该档对本实例无效时不发 EJ_SetDifficulty
    -- （暴雪 :768/:3564 同型守卫），视同读回不符走既有 tierSkip/switchFail 处置
    local invalid = isDifficultyValidForInstance(tier.id) == false
    local okSet, okGet, cur = true, true, nil
    if not invalid then
      okSet = pcall(EJ_SetDifficulty, tier.id)
      okGet, cur = pcall(EJ_GetDifficulty)
    end
    if invalid or not okSet or not okGet or cur ~= tier.id then
      if opts.skipBadTier then
        stats.tierSkip = (stats.tierSkip and (stats.tierSkip .. ",") or "") .. tier.key  -- 大米档因本而异，跳过续扫
        nextTier()
      else
        stats.switchFail = tier.key .. "/" .. tostring(tier.id)
        finish()  -- 团本切档失败=通道异常，终止本 BOSS 余档但保留已采（BUG-083：不再整 BOSS 判死）
      end
      return
    end
    resetLootFilter()  -- BUG-091（E1）：档扫枚举前清过滤器（切档可能重置过滤态，逐档兜底）
    -- D4+F2（1.0.17）：切档+清过滤器后等掉落列表重建完成再扫（IsLootListOutOfDate 轮询，缺位回退让一帧）
    whenLootListFresh(function() scanTier(tier, 1) end)
  end
  nextTier()
end

-- ---------- 副本手册遍历（团本 / 大秘境共用） ----------
-- 掉落枚举：1.0.19（BUG-096 转码）起显式双参 GetLootInfoByIndex(i, encounterIndex)——
--   官方 APIDocumentation：encounterIndex luaIndex Nilable，省略才回落「当前选中 encounter」；
--   暴雪自用 Mainline :226 传字面 2；wiki 同载（任务书 #26-fix4「实测双参全 nil」旧论作废——
--   彼时实态=选中态未生效致回落路径取空，非双参本身无效）。
-- 12.x 返回稀疏表（仅 itemID/encounterID/稀有度标记），老函数为多元返回值
-- （name, icon, slot, armorType, itemID, ...），归一化为只取 itemID——其余字段一律走 GetItemInfo
local function getLootItemID(i, encounterIndex)
  local fn = (C_EncounterJournal and C_EncounterJournal.GetLootInfoByIndex) or EJ_GetLootInfoByIndex
  if type(fn) ~= "function" then return nil end
  local ok, a, _, _, _, e5 = pcall(fn, i, encounterIndex)  -- e5 = 老 tuple 第 5 位 itemID
  if not ok or a == nil then return nil end
  if type(a) == "table" then return a.itemID end
  return e5
end

-- BUG-096① 读回校验链 1.0.19 整撤：无参 EJ_GetEncounterInfo() 读回真机三连翻车（鲁阿夏尔/拉维
-- selectFail，1.0.18 冒烟实证），此路不通；掉落归因改显式 encounterIndex 传参（见 getLootItemID），
-- EJ_SelectEncounter 选中态退出归因关键路径

-- ---------- 冷缓存就绪门（1.0.11，BUG-082，S2 录库前必修） ----------
-- 1.0.9 S2 实采定损：物品数据未加载完即解析——GetItemInfo/tooltip 在冷缓存下返回
-- 占位/错位数据（31 件武器/护甲主属性缺损、3 件毒锻兑换物 type 被污染错标武器）。
-- 就绪判据 = C_Item.IsItemDataCachedByID（API 缺位时回退 GetItemInfo 名称判存）；
-- 未就绪件入延迟重试队列，由 Item:ContinueOnItemLoad 回调驱动补解析，绝不拿占位数据解析。
local function isItemDataReady(itemID)
  if C_Item and type(C_Item.IsItemDataCachedByID) == "function" then
    local ok, cached = pcall(C_Item.IsItemDataCachedByID, itemID)
    if ok then return cached and true or false end
  end
  return GetItemInfo(itemID) ~= nil
end

-- 就绪即执行 fn()；未就绪先 RequestLoad 再挂 ContinueOnItemLoad
-- （数据已缓存时回调也会于下一帧触发，语义安全）；Item mixin 不可用时
-- 回退 0.5s 延时重查后照旧执行（此时由 getItemBasics 校验兜底记 failed，禁静默）
-- 1.0.12（BUG-086）：回调体 pcall 包裹——回调内抛错红字具名报告，
-- 导出并发锁不因链死永卡（锁唯一释放点依赖链推进，见 doExport）
-- 1.0.14（D1/BUG-089 C stack overflow 根治）：就绪路径由同步直调改下一帧执行——
--   旧同步路径让 stepItem/whenAllReady step/finishBoss/nextBoss 全链递归深度随暖缓存
--   件数线性增长（每件 2 层 pcall C 边界），暖缓存跑（二跑起）百件量级即触 C stack overflow；
--   冷缓存一跑因 ContinueOnItemLoad 异步断链反而保命——帧延迟后每回调独立浅栈，递归源根治。
--   报错文案同步诚实化：fn 内含续推 stepItem，抛错=链实际已断（旧文案「链继续」为谎报），
--   已扫数据由 1.0.13 段提交保底。
local function whenItemReady(itemID, fn)
  local function guarded()
    local okG, eG = pcall(fn)
    if not okG then err("物品 " .. tostring(itemID) .. " 处理回调报错（" .. tostring(eG) .. "）——导出链中断（已扫数据已按段落表不丢，1.0.13），请 /reload 后重跑并截图反馈顾问侧（1.0.14）") end
  end
  if isItemDataReady(itemID) then C_Timer.After(0, guarded) return end  -- D1：就绪也走下一帧，断同步递归链
  if C_Item and C_Item.RequestLoadItemDataByID then pcall(C_Item.RequestLoadItemDataByID, itemID) end
  if Item and type(Item.CreateFromItemID) == "function" then
    local ok, item = pcall(function() return Item:CreateFromItemID(itemID) end)
    if ok and item and type(item.ContinueOnItemLoad) == "function" then
      local fired = false
      item:ContinueOnItemLoad(function()
        if fired then return end
        fired = true
        guarded()
      end)
      return
    end
  end
  C_Timer.After(0.5, guarded)
end

-- 1.0.12（BUG-085）：四档重扫就绪门——collectTiers 前对 loot 全件预热+逐件确认就绪；
-- 0.5s 回退路径仍不就绪的件计 notReady 单列（不混入「无静态值」noValue）
local function whenAllReady(loot, fn)
  local notReady = 0
  local i = 0
  local function step()
    i = i + 1
    local it = loot[i]
    if not it then fn(notReady) return end
    if C_Item and C_Item.RequestLoadItemDataByID then pcall(C_Item.RequestLoadItemDataByID, it.id) end
    whenItemReady(it.id, function()
      if not isItemDataReady(it.id) then notReady = notReady + 1 end
      step()
    end)
  end
  step()
end

-- 物品详情通道（任务书 #26-fix4）：名称/部位/类型/装等一律走 GetItemInfo（装等=第 4 返回值）；
-- GetDetailedItemLevelInfo / C_EncounterJournal.GetLootInfo 已死，废弃；
-- 未缓存先 RequestLoadItemDataByID 重试一次，仍拿不到或装等非法 → 返回 nil 走 failed（禁 ilvl=44 类错位值）；
-- 1.0.9（REQ-092）：第 10 返回值 = icon fileID，透传 iconID 字段
local function getItemBasics(itemID)
  local name, _, _, ilvl, _, _, subType, _, equipLoc, iconID = GetItemInfo(itemID)
  if not name and C_Item and C_Item.RequestLoadItemDataByID then
    pcall(C_Item.RequestLoadItemDataByID, itemID)
    name, _, _, ilvl, _, _, subType, _, equipLoc, iconID = GetItemInfo(itemID)
  end
  if not name or type(ilvl) ~= "number" or ilvl <= 0 then return nil end
  return { name = name, ilvl = ilvl, type = subType or "", slot = (equipLoc and _G[equipLoc]) or "",
           iconID = iconID }
end

-- 1.0.11（BUG-082）：导出链路异步串行化——阶段一同步纯 EJ 枚举（实例/BOSS/掉落 itemID，
-- 不依赖物品缓存），阶段二逐 BOSS 逐件经 whenItemReady 就绪门后解析（冷缓存件入
-- ContinueOnItemLoad 重试队列），全链单线推进故 EJ 全局状态（选本/选 BOSS/难度档）无交错。
-- 完成后 done(out, report) 回调（1.0.18 起第二回参=段级台账/异常标记）；任一件/任一 BOSS 出错只记 failed 或降级，不拖垮整体（旧 guard 语义延续）。
-- 1.0.12（BUG-083~087 + REQ-118/119，顾问终审签字放行，最小手术）：
--   ①难度档段首无条件捕获（含不切档的大米段）、finalize 必经还原，origDiff=nil 归位普通档 14
--     ——1.0.11 洞：nil 不还原致 mythic(16) 残留跨跑污染（run2 团本 0 件/大米错档 +29 实证）；
--   ②阶段一每实例枚举前显式钉难度+回读校验+快照打印（REQ-119①），团本锚 normal(14)、大米锚史诗(23)；
--   ③伪实例名表过滤+全 BOSS 零掉落空实例跳过（BUG-087 双判）；
--   ④四档重扫纳入就绪门（whenAllReady，BUG-085）；
--   ⑤熔断器整删+整 BOSS 判死撤除，逐件逐路径计数分案报错（BUG-083/084）；
--   ⑥abortFlag 段中止标记：段级 pcall 捕获后旧链回调醒来即退出，防双推进（BUG-086）。
-- 1.0.13（D7/BUG-088）：onProgress(out) 每实例收尾回调——调用方按段提交 WJDCDump，
--   链死/中途中断时已扫实例不丢（out 为活表，后续实例追加原地生效）。
-- 1.0.17（BUG-091 v2，F1-F5）：阶段一异步化——枚举全路径过 whenLootListFresh 重建钩子（F2，
--   run A 全 0/run B 稀疏 11 = 打在列表异步重建窗实证）、0 件重试 3 次仍空才红字判空（F3）、
--   同 BOSS 按 itemID 去重（F5/BUG-093，250459×4 实证）；过滤器清零改 EJ_ResetLootFilter +
--   C_EncounterJournal.ResetSlotFilter/Enum.ItemSlotFilterType.NoFilter=15（F1：字面 0=Head 置毒实证）。
-- 1.0.18（BUG-094/095/096）：钉档过合法性闸+锚档候选探测（首选 14/23 无效按序改钉合法档）、
--   实例全量台账 seenInstances 随 done 第二回参上报（gating 完整性校验用）、单 BOSS 件数
--   sanity 守卫（>40 判 abnormal）、G1 重建钩子计数段尾汇总。
-- 1.0.19（BUG-096 转码）：选中读回校验/selectFail 链整撤（无参读回真机三连翻车，此路不通），
--   阶段一枚举改显式 GetLootInfoByIndex(li, bossIndex)，选中态退出掉落归因关键路径。
-- 冒烟模式（1.0.17，顾问增补②）：可选第 7 参 smokeLimit={name, maxBosses}——只取指定实例的
--   前 N 个 BOSS，其余实例跳过；采集/解析/档扫全链路不变，供真机小循环快验（3 分钟出数）。
local function exportInstances(isRaid, label, tierOn, done, abortFlag, onProgress, smokeLimit)
  -- ①难度档段首无条件捕获（大米段也捕获：大米枚举同样受难度余态影响，run2 +29 实证）
  local origDiff
  do
    local okD, d = pcall(EJ_GetDifficulty)
    if okD then origDiff = d end
  end
  -- BUG-091（E1）：段首捕获过滤器原态并清零——枚举全路径不再继承手册界面过滤态
  local origFilter = captureLootFilter()
  resetLootFilter()
  local finalized = false
  local function finalize()
    if finalized then return end
    finalized = true
    restoreLootFilter(origFilter)  -- BUG-091：还原用户过滤器态，不留全局副作用
    if origDiff then
      pcall(EJ_SetDifficulty, origDiff)  -- 还原手册难度档，不留全局副作用
    else
      pcall(EJ_SetDifficulty, 14)  -- BUG-086 主洞：原未设档时旧码不还原，现归位普通档
      msg(label .. "段：手册难度原未设置，已归位普通档（1.0.12 跨跑态防护）")
    end
  end
  local function aborted() return abortFlag and abortFlag.aborted end

  -- 档位配置：团本=四档+特效/毒咒读史诗档；大米=候选档逐档探测+特效读史诗档、免毒咒（REQ-118）
  local tierSet = isRaid and RAID_TIERS or DUNGEON_TIERS
  local tierOpts = isRaid and { effectTier = "mythic", venomcurse = true }
                           or { effectTier = "mythic", venomcurse = false, skipBadTier = true }
  local anchorCandidates = isRaid and RAID_ANCHOR_CANDIDATES or DUNGEON_ANCHOR_CANDIDATES  -- BUG-094：锚档候选探测
  resetLootFreshStats()  -- G1 查证（BUG-096③）：钩子计数器按段归零，段尾汇总
  local seenInstances = {}        -- BUG-095：阶段一实际枚举到的实例全量台账（含判空跳过/伪实例）
  local segmentAbnormal = false   -- BUG-096②：sanity 异常段级标记（gating 拒写基线用）
  local sanityNotes = {}

  -- 阶段一（1.0.17 起异步化）：枚举结构
  local instances = {}
  local idx = 0
  local startPhase2, enumInstance, enumBossItems  -- 前向声明：阶段一异步链跑完自动续推阶段二

  -- F5（BUG-093）：同 BOSS 按 itemID 去重；F3：0 件过重建钩子重试，封顶 3 次仍 0 才红字记空
  -- 1.0.19（BUG-096 转码）：bossIndex 显式传入（该 BOSS 在当前选中实例内的序号，与
  -- EJ_GetEncounterInfoByIndex 同源），枚举不再依赖 EJ_SelectEncounter 选中态
  enumBossItems = function(iname, bosses, bname, encounterID, bossIndex, attempt, doneB)
    if aborted() then finalize() return end
    -- 掉落计数不依赖 EJ_GetNumLoot（12.x 已死）：按 index 递增取到 nil 为止
    -- （MayReturnNothing 明载），硬上限 60（sanity 上限 40 之上留余量，纯防死循环保险）
    local items, seen, li = {}, {}, 1
    while li <= 60 do
      local itemID = getLootItemID(li, bossIndex)
      if not itemID then break end
      if not seen[itemID] then  -- EJ 同件可多 index 列出（250459×4 实证），按 itemID 去重
        seen[itemID] = true
        items[#items + 1] = { id = itemID }
      end
      li = li + 1
    end
    if #items == 0 and attempt < 3 then
      whenLootListFresh(function() enumBossItems(iname, bosses, bname, encounterID, bossIndex, attempt + 1, doneB) end)
      return
    end
    if #items == 0 then
      err(string.format("%s · %s：BOSS『%s』枚举重试 3 次仍 0 件掉落——记空掉落占位（非正常默认，请截图反馈顾问侧）",
        label, tostring(iname), tostring(bname)))
    end
    -- BUG-096②：件数 sanity 守卫——超上限判列表异常（疑串 BOSS/串档），数据照录但标记
    -- abnormal（gating 拒写计数基线），不静默
    if #items > BOSS_ITEM_SANITY_MAX then
      segmentAbnormal = true
      sanityNotes[#sanityNotes + 1] = tostring(iname) .. "·" .. tostring(bname) .. "=" .. #items .. " 件"
      err(string.format("%s · %s：BOSS『%s』枚举 %d 件超 sanity 上限 %d——判列表异常，数据照录但本跑标记 abnormal 不覆写计数基线，请截图反馈顾问侧",
        label, tostring(iname), tostring(bname), #items, BOSS_ITEM_SANITY_MAX))
    end
    bosses[#bosses + 1] = { boss = bname, encounterID = encounterID, items = items }
    doneB()
  end

  enumInstance = function()
    if aborted() then finalize() return end
    idx = idx + 1
    local instanceID, iname = EJ_GetInstanceByIndex(idx, isRaid)
    if not instanceID then startPhase2() return end
    -- 冒烟模式：只取目标实例，其余实例零触碰跳过；目标已收齐即收尾进阶段二
    if smokeLimit then
      if #instances > 0 then startPhase2() return end
      if iname ~= smokeLimit.name then enumInstance() return end
    end
    -- 实例级 pcall 只兜同步段（选本/钉档/清过滤器），中断红字具名（实例名+原因+恢复建议），跳过本实例不拖垮整段
    local pinnedDiff
    local okI, eI = pcall(function()
      EJ_SelectInstance(instanceID)
      pinnedDiff = pinInstanceDifficulty(anchorCandidates)  -- ②REQ-119①+BUG-094：合法性闸后钉首个合法锚档
      resetLootFilter()  -- BUG-091（E1）：每实例枚举前再清过滤器（段首已清，此处兜底防中段污染）
    end)
    if not okI then
      seenInstances[#seenInstances + 1] = { name = iname, items = 0, skipped = true, reason = "实例枚举中断（pcall 捕获）" }  -- BUG-095：中断实例同入台账，gating 点名不漏
      err(string.format("%s · %s：实例枚举中断（%s）——跳过本实例，恢复建议：/reload 后重跑", label, tostring(iname), tostring(eI)))
      enumInstance()
      return
    end
    -- ②REQ-119①：钉档回读校验；快照读到什么印什么（BUG-091：过滤器态并入快照）
    -- BUG-094：首选锚档无效改钉/全钉失败均明示（单难度本改钉属正常，全钉失败=非正常）
    local okR, curD = pcall(EJ_GetDifficulty)
    local pinNote
    if pinnedDiff == nil then
      pinNote = "（锚档全部钉失败：按当前档 " .. tostring(okR and curD or "?") .. " 枚举——非正常，请截图反馈顾问侧）"
    elseif pinnedDiff ~= anchorCandidates[1] then
      pinNote = "（首选锚档 " .. anchorCandidates[1] .. " 无效，改钉 " .. pinnedDiff .. "）"
    else
      pinNote = ""
    end
    msg(string.format("%s · %s：难度档快照=%s 过滤器[%s]%s",
      label, tostring(iname), tostring(okR and curD or "?"), lootFilterSnapshotText(), pinNote))
    local bosses, bi = {}, 0
    -- ③BUG-087 双判收尾：伪实例名表过滤 + 全 BOSS 零掉落空实例跳过（1.0.17 起空实例改红字，禁静默）
    local function finishInstance()
      local totalItems = 0
      for _, b in ipairs(bosses) do totalItems = totalItems + #b.items end
      if PSEUDO_INSTANCE_NAMES[iname] then
        seenInstances[#seenInstances + 1] = { name = iname, items = 0, pseudo = true }
        msg(label .. " · " .. tostring(iname) .. "：伪实例过滤跳过（1.0.12 BUG-087）")
      elseif totalItems == 0 then
        seenInstances[#seenInstances + 1] = { name = iname, items = 0, skipped = true, reason = "全 BOSS 枚举重试后 0 件，判空跳过" }  -- BUG-095：判空跳过入台账，gating 点名+不计入覆写集
        err(string.format("%s · %s：全 BOSS 枚举重试后仍 0 件掉落，判空实例跳过——非正常默认（若非预期请截图反馈顾问侧）", label, tostring(iname)))
      else
        seenInstances[#seenInstances + 1] = { name = iname, items = totalItems }
        instances[#instances + 1] = { instanceID = instanceID, instance = iname, bosses = bosses }
      end
      enumInstance()
    end
    local function nextEnumBoss()
      if aborted() then finalize() return end
      -- 冒烟模式：BOSS 数达上限即收尾（只采前 N 个 BOSS）
      if smokeLimit and #bosses >= (smokeLimit.maxBosses or 1) then finishInstance() return end
      bi = bi + 1
      local bname, _, encounterID = EJ_GetEncounterInfoByIndex(bi, instanceID)
      if not bname then finishInstance() return end
      -- 1.0.19（BUG-096 转码）：读回校验/重试 3 次/selectFail 空占位链整撤——枚举改显式
      -- encounterIndex 传参，选中态退出归因关键路径；EJ_SelectEncounter 调用保留
      -- （维持列表重建钩子时序与手册界面态，结果不再读回校验）
      pcall(EJ_SelectEncounter, encounterID)
      -- F2：选 BOSS 后列表异步重建，过钩子再枚举（0 件重试与 itemID 去重见 enumBossItems）
      whenLootListFresh(function() enumBossItems(iname, bosses, bname, encounterID, bi, 1, nextEnumBoss) end)
    end
    -- F2：选本/钉档/清过滤器后先等列表重建完成，再进 BOSS 循环
    whenLootListFresh(nextEnumBoss)
  end

  -- 段级档值汇总计数（BUG-083：熔断器整删，此计数仅作段尾报告，不再影响任何 BOSS 的切档尝试）
  local bossNoTier = 0

  -- 阶段二（异步串行）：逐实例→逐 BOSS→逐件
  local out = {}
  local ii = 0
  local function nextInstance()
    if aborted() then finalize() return end
    ii = ii + 1
    local inst = instances[ii]
    if not inst then
      if smokeLimit and #instances == 0 then
        err(string.format("%s段：冒烟目标实例「%s」零产出——实态=实例在册已钉档但采集 0 件判空跳过（或实例名不匹配未枚举到），非正常，请截图反馈顾问侧", label, tostring(smokeLimit.name)))
      end
      if bossNoTier > 0 then
        msg(string.format("%s段难度档汇总：%d 个 BOSS 未出档值（逐件缺档计数见各 BOSS 黄/红字）", label, bossNoTier))
      end
      -- G1 查证（BUG-096③）：重建钩子健康度段尾汇总——超时放行占比≈100% 即坐实恒 true 嫌疑
      msg(string.format("%s段重建钩子统计（G1 查证）：%s", label, lootFreshStatsText()))
      finalize()
      done(out, { seen = seenInstances, abnormal = segmentAbnormal, sanity = sanityNotes })
      return
    end
    local bossesOut = {}
    local bi2 = 0
    local function nextBoss()
      if aborted() then finalize() return end
      bi2 = bi2 + 1
      local b = inst.bosses[bi2]
      if not b then
        out[#out + 1] = { instance = inst.instance, bosses = bossesOut }
        local cnt = 0
        for _, b2 in ipairs(bossesOut) do cnt = cnt + #b2.loot end
        msg(string.format("%s：%s（%d 个 BOSS，%d 件掉落）", label, inst.instance, #bossesOut, cnt))
        if onProgress then pcall(onProgress, out) end  -- 1.0.13（D7）：每实例收尾即落表，断链零留存
        nextInstance()
        return
      end
      -- 重设 EJ 选中态：collectTiers 的 GetLootInfoByIndex 序号语义依赖当前选中 BOSS（1.0.12 补 pcall 防炸链）
      -- 1.0.19（BUG-096 转码）：读回校验整撤——阶段一枚举已改显式 encounterIndex 传参不依赖
      -- 选中态；此处选中仅为 collectTiers 档扫服务，结果不再校验（选中未生效时档扫由陈旧列表/
      -- 缺席口径分案报错兜底，见 stats.staleSkip/absent 分支）
      pcall(EJ_SelectInstance, inst.instanceID)
      pcall(EJ_SelectEncounter, b.encounterID)
      local loot, failed = {}, {}
      local k = 0
      local function stepItem()
        if aborted() then finalize() return end
        k = k + 1
        local rec = b.items[k]
        if not rec then
          -- BOSS 收尾：failed 红字报告（禁静默）+ 难度档重扫 + 登记
          if #failed > 0 then
            err(string.format("%s · %s：%d 件物品解析失败记 failed（1.0.12 就绪门重试后仍失败，导出链继续）", inst.instance, b.boss, #failed))
          end
          local function finishBoss()
            bossesOut[#bossesOut + 1] = { boss = b.boss, loot = loot, failed = failed }
            nextBoss()
          end
          if not tierOn then finishBoss() return end
          -- ④BUG-085：难度档重扫纳入就绪门——全件预热+逐件确认后才扫，未就绪件 notReady 单列
          whenAllReady(loot, function(notReady)
            if aborted() then finalize() return end
            tierOpts.encounterID = b.encounterID  -- 1.0.14（D4）：陈旧列表校验键逐 BOSS 注入
            -- 1.0.14：collectTiers 异步化（签名带 done 回调），扫描异常走 stats.hardFail 不再抛 pcall
            collectTiers(loot, tierSet, tierOpts, function(stats)
              if aborted() then finalize() return end
              if stats.hardFail then
                -- 硬失败（扫描体抛错）：保留 strip（档值可能半身不遂）但先报已带档件数留证
                local preT = 0
                for _, it in ipairs(loot) do if it.primary_tiers or it.secondary_tiers then preT = preT + 1 end end
                err(string.format("%s · %s：难度档采集报错中断（%s）——本 BOSS 档值已抹除（中断前已带档 %d 件），恢复建议：/reload 后重跑",
                  inst.instance, b.boss, stats.hardFail, preT))
                stripTiers(loot)
                bossNoTier = bossNoTier + 1
              elseif stats.switchFail then
                bossNoTier = bossNoTier + 1
                err(string.format("%s · %s：切档读回失败（%s 档）——已采部分档值保留（%d 件带档），不再整 BOSS 回退（1.0.12）",
                  inst.instance, b.boss, stats.switchFail, stats.tiered))
              elseif stats.tiered == 0 and #loot > 0 then
                bossNoTier = bossNoTier + 1
                -- ⑤BUG-084 分案报错（1.0.14 口径更新）：陈旧列表跳档 / 稀疏表缺 link / 当档列表全缺席 / 0 档值
                if stats.staleSkip then
                  err(string.format("%s · %s：档通道异常——切档后列表整表陈旧（重试 2 次仍残留，跳档=%s），本 BOSS 档值不产出（采集侧，请截图反馈顾问侧）",
                    inst.instance, b.boss, stats.staleSkip))
                elseif stats.scanned == 0 and stats.noLink > 0 then
                  err(string.format("%s · %s：档通道异常——12.x 稀疏表缺 link 字段（%d 件次，数据源缺字段只能回退，物品 ID 见导出文件报顾问评估）",
                    inst.instance, b.boss, stats.noLink))
                elseif stats.scanned == 0 and stats.absent > 0 then
                  err(string.format("%s · %s：档通道异常——当档掉落列表枚举到但本 BOSS 物品全不在列（absent=%d 件次，疑列表错位残留/数据源缺），请截图反馈顾问侧",
                    inst.instance, b.boss, stats.absent))
                else
                  err(string.format("%s · %s：档通道 0 件出档值（scanned=%d 无静态值=%d 未就绪=%d scanFail=%d）——疑全为无静态属性品类或冷缓存空 tooltip",
                    inst.instance, b.boss, stats.scanned, stats.noValue, notReady, stats.scanFail))
                end
              else
                msg(string.format("%s · %s：档重扫完成（%d/%d 件带档%s%s）（缺档：noLink=%d 缺席=%d 未就绪=%d 无静态值=%d）",
                  inst.instance, b.boss, stats.tiered, #loot,
                  stats.tierSkip and ("，跳过档=" .. stats.tierSkip) or "",
                  stats.staleSkip and ("，陈旧跳档=" .. stats.staleSkip) or "",
                  stats.noLink, stats.absent, notReady, stats.noValue))
              end
              finishBoss()
            end)
          end)
          return
        end
        -- 就绪门（1.0.11）：冷缓存件入延迟重试队列，ContinueOnItemLoad 回调后才解析
        whenItemReady(rec.id, function()
          local okP, eP = pcall(function()
            local basics = getItemBasics(rec.id)
            if basics then
              local d = parseItemDetail(rec.id)
              -- 数值：API 通道优先（整表采用），不可用/空表回退 tooltip 解析值（任务书 #28 WP1）
              local pv, sv = statValuesFromApi(rec.id)
              if not pv then pv, sv = d.primary_values, d.secondary_values end
              loot[#loot + 1] = { id = rec.id, name = basics.name, slot = basics.slot,
                                  type = basics.type, ilvl = basics.ilvl, iconID = basics.iconID,
                                  primary = d.primary, secondary = d.secondary,
                                  primary_values = pv, secondary_values = sv,
                                  effect = d.effect, venomcurse = d.venomcurse }
            else
              failed[#failed + 1] = rec.id
            end
          end)
          if not okP then
            err(string.format("%s · %s：物品 %s 解析报错（%s），记 failed", inst.instance, b.boss, tostring(rec.id), tostring(eP)))
            failed[#failed + 1] = rec.id
          end
          stepItem()
        end)
      end
      stepItem()
    end
    nextBoss()
  end
  startPhase2 = nextInstance  -- 阶段二入口接前向声明：阶段一异步枚举链跑完后由此续推
  enumInstance()
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
local exporting = false  -- 导出并发锁（1.0.11）：异步链未跑完拒绝重复触发（重复触发会交错 EJ 难度档与重试队列）

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
  if exporting then
    err("上一次导出尚未完成，请等待「已导出」提示后再触发")
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
  exporting = true
  local ejTier = EJ_GetCurrentTier()
  if ejTier then pcall(EJ_SelectTier, ejTier) end  -- 只导当前资料片，旧实例一律不导
  local dump = { meta = buildMeta(kind) }
  -- REQ-119③：run 标记+时间戳——日志与导出文件可互查，杜绝日志对不上文件的取证困境
  msg("导出 run " .. tostring(dump.meta.run_id) .. " 开始（" .. tostring(dump.meta.time) .. "）")
  -- 四难度档通道探测（1.0.7，仅团本段用）：EJ 切档函数 + 掉落表 link 通道双条件在场才启用；
  -- 不可用回退单档采集（tiers 不产出），红字明示
  local tierOn = false
  if kind == "all" or kind == "raid" or kind == "smoke" then
    tierOn = tierChannelAvailable()
    dump.meta.tier_channel = tierOn and "ej-link" or "unavailable"
    if tierOn then
      msg("四难度档采集已启用（插件 v" .. ADDON_VERSION .. "）：随机/普通/英雄/史诗逐档切档重扫，时长约为单档 4 倍属预期，请耐心等待")
    else
      err("四档采集通道不可用（EJ_SetDifficulty/EJ_GetDifficulty 或 GetLootInfoByIndex 缺失），本次回退单档采集，tiers 不产出——请截图反馈顾问侧")
    end
  else
    dump.meta.tier_channel = "n/a"
  end
  -- REQ-118（1.0.12）：大米段难度档通道——普通/英雄/史诗/时空漫游逐档探测回读（因本而异），
  -- 特效读史诗档、M+ 免毒咒判定；通道不可用回退 1.0.9 平面单档路径（原样保留）
  local dungeonTierOn = false
  if kind == "all" or kind == "mplus" or kind == "smoke" then
    dungeonTierOn = tierChannelAvailable()
    dump.meta.dungeon_tier_channel = dungeonTierOn and "ej-link" or "unavailable"
    if dungeonTierOn then
      msg("大秘境难度档采集已启用（插件 v" .. ADDON_VERSION .. "，REQ-118）：普通/英雄/史诗/时空漫游逐档探测（因本而异），特效读史诗档，M+ 免毒咒判定")
    else
      err("大秘境难度档通道不可用，本次回退平面单档采集（特效/档值不产出）——请截图反馈顾问侧")
    end
  end
  msg("开始导出（" .. kind .. "），数据量大请稍候……")
  msg("冷缓存物品将自动等待数据加载（1.0.11 起，无需 /reload 重跑补齐）；仍记 failed 的物品会红字单列")
  -- 1.0.13（D7/BUG-088 断链零留存）：按段提交——每实例收尾即落 WJDCDump 并置 meta.partial=true
  -- 断链标记；链死/中途中断时已扫实例不丢（旧设计终局一次性提交，链死=整跑全丢，/reload 后旧表写回）。
  -- 终局提交清标记；段级中断（pcall 捕获）保留 partial=true。WJDCLastCounts 仍只在完整跑终局覆写。
  local anyAborted = false
  local function commitPartial()
    dump.meta.partial = true
    WJDCDump = dump
  end
  -- 1.0.15（D6 收尾哨兵，BUG-089 谎报案的收尾半）：看门狗只读链状态计时——心跳由 doExport
  -- 自有回调闭包（段完成 done / 1.0.13 onProgress 落表）打点，exportInstances/collectTiers/
  -- whenItemReady/1.0.9 解析路径一律不碰；超 300s 无心跳判链死红字提示一次并重武装
  -- （链可能只是慢），不重复刷屏；正常完成/段中断均解除或续跑。不做超时自解锁
  -- （顾问裁定：/reload 兜底，步骤卡 Q1 已写明中断后需 /reload 再跑）。
  local watchdogArmed = true
  local lastBeat = GetTime()
  local function beat() lastBeat = GetTime() end
  local function watchdog()
    if not watchdogArmed then return end
    if GetTime() - lastBeat >= 300 then
      beat()
      err("导出链已超过 300 秒无进展，判定链中断——已扫数据已按段落表不丢，请 /reload 后重跑（1.0.15 哨兵）；仍现请红字整屏截图或 BugSack 栈全文反馈顾问侧")
    end
    C_Timer.After(30, watchdog)
  end
  C_Timer.After(30, watchdog)
  -- 分段串行（1.0.11 异步化）：段内异常红字报告并跳段，不拖垮其他段（旧 guard 语义延续）
  -- 1.0.12（BUG-086）：每段挂 abortFlag——段级 pcall 捕获后旧链回调醒来即退出，防双推进
  local segs = {}
  local segReports = {}  -- BUG-095：各段实例台账/异常标记（exportInstances done 第二回参），gating 用
  if kind == "all" or kind == "raid" then
    local af = {}
    segs[#segs + 1] = { label = "团本", abortFlag = af, run = function(next)
      exportInstances(true, "团本", tierOn, function(out, rep) beat() dump.raids = out segReports["团本"] = rep next() end, af,
        function(out) beat() dump.raids = out commitPartial() end)
    end }
  end
  if kind == "all" or kind == "mplus" then
    local af2 = {}
    segs[#segs + 1] = { label = "大秘境", abortFlag = af2, run = function(next)
      exportInstances(false, "大秘境", dungeonTierOn, function(out, rep) beat() dump.dungeons = out segReports["大秘境"] = rep next() end, af2,
        function(out) beat() dump.dungeons = out commitPartial() end)
    end }
  end
  -- 冒烟模式（1.0.17，顾问增补②）：只扫至暗之夜第 1 BOSS + 毒牙祭坛第 1 BOSS，
  -- 采集/解析/档扫/黄字全要素与全量同链，3 分钟出数——真机小循环：冒烟绿→全量 A/B，冒烟红→直接打回
  if kind == "smoke" then
    local afs = {}
    segs[#segs + 1] = { label = "冒烟·团本", abortFlag = afs, run = function(next)
      exportInstances(true, "冒烟·团本", tierOn, function(out) beat() dump.raids = out next() end, afs,
        function(out) beat() dump.raids = out commitPartial() end,
        { name = "至暗之夜", maxBosses = 1 })
    end }
    local afs2 = {}
    segs[#segs + 1] = { label = "冒烟·大秘境", abortFlag = afs2, run = function(next)
      exportInstances(false, "冒烟·大秘境", dungeonTierOn, function(out) beat() dump.dungeons = out next() end, afs2,
        function(out) beat() dump.dungeons = out commitPartial() end,
        { name = "毒牙祭坛", maxBosses = 1 })
    end }
  end
  local si = 0
  local function nextSeg()
    si = si + 1
    local seg = segs[si]
    if not seg then
      watchdogArmed = false  -- 1.0.15（D6）：正常跑完解除哨兵
      dump.meta.partial = anyAborted and true or nil  -- 1.0.13：段级中断过的跑保留断链标记
      if kind == "smoke" then dump.meta.smoke = true end  -- 冒烟产物标记，防误判为全量导出
      WJDCDump = dump
      exporting = false
      if kind ~= "smoke" then
        -- REQ-119②：逐实例计数与上次对比（SavedVariables WJDCLastCounts），不一致黄字提示
        -- （冒烟跑跳过计数对比/质量门/基线覆写——样本仅 2 实例，防污染全量基线）
        local counts = {}
        for _, grp in ipairs({ { "团本", dump.raids }, { "大秘境", dump.dungeons } }) do
          for _, inst in ipairs(grp[2] or {}) do
            local c = 0
            for _, b in ipairs(inst.bosses or {}) do c = c + #(b.loot or {}) end
            counts[grp[1] .. "/" .. inst.instance] = c
          end
        end
        if type(WJDCLastCounts) == "table" then
          for k, v in pairs(counts) do
            local prev = WJDCLastCounts[k]
            if prev and prev ~= v then
              msg(string.format("计数对比：%s 上次 %d 件 → 本次 %d 件", k, prev, v))
            end
          end
        end
        -- BUG-095（1.0.18）：gating 第四条=期望实例集完整性校验——缺任一或任一 0 件即拒写
        -- WJDCLastCounts+红字点名；判空跳过的实例不计入覆写集（含 F4 零件门，口径吸收）。
        -- 违规源：①段台账 0 件判空跳过 ②段实例数不足期望集（团本 3/大米 8）③基线具名实例本次缺席
        -- ④导出 0 件（解析全灭等）⑤BOSS 件数 sanity 异常；断链跑（meta.partial）同不覆写（1.0.13 口径）
        local violations = {}
        local skippedReport = {}
        for _, grp in ipairs({ { "团本", dump.raids }, { "大秘境", dump.dungeons } }) do
          local segLabel, segOut = grp[1], grp[2]
          if segOut ~= nil then
            local rep = segReports[segLabel]
            local seenReal, seenNames = 0, {}
            if rep and rep.seen then
              for _, s in ipairs(rep.seen) do
                if not s.pseudo then
                  seenReal = seenReal + 1
                  seenNames[#seenNames + 1] = tostring(s.name)
                  if s.items == 0 then
                    violations[#violations + 1] = "实例『" .. tostring(s.name) .. "』枚举 0 件（判空跳过）"
                    skippedReport[#skippedReport + 1] = { segment = segLabel, instance = s.name,
                      reason = s.reason or "全 BOSS 枚举重试后 0 件，判空跳过" }
                  end
                end
              end
            end
            local expected = EXPECTED_INSTANCE_COUNT[segLabel]
            if expected and seenReal < expected then
              violations[#violations + 1] = segLabel .. "段仅枚举到 " .. seenReal .. "/" .. expected
                .. " 个实例（在列：" .. table.concat(seenNames, "、") .. "）"
            end
            if type(WJDCLastCounts) == "table" then
              for k in pairs(WJDCLastCounts) do
                local g, nm = k:match("^(.-)/(.+)$")
                if g == segLabel and counts[k] == nil then
                  violations[#violations + 1] = "基线实例『" .. tostring(nm) .. "』本次缺席"
                end
              end
            end
            if rep and rep.sanity then
              for _, n in ipairs(rep.sanity) do
                violations[#violations + 1] = "BOSS 件数异常：" .. n
              end
            end
          end
        end
        for k, v in pairs(counts) do
          if v == 0 then violations[#violations + 1] = "实例『" .. k .. "』导出 0 件" end
        end
        -- BUG-094④：判空跳过实例留痕导出文件（红字之外的第二通道，禁无痕失踪）
        if #skippedReport > 0 then dump.skipped_instances = skippedReport end
        if #violations > 0 then
          table.sort(violations)
          dump.meta.abnormal = true
          err("完整性质量门（BUG-095）：本跑拒写计数基线——" .. table.concat(violations, "；") .. "（请截图反馈顾问侧）")
        elseif anyAborted then
          msg("本跑含段级中断（meta.partial 断链标记），不覆写上次计数基线（1.0.13 既定口径）")
        else
          WJDCLastCounts = counts
        end
      end
      if kind == "smoke" then
        msg("冒烟导出完成（至暗之夜第 1 BOSS + 毒牙祭坛第 1 BOSS；不落计数基线）——绿则连跑全量 A/B，红则截图打回")
      end
      msg("已导出（run " .. tostring(dump.meta.run_id) .. "，" .. date("%Y-%m-%d %H:%M:%S") .. "），请 /reload 或退出游戏写入文件")
      msg("文件位置：WTF/Account/<你的账号名>/SavedVariables/WoWButlerExporter.lua")
      return
    end
    local ok, e = pcall(seg.run, nextSeg)
    if not ok then
      seg.abortFlag.aborted = true  -- 防已挂出的旧链回调稍后再次驱动 nextSeg（双推进）
      anyAborted = true             -- 1.0.13（D7）：终局提交保留 meta.partial 断链标记
      beat()                        -- 1.0.15（D6）：段中断有红字有续推，属有进展，喂狗
      err(seg.label .. "段导出中断（原因：" .. tostring(e) .. "）；其余段落不受影响。恢复建议：/reload 后重跑本导出，仍现请截图反馈顾问侧")
      nextSeg()
    end
  end
  nextSeg()
end

SLASH_WJDC1 = "/wjdc"
SlashCmdList["WJDC"] = function(input)
  local cmd = (input or ""):gsub("^%s+", ""):gsub("%s+$", ""):lower()
  local probeArg = cmd:match("^probe%s*(%S*)$")  -- 1.0.11：物品ID/团本序号之外增 hover 悬停直读
  if probeArg and (probeArg:match("^%d+$") or probeArg == "hover" or probeArg == "") then
    if WJDCProbe then WJDCProbe(probeArg) else err("诊断模块 WoWButlerExporter_Probe.lua 未加载") end
    return
  end
  if cmd == "all" or cmd == "raid" or cmd == "mplus" or cmd == "tier" or cmd == "me" or cmd == "smoke" then
    doExport(cmd)
  else
    msg("用法：/wjdc all（全量）| raid（团本）| mplus（大秘境）| smoke（冒烟：至暗之夜+毒牙祭坛各第 1 BOSS）| me（本人角色档案）| probe [团本序号|物品ID|hover]（诊断）")
  end
end
