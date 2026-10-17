-- =====================================================================
-- 20261017130000_audit_log.sql
-- 1.3 Журнал дій (audit_log)
-- =====================================================================

-- 1. Створюємо таблицю audit_log
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  entity text not null,
  entity_id text,
  player_id uuid references public.players(id) on delete set null,
  at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

-- Коментарі
comment on table public.audit_log is 'Журнал аудиту дій користувачів (audit log). Записи незмінні: дозволено лише insert.';
comment on column public.audit_log.action is 'Тип дії: view_player, create_injury, update_injury, delete_injury, add_examination, save_screening, prescribe_treatment, reset_pin, export_pdf, ai_call, etc.';
comment on column public.audit_log.entity is 'Сутність: player, injury, examination, screening, pharmacy, ai, report, auth';
comment on column public.audit_log.meta is 'Метадані події БЕЗ медичного вмісту (без діагнозів, оглядів, тексту промптів до ШІ)';

-- 2. Індекси для швидкого пошуку і фільтрів адміном
create index if not exists idx_audit_log_club_at on public.audit_log (club_id, at desc);
create index if not exists idx_audit_log_player on public.audit_log (player_id, at desc);
create index if not exists idx_audit_log_user on public.audit_log (user_id, at desc);
create index if not exists idx_audit_log_action on public.audit_log (action);
create index if not exists idx_audit_log_entity on public.audit_log (entity, entity_id);

-- 3. RLS політики:
alter table public.audit_log enable row level security;

-- Вставка дозволена будь-якому автентифікованому користувачу для свого запису
drop policy if exists "audit_log_insert" on public.audit_log;
create policy "audit_log_insert"
  on public.audit_log
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
  );

-- Перегляд дозволений тільки адміністраторам (admin)
-- Працює як з новою системою club_members, так і зі стандартною таблицею profiles
drop policy if exists "audit_log_select_admin" on public.audit_log;
create policy "audit_log_select_admin"
  on public.audit_log
  for select
  to authenticated
  using (
    -- Перевірка через profiles
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
    or
    -- Або перевірка через club_members (якщо таблиця існує)
    exists (
      select 1 from information_schema.tables where table_schema = 'public' and table_name = 'club_members'
    ) and exists (
      select 1 from public.club_members
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- 4. Заборона UPDATE та DELETE: незмінність записів
create or replace function public.prevent_audit_log_mutation()
returns trigger as $$
begin
  raise exception 'audit_log records are immutable and cannot be updated or deleted';
end;
$$ language plpgsql;

drop trigger if exists trg_prevent_audit_log_mutation on public.audit_log;
create trigger trg_prevent_audit_log_mutation
  before update or delete on public.audit_log
  for each row
  execute function public.prevent_audit_log_mutation();
