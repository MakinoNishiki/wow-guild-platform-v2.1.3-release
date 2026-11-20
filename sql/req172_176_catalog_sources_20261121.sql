-- REQ-172 / REQ-176. 9 furnishings and 18 purchasable rooms.
-- Only sources is updated. Historical prices in context do not feed purchase totals.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.decor_catalog IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE catalog_source_patch (
    record_id integer PRIMARY KEY,
    entry_type integer NOT NULL,
    item_id integer,
    name text NOT NULL,
    raw_hash text NOT NULL,
    old_sources jsonb,
    new_sources jsonb NOT NULL
) ON COMMIT DROP;

-- Each neighborhood has its own merchant and inventory.
WITH rooms(id, name, alliance_style, reference_label, vouchers) AS (VALUES
    (132, '奥格瑞玛议事厅', false, '国服12.1公告参考价', 50),
    (151, '奥格瑞玛石坑室', false, '国服12.1公告参考价', 50),
    (273, '暴风城军械库', true, '外服商人参考价', 50),
    (277, '暴风城厨房', true, '国服12.1公告参考价', 50),
    (281, '暴风城陈列室', true, '国服12.1公告参考价', 50),
    (282, '暴风城大厅', true, '国服12.1公告参考价', 50),
    (283, '银月城军械库', false, '国服12.1公告参考价', 50),
    (285, '银月城高层书房', false, '国服12.1公告参考价', 50),
    (286, '银月城陈列室', false, '国服12.1公告参考价', 50),
    (287, '贝拉梅斯神殿室', true, '国服12.1公告参考价', 50),
    (288, '贝拉梅斯会议室', true, '国服12.1公告参考价', 50),
    (289, '贝拉梅斯剧院', true, '国服12.1公告参考价', 50),
    (290, '贝拉梅斯隐秘卧室', true, '国服12.1公告参考价', 50),
    (292, '奥格瑞玛剧院', false, '外服商人参考价', 50),
    (294, '奥格瑞玛陈列室', false, '国服12.1公告参考价', 50),
    (307, '银月城小型书房', false, '国服12.1公告参考价', 50),
    (400, '秋日西部荒野谷仓', true, '国服12.1公告参考价', 75),
    (401, '春日西部荒野谷仓', true, '国服12.1公告参考价', 75)
)
INSERT INTO catalog_source_patch
SELECT r.id, 2, NULL, r.name, md5(''),
    '[{"type":"vendor","price":null,"zones":["创始者之角、烈风海岸"],"vendor":"最后的建筑师／住宅区走私商","context":[{"label":"购买说明","value":"本阵营房型向最后的建筑师购买；跨阵营房型向住宅区走私商购买"},{"label":"解锁方式","value":"购买并使用对应房间图纸后学习"},{"label":"售价","value":"12.1.5当前商人实价待核实"}],"reputation":null}]'::jsonb,
    merchant_list.sources
FROM rooms r
CROSS JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
        'type', 'vendor', 'vendor', m.vendor, 'zones', jsonb_build_array(m.zone),
        'context', jsonb_build_array(
            jsonb_build_object('label', r.reference_label, 'value', r.vouchers || ' 社区礼券（当前国服实价待核）'),
            jsonb_build_object('label', '解锁方式', 'value', '购买并使用室内房间设计图')
        )
    ) ORDER BY m.position) AS sources
    FROM (VALUES
        (1, CASE WHEN r.alliance_style THEN '乔万·朗摩尔（住宅区总承包商）' ELSE '萝萨（住宅区总承包商）' END,
            CASE WHEN r.alliance_style THEN '创始者之角' ELSE '烈风海岸' END),
        (2, '“芬恩”拉克特（住宅区私运者）',
            CASE WHEN r.alliance_style THEN '烈风海岸' ELSE '创始者之角' END)
    ) AS m(position, vendor, zone)
) merchant_list;

INSERT INTO catalog_source_patch
SELECT a.id, 1, a.item, a.name, '4592cb01175a584c2c5eee71a49e744c',
    '[{"drop":"世界生物","type":"drop","zones":[]},{"type":"treasure","zones":[],"context":[{"label":"待核实来源","value":"采集：世界错放的宝藏节点"}],"treasure":"世界古代储物箱掉落"}]'::jsonb,
    '[{"drop":"世界生物","type":"drop","zones":[]},{"type":"treasure","zones":[],"treasure":"世界古代储物箱掉落"},{"type":"treasure","zones":["金多赞的迷宫"],"treasure":"错放的宝藏"}]'::jsonb
FROM (VALUES
    (1433, 244350, '碎裂的阿曼尼仪式瓮'), (8992, 252044, '阿曼尼兽角杯'),
    (15161, 263321, '破旧的阿曼尼供品篮'), (15491, 264256, '壁挂式阿曼尼动物战利品'),
    (15748, 264484, '蓝色阿曼尼挂毯'), (25129, 284359, '锈蚀的阿曼尼灯台')
) AS a(id, item, name);

INSERT INTO catalog_source_patch VALUES
(2523, 1, 246857, '“舒哈鲁视角”画作', '963385b762ab26db56593ff97ed2a90a', '[]',
    '[{"type":"vendor","vendor":"卡维兹·洛典","zones":["密谋小径"],"context":[{"label":"位置","value":"一号首领左后方墙角"},{"label":"国服实测原价","value":"9,999,999 金 99 银 99 铜"},{"label":"条件价","value":"集齐 13 张不同编号的萨格尔的塔罗牌，再与商人对话可用 999 金购买"}]}]'),
(25546, 1, 276230, '佩佩', '665b5b6662a4ea98477bdaff484feb87', '[]',
    '[{"type":"unlock","unlock":"点击住宅区公告板上方的佩佩领取装饰","context":[{"label":"创始者之角","value":"53.1，40.0"},{"label":"烈风海岸","value":"55.2，57.6"}]}]'),
(28632, 1, 282164, '艾瑞达斯工作台', 'acb69c68708235cf6c98674148f1c28a', NULL,
    '[{"type":"treasure","treasure":"阿古斯的宝箱和物资箱","zones":["克罗库恩","艾瑞达斯"],"context":[{"label":"拾取记录","value":"克罗库恩的艾瑞达战争物资箱、艾瑞达斯的宝箱都有玩家开出过这张工作台"}]}]');

DO $$
DECLARE conflicts integer[];
BEGIN
    IF (SELECT count(*) FROM catalog_source_patch) <> 27 THEN
        RAISE EXCEPTION 'Expected 27 catalog entries';
    END IF;
    SELECT array_agg(p.record_id ORDER BY p.record_id) INTO conflicts
    FROM catalog_source_patch p LEFT JOIN public.decor_catalog d USING(record_id)
    WHERE d.record_id IS NULL OR d.entry_type IS DISTINCT FROM p.entry_type
        OR d.item_id IS DISTINCT FROM p.item_id OR d.name IS DISTINCT FROM p.name
        OR md5(d.source_text) IS DISTINCT FROM p.raw_hash
        OR (d.sources IS DISTINCT FROM p.old_sources AND d.sources IS DISTINCT FROM p.new_sources);
    IF conflicts IS NOT NULL THEN
        RAISE EXCEPTION 'Catalog data changed for IDs %; review before applying', conflicts;
    END IF;
END $$;

UPDATE public.decor_catalog d SET sources = p.new_sources
FROM catalog_source_patch p
WHERE d.record_id = p.record_id AND d.sources IS DISTINCT FROM p.new_sources;

DO $$
BEGIN
    IF (SELECT count(*) FROM catalog_source_patch p JOIN public.decor_catalog d USING(record_id)
        WHERE d.sources = p.new_sources) <> 27 THEN
        RAISE EXCEPTION 'Catalog readback failed';
    END IF;
END $$;
COMMIT;
