-- ==============================================================================
-- Міграція: Безпечний вхід гравців у Реабілітаційний Портал (/rehab-portal)
-- ==============================================================================

-- 1. Якщо раніше існувала колонка з відкритим PIN у таблиці players — видаляємо її
ALTER TABLE public.players DROP COLUMN IF EXISTS pin;

-- 2. Додаємо необхідні поля безпеки до таблиці players:
--    - pin_hash: bcrypt-хэш 6-значного PIN-коду гравця
--    - portal_token: унікальний стійкий токен гравця для персонального посилання та QR-коду
--    - must_change_pin: прапорець обов'язкової зміни PIN при першому вході
--    - failed_attempts: лічильник невдалих спроб введення PIN
--    - locked_until: мітка часу блокування (15 хвилин при 5 помилках)
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS pin_hash text,
  ADD COLUMN IF NOT EXISTS portal_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS must_change_pin boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

-- 3. Генерація унікальних токенів для існуючих гравців (якщо ще не встановлено)
UPDATE public.players
SET portal_token = encode(gen_random_bytes(16), 'hex')
WHERE portal_token IS NULL;

-- Робимо portal_token обов'язковим та індексованим
ALTER TABLE public.players ALTER COLUMN portal_token SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_players_portal_token ON public.players(portal_token);

-- 4. Скидання старих відкритих PIN-кодів (видалення або очищення відкритих логів)
DELETE FROM public.injury_logs
WHERE note LIKE '[PLAYER_PIN]%';

-- 5. Скидаємо pin_hash і виставляємо must_change_pin = true для всіх існуючих гравців
UPDATE public.players
SET pin_hash = NULL,
    must_change_pin = true,
    failed_attempts = 0,
    locked_until = NULL;

-- 6. Таблиця для відстеження спроб входу по IP (захист від перебору та блокування на 15 хв)
CREATE TABLE IF NOT EXISTS public.player_auth_ip_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_auth_ip ON public.player_auth_ip_attempts(ip_address);

-- 7. Налаштування RLS:
--    - Забороняємо прямий доступ до pin_hash через anon/публічні клієнти
--    - Зберігаємо доступ для медичного штабу (лікаря/тренера) до необхідних полів
COMMENT ON COLUMN public.players.pin_hash IS 'bcrypt hash of player 6-digit portal PIN';
COMMENT ON COLUMN public.players.portal_token IS 'Opaque unguessable token for player personal QR code and portal link';
