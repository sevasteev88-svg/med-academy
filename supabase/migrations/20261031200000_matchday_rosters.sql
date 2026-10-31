-- ==============================================================================
-- Migration: 20261031200000_matchday_rosters.sql
-- Description: Створення таблиці match_rosters для інтерактивного Конструктора заявки
--              на матч з медичним «захистом від дурака» (стартовий склад, запас, номери, тактика)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.match_rosters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  team_name text NOT NULL,
  match_date date NOT NULL DEFAULT CURRENT_DATE,
  opponent text NOT NULL,
  location text,
  formation text DEFAULT '4-3-3',
  starters jsonb NOT NULL DEFAULT '[]'::jsonb,
  substitutes jsonb NOT NULL DEFAULT '[]'::jsonb,
  tactical_notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_rosters_club ON public.match_rosters(club_id);
CREATE INDEX IF NOT EXISTS idx_match_rosters_team_date ON public.match_rosters(team_name, match_date DESC);

-- RLS
ALTER TABLE public.match_rosters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "match_rosters_select_member" ON public.match_rosters;
CREATE POLICY "match_rosters_select_member" ON public.match_rosters
  FOR SELECT
  USING (
    club_id IN (
      SELECT club_id FROM public.club_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "match_rosters_write_staff" ON public.match_rosters;
CREATE POLICY "match_rosters_write_staff" ON public.match_rosters
  FOR ALL
  USING (
    club_id IN (
      SELECT club_id FROM public.club_members
      WHERE user_id = auth.uid()
        AND role IN ('doctor', 'coach', 'admin')
    )
  )
  WITH CHECK (
    club_id IN (
      SELECT club_id FROM public.club_members
      WHERE user_id = auth.uid()
        AND role IN ('doctor', 'coach', 'admin')
    )
  );
