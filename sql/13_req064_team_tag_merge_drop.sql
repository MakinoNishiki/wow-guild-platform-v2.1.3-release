-- ============================================================
-- 增量迁移 13：活动「团队标签」并入「团号」并删除旧列（任务书 #14-补丁4，REQ-064）
-- 日期：2026-07-29
-- 内容：
--   ① 数据迁移——team_tag 有值且 team_label 为空的行，旧值迁入 team_label
--     （两侧均 btrim 后判空；team_label 已有值的行不覆盖）；
--   ② 删除旧列——ALTER TABLE activities DROP COLUMN team_tag。
-- drop 评估：team_tag 仅服务于 REQ-028 冲突分组与卡片蓝色徽章；值迁入 team_label 后，
--   前端读写映射已全部移除（冲突分组键切换为 team_label），server.js 代理无该列校验，
--   RLS 不涉及列级策略——无其他引用方，可安全删除。
-- 执行方式：Supabase SQL Editor 整文件执行，幂等可重复执行（DO 块守卫列存在性）。
-- 回滚：
--   ALTER TABLE activities ADD COLUMN IF NOT EXISTS team_tag text;
--   UPDATE activities SET team_tag = team_label
--     WHERE team_label IS NOT NULL AND btrim(team_label) <> '';
--   （回滚只能恢复迁移后的并集值，无法区分原 team_label 与迁入值）
-- ============================================================

-- ① 数据迁移（列已不存在时跳过，保证重复执行不报错）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'activities' AND column_name = 'team_tag'
  ) THEN
    UPDATE activities
       SET team_label = btrim(team_tag)
     WHERE team_tag IS NOT NULL AND btrim(team_tag) <> ''
       AND (team_label IS NULL OR btrim(team_label) = '');
  END IF;
END $$;

-- ② 删除旧列
ALTER TABLE activities DROP COLUMN IF EXISTS team_tag;
