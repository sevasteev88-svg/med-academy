-- ==============================================================================
-- Скрипт: data_cleanup_audit.sql
-- Призначення: Аудит та ручна очистка тестових / безглуздих даних («dfgdfgdfg», «test» тощо).
-- 
-- ПРАВИЛО: Цей скрипт НЕ видаляє дані автоматично!
-- Спочатку запустіть SELECT-запити для виявлення тестових записів.
-- Потім, переглянувши ID, запустіть відповідні команди UPDATE або DELETE вручну.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. АУДИТ ТАБЛИЦІ: injuries (опис та обставини травм)
-- ------------------------------------------------------------------------------
-- Пошук за патернами:
--   a) повтори символів (напр. 'aaaa', 'ddddd', 'xxxx')
--   b) типові тестові корені ('test', 'asdf', 'dfg', 'qwerty', 'foo', 'bar', 'тест', 'йцук')
--   c) довгі послідовності латинських приголосних без голосних (довжина >= 5)
SELECT 
  id,
  player_id,
  date_of_injury,
  injury_type,
  location,
  description,
  created_at
FROM public.injuries
WHERE 
  description IS NOT NULL 
  AND (
    description ~* '([a-zа-я])\1{3,}'                 -- 4+ однакових символи поспіль
    OR description ~* '\b(test|тест|asdf|dfg|qwerty|foo|bar|baz|йцук|tmp)\b'
    OR description ~* '[bcdfghjklmnpqrstvwxyz]{5,}'   -- 5+ латинських приголосних без голосних
    OR length(description) < 3                        -- занадто короткі беззмістовні записи на кшталт 'а', '..'
  )
ORDER BY created_at DESC;

-- Шаблон ручної очистки опису травм (залишає запис травми, очищує тільки сміттєвий текст):
-- UPDATE public.injuries 
-- SET description = NULL 
-- WHERE id IN (
--   '00000000-0000-0000-0000-000000000000' -- вставте сюди ID
-- );


-- ------------------------------------------------------------------------------
-- 2. АУДИТ ТАБЛИЦІ: injury_examinations (нотатки оглядів лікаря)
-- ------------------------------------------------------------------------------
SELECT 
  id,
  injury_id,
  date,
  objective_note,
  subjective_note,
  created_at
FROM public.injury_examinations
WHERE 
  (objective_note IS NOT NULL AND (
    objective_note ~* '([a-zа-я])\1{3,}'
    OR objective_note ~* '\b(test|тест|asdf|dfg|qwerty|foo|bar|йцук)\b'
    OR objective_note ~* '[bcdfghjklmnpqrstvwxyz]{5,}'
  ))
  OR (subjective_note IS NOT NULL AND (
    subjective_note ~* '([a-zа-я])\1{3,}'
    OR subjective_note ~* '\b(test|тест|asdf|dfg|qwerty|foo|bar|йцук)\b'
    OR subjective_note ~* '[bcdfghjklmnpqrstvwxyz]{5,}'
  ))
ORDER BY created_at DESC;

-- Шаблон ручної очистки нотаток оглядів:
-- UPDATE public.injury_examinations
-- SET objective_note = NULL, subjective_note = NULL
-- WHERE id IN (
--   '00000000-0000-0000-0000-000000000000'
-- );


-- ------------------------------------------------------------------------------
-- 3. АУДИТ ТАБЛИЦІ: injury_logs (журнал призначень та нотаток)
-- ------------------------------------------------------------------------------
SELECT 
  id,
  injury_id,
  date,
  category,
  note,
  created_at
FROM public.injury_logs
WHERE 
  note IS NOT NULL
  -- Пропускаємо системні JSON-мітки на кшталт [PLAYER_PHOTO], [RTP_CLEARANCE], [PLAYER_PIN_HASH]
  AND note NOT LIKE '[%'
  AND (
    note ~* '([a-zа-я])\1{3,}'
    OR note ~* '\b(test|тест|asdf|dfg|qwerty|foo|bar|йцук)\b'
    OR note ~* '[bcdfghjklmnpqrstvwxyz]{5,}'
  )
ORDER BY created_at DESC;

-- Шаблон видалення тестових логів:
-- DELETE FROM public.injury_logs
-- WHERE id IN (
--   '00000000-0000-0000-0000-000000000000'
-- );


-- ------------------------------------------------------------------------------
-- 4. АУДИТ ТАБЛИЦІ: players (тестові гравці)
-- ------------------------------------------------------------------------------
SELECT 
  id,
  first_name,
  last_name,
  position,
  created_at
FROM public.players
WHERE 
  first_name ~* '([a-zа-я])\1{3,}'
  OR last_name ~* '([a-zа-я])\1{3,}'
  OR first_name ~* '\b(test|тест|asdf|dfg|qwerty|foo|bar|йцук)\b'
  OR last_name ~* '\b(test|тест|asdf|dfg|qwerty|foo|bar|йцук)\b'
  OR first_name ~* '^[bcdfghjklmnpqrstvwxyz]{4,}$'
  OR last_name ~* '^[bcdfghjklmnpqrstvwxyz]{4,}$'
ORDER BY created_at DESC;

-- Шаблон безпечного архірування (або видалення) тестових гравців:
-- UPDATE public.players
-- SET archived_at = now(), archive_reason = 'Тестовий профіль'
-- WHERE id IN (
--   '00000000-0000-0000-0000-000000000000'
-- );


-- ------------------------------------------------------------------------------
-- 5. АУДИТ ТАБЛИЦІ: rehab_phases (нотатки фаз реабілітації)
-- ------------------------------------------------------------------------------
SELECT 
  id,
  injury_id,
  name,
  notes,
  status,
  created_at
FROM public.rehab_phases
WHERE 
  notes IS NOT NULL
  AND (
    notes ~* '([a-zа-я])\1{3,}'
    OR notes ~* '\b(test|тест|asdf|dfg|qwerty|foo|bar)\b'
    OR notes ~* '[bcdfghjklmnpqrstvwxyz]{5,}'
  )
ORDER BY created_at DESC;

-- Шаблон очищення нотаток фаз:
-- UPDATE public.rehab_phases
-- SET notes = NULL
-- WHERE id IN (
--   '00000000-0000-0000-0000-000000000000'
-- );
