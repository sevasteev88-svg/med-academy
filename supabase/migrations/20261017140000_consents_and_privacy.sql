-- ==============================================================================
-- Migration: 20261017140000_consents_and_privacy.sql
-- Description: 1.4 Згоди батьків та політика конфіденційності
--              (guardians, consent_documents, consents, consent_requests,
--               приватний bucket consent_scans, RLS, тригери незмінності версій).
--
-- УВАГА: Міграцію ТІЛЬКИ СТВОРЕНО, НЕ ЗАСТОСОВАНО автоматично.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ТАБЛИЦЯ ЗАКОННИХ ПРЕДСТАВНИКІВ (guardians)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  relation text NOT NULL, -- напр. 'mother', 'father', 'guardian', 'other'
  phone text NOT NULL,
  email text,
  telegram_chat_id text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.guardians IS 'Законні представники (батьки / опікуни) гравців клубу';
COMMENT ON COLUMN public.guardians.relation IS 'Ступінь спорідненості: мати, батько, опікун тощо';

CREATE INDEX IF NOT EXISTS idx_guardians_club_id ON public.guardians(club_id);
CREATE INDEX IF NOT EXISTS idx_guardians_player_id ON public.guardians(player_id);

-- ------------------------------------------------------------------------------
-- 2. ТАБЛИЦЯ ВЕРСІЙ ДОКУМЕНТІВ ЗГОДИ (consent_documents)
--    Текст версії не змінюється; зміна тексту = нова версія.
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.consent_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('data_processing', 'ai_processing', 'wearables', 'supplements', 'gps', 'photo')),
  version text NOT NULL,
  title text NOT NULL,
  body_markdown text NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_consent_documents_club_scope_version UNIQUE (club_id, scope, version)
);

COMMENT ON TABLE public.consent_documents IS 'Версії документів згоди по кожній області (scope). Текст версії незмінний.';

CREATE INDEX IF NOT EXISTS idx_consent_documents_club_scope ON public.consent_documents(club_id, scope, is_active);

-- Тригер: заборона зміни тексту (body_markdown, title, version, scope) існуючої версії
CREATE OR REPLACE FUNCTION public.prevent_consent_document_content_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.body_markdown IS DISTINCT FROM NEW.body_markdown
     OR OLD.title IS DISTINCT FROM NEW.title
     OR OLD.version IS DISTINCT FROM NEW.version
     OR OLD.scope IS DISTINCT FROM NEW.scope
     OR OLD.club_id IS DISTINCT FROM NEW.club_id THEN
    RAISE EXCEPTION 'Текст та параметри існуючої версії документа згоди не можуть бути змінені. Створіть нову версію.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_consent_document_mutation ON public.consent_documents;
CREATE TRIGGER trg_prevent_consent_document_mutation
  BEFORE UPDATE ON public.consent_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_consent_document_content_mutation();

-- Тригер: при створенні або активації нової версії автоматично деактивувати попередні активні версії цієї ж області
CREATE OR REPLACE FUNCTION public.deactivate_previous_consent_documents()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE public.consent_documents
    SET is_active = false
    WHERE club_id = NEW.club_id
      AND scope = NEW.scope
      AND id <> NEW.id
      AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deactivate_previous_consent_documents ON public.consent_documents;
CREATE TRIGGER trg_deactivate_previous_consent_documents
  AFTER INSERT OR UPDATE OF is_active ON public.consent_documents
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION public.deactivate_previous_consent_documents();

-- ------------------------------------------------------------------------------
-- 3. ТАБЛИЦЯ ЗГОД (consents)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  guardian_id uuid REFERENCES public.guardians(id) ON DELETE SET NULL,
  scope text NOT NULL CHECK (scope IN ('data_processing', 'ai_processing', 'wearables', 'supplements', 'gps', 'photo')),
  document_id uuid NOT NULL REFERENCES public.consent_documents(id) ON DELETE RESTRICT,
  method text NOT NULL CHECK (method IN ('link_otp', 'paper', 'e_signature', 'adult_self')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  scan_path text,
  collected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  player_assent boolean NOT NULL DEFAULT false,
  player_assent_at timestamptz,
  retention_status text CHECK (retention_status IN ('active', 'marked_for_deletion', 'marked_for_anonymization')),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.consents IS 'Записи про надані та відкликані згоди законних представників або повнолітніх гравців';
COMMENT ON COLUMN public.consents.evidence IS 'Доказова база: IP, User-Agent, факт перевірки OTP, ПІБ підписанта, ступінь спорідненості, номер документа';
COMMENT ON COLUMN public.consents.player_assent IS 'Відмітка «Гравець ознайомлений» (assent) для гравців 14–17 років';

CREATE INDEX IF NOT EXISTS idx_consents_player_scope ON public.consents(player_id, scope);
CREATE INDEX IF NOT EXISTS idx_consents_club_id ON public.consents(club_id);
CREATE INDEX IF NOT EXISTS idx_consents_document_id ON public.consents(document_id);

-- ------------------------------------------------------------------------------
-- 4. ТАБЛИЦЯ ЗАПИТІВ НА ЗГОДУ (consent_requests)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.consent_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  guardian_id uuid REFERENCES public.guardians(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['data_processing', 'ai_processing', 'wearables', 'supplements', 'gps', 'photo']::text[],
  channel text NOT NULL CHECK (channel IN ('sms', 'telegram', 'email', 'manual')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  otp_hash text,
  otp_expires_at timestamptz,
  otp_attempts integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.consent_requests IS 'Одноразові запити на отримання згоди (128-бітний токен у вигляді SHA-256 хешу, термін 7 днів та OTP-підтвердження)';

CREATE INDEX IF NOT EXISTS idx_consent_requests_player ON public.consent_requests(player_id);
CREATE INDEX IF NOT EXISTS idx_consent_requests_token_hash ON public.consent_requests(token_hash);

-- ------------------------------------------------------------------------------
-- 5. ДОДАТКОВІ ПОЛЯ В players ДЛЯ ОЗНАЙОМЛЕННЯ 14-17 РОКІВ (assent) ТА audit_log
-- ------------------------------------------------------------------------------

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS assent_acknowledged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assent_acknowledged_at timestamptz;

COMMENT ON COLUMN public.players.assent_acknowledged IS 'Відмітка «Гравець ознайомлений» для гравців 14–17 років (не замінює згоду батьків)';

-- Дозволяємо nullable user_id в audit_log для публічних подій згоди/відкликання батьками по токену
ALTER TABLE public.audit_log ALTER COLUMN user_id DROP NOT NULL;

-- ------------------------------------------------------------------------------
-- 6. АВТОМАТИЧНЕ ЗАПОВНЕННЯ club_id ТРИГЕРОМ auto_set_club_id
-- ------------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_guardians_club_id ON public.guardians;
CREATE TRIGGER trg_guardians_club_id BEFORE INSERT ON public.guardians FOR EACH ROW EXECUTE FUNCTION public.auto_set_club_id();

DROP TRIGGER IF EXISTS trg_consent_documents_club_id ON public.consent_documents;
CREATE TRIGGER trg_consent_documents_club_id BEFORE INSERT ON public.consent_documents FOR EACH ROW EXECUTE FUNCTION public.auto_set_club_id();

DROP TRIGGER IF EXISTS trg_consents_club_id ON public.consents;
CREATE TRIGGER trg_consents_club_id BEFORE INSERT ON public.consents FOR EACH ROW EXECUTE FUNCTION public.auto_set_club_id();

DROP TRIGGER IF EXISTS trg_consent_requests_club_id ON public.consent_requests;
CREATE TRIGGER trg_consent_requests_club_id BEFORE INSERT ON public.consent_requests FOR EACH ROW EXECUTE FUNCTION public.auto_set_club_id();

-- ------------------------------------------------------------------------------
-- 7. НАЛАШТУВАННЯ ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------------------------

ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_requests ENABLE ROW LEVEL SECURITY;

-- guardians: читання та зміна для doctor та admin клубу
DROP POLICY IF EXISTS "guardians_doctor_admin" ON public.guardians;
CREATE POLICY "guardians_doctor_admin" ON public.guardians
  FOR ALL TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']))
  WITH CHECK (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

-- consent_documents: читання всім учасникам клубу, створення нових версій — admin або doctor
DROP POLICY IF EXISTS "consent_documents_select" ON public.consent_documents;
CREATE POLICY "consent_documents_select" ON public.consent_documents
  FOR SELECT TO authenticated
  USING (public.is_club_member(club_id));

DROP POLICY IF EXISTS "consent_documents_mutation" ON public.consent_documents;
CREATE POLICY "consent_documents_mutation" ON public.consent_documents
  FOR ALL TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']))
  WITH CHECK (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

-- consents: читання всім учасникам клубу (щоб hasConsent працював), запис/зміна — doctor та admin
DROP POLICY IF EXISTS "consents_select_member" ON public.consents;
CREATE POLICY "consents_select_member" ON public.consents
  FOR SELECT TO authenticated
  USING (public.is_club_member(club_id));

DROP POLICY IF EXISTS "consents_mutation_doctor_admin" ON public.consents;
CREATE POLICY "consents_mutation_doctor_admin" ON public.consents
  FOR ALL TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']))
  WITH CHECK (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

-- consent_requests: доступ для doctor та admin клубу
DROP POLICY IF EXISTS "consent_requests_doctor_admin" ON public.consent_requests;
CREATE POLICY "consent_requests_doctor_admin" ON public.consent_requests
  FOR ALL TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']))
  WITH CHECK (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

-- ------------------------------------------------------------------------------
-- 8. ПРИВАТНИЙ BUCKET ДЛЯ СКАНІВ ПАПЕРОВИХ ФОРМ (consent_scans)
--    Доступ виключно для ролей 'doctor' та 'admin'
-- ------------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'consent_scans',
  'consent_scans',
  false,
  10485760, -- 10 MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = false;

DROP POLICY IF EXISTS "consent_scans_select_doctor_admin" ON storage.objects;
CREATE POLICY "consent_scans_select_doctor_admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'consent_scans'
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid() AND cm.role IN ('doctor', 'admin')
    )
  );

DROP POLICY IF EXISTS "consent_scans_insert_doctor_admin" ON storage.objects;
CREATE POLICY "consent_scans_insert_doctor_admin" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'consent_scans'
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid() AND cm.role IN ('doctor', 'admin')
    )
  );

-- ------------------------------------------------------------------------------
-- 9. SEEDING БАЗОВИХ ШАБЛОНІВ ДОКУМЕНТІВ ЗГОДИ УКРАЇНСЬКОЮ МОВОЮ (v1.0)
--    Кожен шаблон позначений «шаблон, потребує перевірки юристом»
-- ------------------------------------------------------------------------------

DO $$
DECLARE
  v_club_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  INSERT INTO public.consent_documents (club_id, scope, version, title, body_markdown, is_active)
  VALUES
  (
    v_club_id,
    'data_processing',
    '1.0',
    'Згода на базову обробку персональних та медичних даних спортсмена',
    '⚠️ **ШАБЛОН, ПОТРЕБУЄ ПЕРЕВІРКИ ЮРИСТОМ**\n\n' ||
    '### 1. Хто обробляє дані (Володілець даних)\nФутбольний клуб / Академія (далі — Клуб) та уповноважений медичний штаб Клубу.\n\n' ||
    '### 2. Які дані обробляються\nПрізвище, ім''я, по батькові, дата народження, антропометричні показники, дані клінічних оглядів, інформація про спортивні травми та реабілітацію.\n\n' ||
    '### 3. Мета обробки (Навіщо)\nЗабезпечення медичного супроводу спортсмена, допуск до тренувань та змагань, профілактика травматизму та безпечне повернення до гри (Return-to-Play).\n\n' ||
    '### 4. Строк зберігання\nПротягом усього періоду перебування спортсмена в Клубі та протягом строку, визначеного законодавством України для первинної медичної документації після завершення виступів.\n\n' ||
    '### 5. Права суб''єкта даних та законного представника\nПраво на доступ до даних, виправлення неточностей, обмеження обробки, отримання копії даних та відкликання згоди.\n\n' ||
    '### 6. Як відкликати згоду\nЧерез персональне посилання «Мої згоди» з підтвердженням одноразовим кодом (OTP) або шляхом подання письмової заяви до медичного департаменту Клубу.\n\n' ||
    '### 7. Контакти\nМедичний департамент та відповідальна особа з питань захисту даних Клубу (privacy@club-academy.ua).',
    true
  ),
  (
    v_club_id,
    'ai_processing',
    '1.0',
    'Згода на використання систем штучного інтелекту (ШІ) для аналізу спортивно-медичних показників',
    '⚠️ **ШАБЛОН, ПОТРЕБУЄ ПЕРЕВІРКИ ЮРИСТОМ**\n\n' ||
    '### 1. Хто обробляє дані\nМедичний штаб Клубу із залученням захищених хмарних сервісів аналітики штучного інтелекту (Google Gemini API / Anthropic Claude API).\n\n' ||
    '### 2. Які дані обробляються\nЗнеособлені або структуровані показники віку, фази росту (PHV), біометрії, локалізації травм та навантажень.\n\n' ||
    '### 3. Мета обробки (Навіщо)\nФормування допоміжних рекомендацій для спортивного лікаря щодо індивідуального прехабу, оцінки ризиків рецидиву та планування відновлення. Остаточне рішення завжди приймає лікар.\n\n' ||
    '### 4. Строк зберігання\nПротягом строку дії згоди; при відкликанні згоди функція ШІ-аналізу негайно вимикається.\n\n' ||
    '### 5. Права суб''єкта даних\nВідмова від автоматизованої обробки у будь-який момент без жодного впливу на базове медичне обслуговування в Клубі.\n\n' ||
    '### 6. Як відкликати згоду\nНа сторінці «Мої згоди» за допомогою OTP-коду або через звернення до лікаря чи адміністратора Клубу.\n\n' ||
    '### 7. Контакти\nМедичний департамент Клубу (privacy@club-academy.ua).',
    true
  ),
  (
    v_club_id,
    'wearables',
    '1.0',
    'Згода на збір та обробку біометричних даних із носимих пристроїв (Wearables)',
    '⚠️ **ШАБЛОН, ПОТРЕБУЄ ПЕРЕВІРКИ ЮРИСТОМ**\n\n' ||
    '### 1. Хто обробляє дані\nМедичний штаб та фахівці з фізичної підготовки Клубу.\n\n' ||
    '### 2. Які дані обробляються\nПоказники варіабельності серцевого ритму (HRV RMSSD), пульсу у спокої (RHR), тривалості та ефективності сну, індексу відновлення (Recovery Score) з пристроїв WHOOP, Apple Watch, Garmin, Oura.\n\n' ||
    '### 3. Мета обробки (Навіщо)\nМоніторинг відновлення вегетативної нервової системи та попередження перетренованості й безконтактних м''язових травм.\n\n' ||
    '### 4. Строк зберігання\nПротягом спортивного сезону або до моменту відкликання згоди законним представником чи гравцем.\n\n' ||
    '### 5. Права суб''єкта даних\nПерегляд зібраних показників, вимога видалення або знеособлення історії біометрії при відкликанні згоди.\n\n' ||
    '### 6. Як відкликати згоду\nПеремикачем у кабінеті «Мої згоди» (після перевірки OTP) або за письмовою заявою.\n\n' ||
    '### 7. Контакти\nМедичний департамент Клубу (privacy@club-academy.ua).',
    true
  ),
  (
    v_club_id,
    'supplements',
    '1.0',
    'Згода на призначення та облік спортивних добавок (нутрицевтиків)',
    '⚠️ **ШАБЛОН, ПОТРЕБУЄ ПЕРЕВІРКИ ЮРИСТОМ**\n\n' ||
    '### 1. Хто обробляє дані\nСпортивний лікар та нутриціолог Клубу.\n\n' ||
    '### 2. Які дані обробляються\nВідомості про харчові алергії, тип дієти, стоматологічний статус та протокол дозволених WADA спортивних добавок (вітаміни, колаген, протеїн, омега-3, препарати заліза).\n\n' ||
    '### 3. Мета обробки (Навіщо)\nБезпечна нутриціологічна підтримка організму в період росту та підвищених фізичних навантажень, виключення алергічних реакцій.\n\n' ||
    '### 4. Строк зберігання\nНа період дії контракту / навчання в Академії Клубу або до відкликання згоди.\n\n' ||
    '### 5. Права суб''єкта даних\nОтримання повної інформації про склад нутрицевтиків, право у будь-який момент припинити програму суплементації.\n\n' ||
    '### 6. Як відкликати згоду\nНа сторінці «Мої згоди» (підтвердження по SMS OTP) або через медичний штаб Клубу.\n\n' ||
    '### 7. Контакти\nМедичний департамент Клубу (privacy@club-academy.ua).',
    true
  ),
  (
    v_club_id,
    'gps',
    '1.0',
    'Згода на GPS-трекінг та моніторинг зовнішнього тренувального навантаження',
    '⚠️ **ШАБЛОН, ПОТРЕБУЄ ПЕРЕВІРКИ ЮРИСТОМ**\n\n' ||
    '### 1. Хто обробляє дані\nТренерський та медичний штаб Клубу.\n\n' ||
    '### 2. Які дані обробляються\nДані GPS-датчиків під час тренувань і матчів (дистанція, швидкісні спринти, прискорення, гальмування, оцінка RPE та тренувальне навантаження в умовних одиницях AU).\n\n' ||
    '### 3. Мета обробки (Навіщо)\nКонтроль гострого та хронічного навантаження (ACWR) для запобігання перевантаженню зон росту у юних футболістів.\n\n' ||
    '### 4. Строк зберігання\nПротягом навчання в Академії або до моменту відкликання згоди.\n\n' ||
    '### 5. Права суб''єкта даних\nДоступ до звітів навантаження, право відкликати згоду з видаленням або знеособленням GPS-треків.\n\n' ||
    '### 6. Як відкликати згоду\nЧерез посилання «Мої згоди» з OTP-підтвердженням або письмовим зверненням.\n\n' ||
    '### 7. Контакти\nМедичний департамент Клубу (privacy@club-academy.ua).',
    true
  ),
  (
    v_club_id,
    'photo',
    '1.0',
    'Згода на використання фотографії профілю та візуальних матеріалів у медичній картці',
    '⚠️ **ШАБЛОН, ПОТРЕБУЄ ПЕРЕВІРКИ ЮРИСТОМ**\n\n' ||
    '### 1. Хто обробляє дані\nМедичний та адміністративний штаб Клубу.\n\n' ||
    '### 2. Які дані обробляються\nПортретне фото профілю гравця у внутрішній системі медичного обліку Клубу.\n\n' ||
    '### 3. Мета обробки (Навіщо)\nШвидка візуальна ідентифікація спортсмена медичним персоналом під час оглядів, тестувань та формування заявки на матч.\n\n' ||
    '### 4. Строк зберігання\nДо моменту відкликання згоди або завершення виступів гравця за Клуб.\n\n' ||
    '### 5. Права суб''єкта даних\nПраво вимагати негайного видалення фотографії профілю без будь-яких обмежень для тренувального процесу.\n\n' ||
    '### 6. Як відкликати згоду\nНа сторінці «Мої згоди» (через OTP) або зверненням до адміністратора Клубу.\n\n' ||
    '### 7. Контакти\nМедичний департамент Клубу (privacy@club-academy.ua).',
    true
  )
  ON CONFLICT (club_id, scope, version) DO NOTHING;
END $$;
