-- =====================================================================
-- 20261017150000_player_archive_and_safe_delete.sql
-- 1.6 Архів замість видалення гравця
-- =====================================================================

-- 1. Додаємо поля архівації до таблиці players
alter table public.players
  add column if not exists archived_at timestamptz default null,
  add column if not exists archive_reason text default null;

comment on column public.players.archived_at is 'Час перенесення картки гравця в архів. Якщо NULL — гравець активний.';
comment on column public.players.archive_reason is 'Причина архівації (завершення контракту, перехід, завершення кар''єри, тощо).';

-- 2. Створюємо індекс для швидкої вибірки активних гравців
create index if not exists idx_players_club_archived on public.players (club_id, archived_at);

-- 3. Оновлюємо представлення coach_player_availability_view:
--    Архівні гравці мають бути ПОВНІСТЮ приховані від тренерів (брифінг, доступність, матчевий протокол).
create or replace view public.coach_player_availability_view
with (security_barrier = true) as
select
  p.club_id,
  p.team_id,
  t.name as team_name,
  t.category as team_category,
  t.sort_order as team_sort_order,
  p.id as player_id,
  p.first_name,
  p.last_name,
  p.position,
  p.date_of_birth,
  case
    when active_inj.id is not null then 'unavailable'
    when rehab_inj.id is not null then 'restricted'
    else 'available'
  end as availability_status,
  case
    when active_inj.id is not null then 0
    when rehab_inj.id is not null then 45
    else 90
  end as max_minutes,
  case
    when active_inj.id is not null then 'Повний спокій / лазарет. Не допущений до тренувань та матчів.'
    when rehab_inj.id is not null then 'Реабілітаційний режим: ліміт 45 хв, безконтактні вправи.'
    else 'Повний допуск без обмежень'
  end as restriction_notes,
  coalesce(active_inj.days_missed, rehab_inj.days_missed) as days_missed,
  coalesce(active_inj.expected_return_date, rehab_inj.expected_return_date) as expected_return_date,
  coalesce(well.readiness_status, 'optimal') as wellness_readiness
from public.players p
join public.teams t on p.team_id = t.id
left join lateral (
  select
    inj.id,
    inj.expected_return_date,
    (current_date - inj.date_of_injury::date) as days_missed
  from public.injuries inj
  where inj.player_id = p.id
    and inj.status = 'active'
  order by inj.date_of_injury desc
  limit 1
) active_inj on true
left join lateral (
  select
    inj.id,
    inj.expected_return_date,
    (current_date - inj.date_of_injury::date) as days_missed
  from public.injuries inj
  where inj.player_id = p.id
    and inj.status = 'rehabilitation'
  order by inj.date_of_injury desc
  limit 1
) rehab_inj on true
left join lateral (
  select ws.readiness_status
  from public.wellness_surveys ws
  where ws.player_id = p.id
  order by ws.date desc
  limit 1
) well on true
where p.archived_at is null;

comment on view public.coach_player_availability_view is
  'Безпечне представлення доступності гравців для тренерського штабу без медичних діагнозів. Виключає архівних гравців.';

grant select on public.coach_player_availability_view to authenticated;
