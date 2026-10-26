-- 任务书 #82-Patch1：12.1.5 家宅图鉴余缺 26 个图标 ID 回填
-- 仅供运营审阅后决定是否执行；Codex 未连接数据库、未执行此文件。
-- 来源：Wowhead tooltip 按 item_id 返回的图标 FileDataID；26 个 ID 均已由 WoW 12.1.5.70575 CASC 解码验证。
-- 幂等：允许 icon_file_id 为空或已等于目标值；任何缺行/冲突值均在更新前终止。

BEGIN;

DO $precheck$
DECLARE
  bad_count integer;
BEGIN
  WITH expected(record_id, icon_file_id) AS (
    VALUES
      (28569, 8179947),
      (28559, 8179967),
      (28557, 8179729),
      (28556, 8179725),
      (28547, 8179717),
      (28540, 8180011),
      (28512, 8148014),
      (28510, 8148038),
      (28495, 8148340),
      (28482, 8174631),
      (28475, 8174603),
      (28471, 8174582),
      (28470, 8174647),
      (28469, 8148342),
      (28435, 8179426),
      (28432, 8179416),
      (28354, 8179939),
      (28336, 8179868),
      (28327, 8179880),
      (28326, 8179860),
      (28324, 8179520),
      (28319, 8179514),
      (27684, 8168809),
      (27220, 8140918),
      (26881, 8033383),
      (25325, 7949065)
  )
  SELECT count(*)
  INTO bad_count
  FROM expected e
  LEFT JOIN public.decor_catalog d ON d.record_id = e.record_id
  WHERE d.record_id IS NULL
     OR (d.icon_file_id IS NOT NULL AND d.icon_file_id <> e.icon_file_id);

  IF bad_count <> 0 THEN
    RAISE EXCEPTION '82-Patch1 前置检查失败：缺行或已有图标 ID 冲突 % 条；未更新任何数据', bad_count;
  END IF;
END
$precheck$;

WITH expected(record_id, icon_file_id) AS (
  VALUES
    (28569, 8179947),
    (28559, 8179967),
    (28557, 8179729),
    (28556, 8179725),
    (28547, 8179717),
    (28540, 8180011),
    (28512, 8148014),
    (28510, 8148038),
    (28495, 8148340),
    (28482, 8174631),
    (28475, 8174603),
    (28471, 8174582),
    (28470, 8174647),
    (28469, 8148342),
    (28435, 8179426),
    (28432, 8179416),
    (28354, 8179939),
    (28336, 8179868),
    (28327, 8179880),
    (28326, 8179860),
    (28324, 8179520),
    (28319, 8179514),
    (27684, 8168809),
    (27220, 8140918),
    (26881, 8033383),
    (25325, 7949065)
)
UPDATE public.decor_catalog AS d
SET icon_file_id = e.icon_file_id
FROM expected e
WHERE d.record_id = e.record_id
  AND d.icon_file_id IS NULL;

DO $postcheck$
DECLARE
  mismatch_count integer;
BEGIN
  WITH expected(record_id, icon_file_id) AS (
    VALUES
      (28569, 8179947),
      (28559, 8179967),
      (28557, 8179729),
      (28556, 8179725),
      (28547, 8179717),
      (28540, 8180011),
      (28512, 8148014),
      (28510, 8148038),
      (28495, 8148340),
      (28482, 8174631),
      (28475, 8174603),
      (28471, 8174582),
      (28470, 8174647),
      (28469, 8148342),
      (28435, 8179426),
      (28432, 8179416),
      (28354, 8179939),
      (28336, 8179868),
      (28327, 8179880),
      (28326, 8179860),
      (28324, 8179520),
      (28319, 8179514),
      (27684, 8168809),
      (27220, 8140918),
      (26881, 8033383),
      (25325, 7949065)
  )
  SELECT count(*)
  INTO mismatch_count
  FROM expected e
  LEFT JOIN public.decor_catalog d ON d.record_id = e.record_id
  WHERE d.record_id IS NULL OR d.icon_file_id IS DISTINCT FROM e.icon_file_id;

  IF mismatch_count <> 0 THEN
    RAISE EXCEPTION '82-Patch1 后置复核失败：目标值不匹配 % 条，事务应回滚', mismatch_count;
  END IF;
END
$postcheck$;

COMMIT;
