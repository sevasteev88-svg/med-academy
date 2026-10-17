-- =====================================================================
-- 20261017130000_audit_log.sql
-- 1.3 Журнал дій (audit_log)
-- =====================================================================

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
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
comment on column public.audit_log.action is 'Тип дії: view_player, create_injury, update_injury, delete_injury, add_exam, save_screening, prescribe_treatment, reset_pin, export_pdf, ai_call, etc.';
comment on column public.audit_log.entity is 'Сутність: player, injury, examination, screening, pharmacy, ai, report, auth';
comment on column public.audit_log.meta is 'Метадані події БЕЗ медичного вмісту (без діагнозів, оглядів, тексту промптів до ШІ)';

-- Індекси для швидкого пошуку і фільтрів адміном
create index if not exists idx_audit_log_club_at on public.audit_log (club_id, at desc);
create index if not exists idx_audit_log_player on public.audit_log (player_id, at desc);
create index if not exists idx_audit_log_user on public.audit_log (user_id, at desc);
create index if not exists idx_audit_log_action on public.audit_log (action);
create index if not exists idx_audit_log_entity on public.audit_log (entity, entity_id);

-- RLS політики:
-- 1. Тільки INSERT для будь-якого автентифікованого користувача свого клубу.
-- 2. Тільки SELECT для admin (і тільки записів свого клубу).
-- 3. Ніяких UPDATE або DELETE (записи незмінні).
alter table public.audit_log enable row level security;

drop policy if exists "audit_log_insert" on public.audit_log;
create policy "audit_log_insert"
  on public.audit_log
  for insert
  to authenticated
  with check (
    club_id = public.current_user_club_id()
  );

drop policy if exists "audit_log_select_admin" on public.audit_log;
create policy "audit_log_select_admin"
  on public.audit_log
  for select
  to authenticated
  using (
    club_id = public.current_user_club_id()
    and public.current_user_role() = 'admin'
  );

-- Для надійності: тригер, що повністю забороняє UPDATE та DELETE на рівні бази даних
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
