-- #83 补丁5。国服 12.1.5.70961 商店实采，见 cn-room-vendor-prices.json。
-- 只更新创始者之角对应商人，保留另一住宅区的来源、顺序与历史参考价。
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.decor_catalog IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE room_offer (
    record_id integer PRIMARY KEY, room_name text NOT NULL,
    npc integer NOT NULL, vouchers integer NOT NULL
) ON COMMIT DROP;
INSERT INTO room_offer VALUES
    (132,'奥格瑞玛议事厅',257297,50), (151,'奥格瑞玛石坑室',257297,50),
    (273,'暴风城军械库',255104,50), (277,'暴风城厨房',255104,50),
    (281,'暴风城陈列室',255104,50), (282,'暴风城大厅',255104,50),
    (283,'银月城军械库',257297,50), (285,'银月城高层书房',257297,50),
    (286,'银月城陈列室',257297,50), (287,'贝拉梅斯神殿室',255104,50),
    (288,'贝拉梅斯会议室',255104,50), (289,'贝拉梅斯剧院',255104,50),
    (290,'贝拉梅斯隐秘卧室',255104,50), (292,'奥格瑞玛剧院',257297,50),
    (294,'奥格瑞玛陈列室',257297,50), (307,'银月城小型书房',257297,50),
    (400,'秋日西部荒野谷仓',255104,75), (401,'春日西部荒野谷仓',255104,75);

CREATE TEMP TABLE room_price_patch (
    record_id integer PRIMARY KEY, path text[] NOT NULL, offer jsonb NOT NULL
) ON COMMIT DROP;
INSERT INTO room_price_patch
SELECT r.record_id, ARRAY[(s.pos - 1)::text], candidate.offer
FROM room_offer r
JOIN public.decor_catalog d ON d.record_id=r.record_id AND d.entry_type=2 AND d.name=r.room_name
CROSS JOIN LATERAL jsonb_array_elements(d.sources) WITH ORDINALITY AS s(source,pos)
CROSS JOIN LATERAL (SELECT jsonb_build_object(
    'label',CASE WHEN r.record_id IN (273,292) THEN '外服商人参考价' ELSE '国服12.1公告参考价' END,
    'value',r.vouchers || ' 社区礼券（当前国服实价待核）'
) AS old_note, '{"label":"国服实测","value":"2026-11-21 · 正式服 12.1.5"}'::jsonb AS new_note,
    jsonb_build_array(jsonb_build_object('amount',r.vouchers,'currency_id',3363)) AS price) meta
CROSS JOIN LATERAL (SELECT jsonb_set(s.source,'{context,0}',meta.new_note)
    || jsonb_build_object('price',meta.price) AS offer) candidate
WHERE s.source->>'type'='vendor'
  AND s.source->'zones'='["创始者之角"]'::jsonb
  AND s.source->>'vendor'=CASE r.npc WHEN 255104 THEN '乔万·朗摩尔（住宅区总承包商）'
                                 WHEN 257297 THEN '“芬恩”拉克特（住宅区私运者）' END
  AND ((s.source#>'{context,0}'=meta.old_note AND NOT (s.source ? 'price'))
       OR (s.source#>'{context,0}'=meta.new_note AND s.source->'price'=meta.price));

DO $$ BEGIN
    IF (SELECT count(*) FROM room_price_patch) <> 18 THEN
        RAISE EXCEPTION 'Expected 18 matching room offers: missing, edited or unexpected source/price';
    END IF;
END $$;
UPDATE public.decor_catalog d SET sources=jsonb_set(d.sources,p.path,p.offer,false)
FROM room_price_patch p WHERE d.record_id=p.record_id AND d.sources#>p.path IS DISTINCT FROM p.offer;
DO $$ BEGIN
    IF EXISTS (SELECT FROM room_price_patch p JOIN public.decor_catalog d USING(record_id)
               WHERE d.sources#>p.path IS DISTINCT FROM p.offer) THEN
        RAISE EXCEPTION 'Room price readback mismatch';
    END IF;
END $$;
COMMIT;
-- 回滚使用本次生产备份；按图鉴编号、商人和所在区核对当前条目后恢复该商人原来源。
