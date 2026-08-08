-- ============================================================
-- 增量 SQL 23：BUG-061（任务书 #28 WP3-v3 R8）——dungeon_loot 特效漏回写回填
-- 日期：2026-08-08
-- 背景：wjdc 1.0.6 导出原文 effect 非空 36 条（boss 22 / dungeon 14），converter 产出 36 条
--   （解析/映射零丢失），DB 现仅 33 条——3 行 dungeon 在历史装载批次漏回写 effect：
--   暮色怨灵的低语 / 圣光印记 / 多曼纳尔控制台（均属「维克雷尔之握」06dce908-a69a-4a31-b9a9-24e43ec5edbb）。
-- 纪律：只补缺（effect 为空才写），不覆盖已有 33 条；按 dungeon_id + boss_id + item_name 三键定位；幂等可重复执行。
-- 回填后口径：DB effect 非空 = 36（boss 22 + dungeon 14），与导出原文/converter 产出三者一致。
-- 执行方式：SSH + docker exec psql（supabase_admin 角色）
-- 回滚说明（仅在确认误写时执行；正常无需回滚——本迁移只写空字段）：
--   update dungeon_loot set effect = null
--   where dungeon_id = '06dce908-a69a-4a31-b9a9-24e43ec5edbb'
--     and item_name in ('暮色怨灵的低语', '圣光印记', '多曼纳尔控制台');
-- ============================================================

update dungeon_loot set effect = E'装备： 你的治疗法术和技能有一定几率召唤暮色怨灵，跃向目标并为其恢复378点生命值。\r\n\r\n如果目标生命值低于40%，暮色怨灵会进一步强化目标，使其获得7全能，持续10秒。'
where dungeon_id = '06dce908-a69a-4a31-b9a9-24e43ec5edbb'
  and boss_id = 'f204a9c0-464e-4eda-8af3-e9a254634306'
  and item_name = '暮色怨灵的低语'
  and (effect is null or btrim(effect) = '');

update dungeon_loot set effect = E'装备： 你的攻击有几率对目标释放光耀打击，对附近敌人造成128点神圣伤害，由范围内所有敌人分摊。\r\n'
where dungeon_id = '06dce908-a69a-4a31-b9a9-24e43ec5edbb'
  and boss_id = '5824eb67-c0fb-40ea-953e-9d68f09ec41c'
  and item_name = '圣光印记'
  and (effect is null or btrim(effect) = '');

update dungeon_loot set effect = E'使用： 将此装饰添加到你的住宅收纳箱中。'
where dungeon_id = '06dce908-a69a-4a31-b9a9-24e43ec5edbb'
  and boss_id = '5824eb67-c0fb-40ea-953e-9d68f09ec41c'
  and item_name = '多曼纳尔控制台'
  and (effect is null or btrim(effect) = '');
