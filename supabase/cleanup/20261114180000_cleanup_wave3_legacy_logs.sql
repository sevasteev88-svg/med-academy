-- ==============================================================================
-- OPTIONAL CLEANUP MIGRATION (DO NOT AUTO-APPLY BEFORE MANUAL PROD VERIFICATION)
-- File: supabase/cleanup/20261114180000_cleanup_wave3_legacy_logs.sql
-- Description: Wave 3 (Step 6 — cleanup)
--   Видаляє перенесені [TAG] рядки з public.injury_logs та фіктивні системні
--   травми з public.injuries. Запускати ТІЛЬКИ після ручної перевірки в проді,
--   що всі 7 нових таблиць успішно заповнені та працюють без зауважень.
-- ==============================================================================

BEGIN;

-- 1. Видаляємо з injury_logs виключно ті записи, які вже підтверджено перенесені
--    через legacy_log_id у нові таблиці
DELETE FROM public.injury_logs il
WHERE il.id IN (
  SELECT legacy_log_id FROM public.player_screenings WHERE legacy_log_id IS NOT NULL
  UNION ALL
  SELECT legacy_log_id FROM public.medical_treatments WHERE legacy_log_id IS NOT NULL
  UNION ALL
  SELECT legacy_log_id FROM public.lsi_assessments WHERE legacy_log_id IS NOT NULL
  UNION ALL
  SELECT legacy_log_id FROM public.player_anamnesis WHERE legacy_log_id IS NOT NULL
  UNION ALL
  SELECT legacy_log_id FROM public.player_nutrition_profiles WHERE legacy_log_id IS NOT NULL
  UNION ALL
  SELECT legacy_log_id FROM public.rehab_checkins WHERE legacy_log_id IS NOT NULL
  UNION ALL
  SELECT legacy_log_id FROM public.rehab_plans WHERE legacy_log_id IS NOT NULL
);

-- 2. Видаляємо фіктивні системні травми, які створювалися лише для обходу NOT NULL
--    на injury_logs.injury_id, якщо на них більше не посилається жоден запис
DELETE FROM public.injuries i
WHERE i.description IN (
  'Передсезонний скринінг / Медогляд',
  'Протокол функціонального тестування симетрії LSI / Динамометрія',
  'Нутриціологічний профіль / Санація',
  'План ЛФК / Реабілітація',
  'Самозвіти відновлення / Чек-ін'
)
  AND NOT EXISTS (SELECT 1 FROM public.injury_logs il WHERE il.injury_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM public.medical_treatments mt WHERE mt.injury_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM public.lsi_assessments la WHERE la.injury_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM public.rehab_checkins rc WHERE rc.injury_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM public.rehab_plans rp WHERE rp.target_injury_id = i.id);

COMMIT;
