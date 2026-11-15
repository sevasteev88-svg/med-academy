-- ==============================================================================
-- Migration: 20261114120000_parent_portal.sql
-- Description: Сімейний портал для батьків (Варіант А: персональні токени доступу
--              без паролів, повідомлення від батьків до лікаря, онбординг згод)
-- ==============================================================================

-- 1. Таблиця токенів сімейного доступу (зберігається лише sha256-хеш токена)
CREATE TABLE IF NOT EXISTS public.parent_portal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  guardian_id uuid REFERENCES public.guardians(id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT 'Сімейний доступ',
  is_active boolean NOT NULL DEFAULT true,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parent_portal_tokens_player ON public.parent_portal_tokens(player_id, is_active);
CREATE INDEX IF NOT EXISTS idx_parent_portal_tokens_club ON public.parent_portal_tokens(club_id);

-- 2. Таблиця повідомлень від батьків (температура/хвороба вдома, травма поза клубом, ЛФК виконано)
CREATE TABLE IF NOT EXISTS public.parent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  token_id uuid REFERENCES public.parent_portal_tokens(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('illness', 'home_injury', 'absence', 'question', 'lfk_done')),
  message text NOT NULL,
  is_read_by_staff boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parent_messages_player ON public.parent_messages(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parent_messages_club ON public.parent_messages(club_id, is_read_by_staff);

-- 3. RLS політики (публічний доступ по токену йде через server actions з валідацією хешу)
ALTER TABLE public.parent_portal_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parent_portal_tokens_club_staff" ON public.parent_portal_tokens;
CREATE POLICY "parent_portal_tokens_club_staff" ON public.parent_portal_tokens
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

DROP POLICY IF EXISTS "parent_messages_club_staff" ON public.parent_messages;
CREATE POLICY "parent_messages_club_staff" ON public.parent_messages
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
