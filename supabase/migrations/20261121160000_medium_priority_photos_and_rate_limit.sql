-- ==============================================================================
-- Migration: 20261121160000_medium_priority_photos_and_rate_limit.sql
-- Description: Середній пріоритет аудиту — приватний Storage-бакет для фото
--              гравців (players.photo_url + player-photos) та унікальний індекс
--              для персистентного rate-limit (player_auth_ip_attempts).
-- ==============================================================================

-- 1. Колонка photo_url у таблиці players (посилання на Storage або HTTPS URL)
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS photo_url text;

-- 2. Приватний бакет Storage для фото профілів гравців
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'player-photos',
  'player-photos',
  false,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 3. RLS-політики Storage для бакета player-photos з ізоляцією по club_id
DROP POLICY IF EXISTS "player_photos_select_club_staff" ON storage.objects;
CREATE POLICY "player_photos_select_club_staff"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'player-photos'
    AND public.user_belongs_to_club(public.storage_object_club_id(name))
  );

DROP POLICY IF EXISTS "player_photos_insert_doctor_admin" ON storage.objects;
CREATE POLICY "player_photos_insert_doctor_admin"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'player-photos'
    AND public.has_club_role(public.storage_object_club_id(name), ARRAY['doctor', 'admin'])
  );

DROP POLICY IF EXISTS "player_photos_update_doctor_admin" ON storage.objects;
CREATE POLICY "player_photos_update_doctor_admin"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'player-photos'
    AND public.has_club_role(public.storage_object_club_id(name), ARRAY['doctor', 'admin'])
  )
  WITH CHECK (
    bucket_id = 'player-photos'
    AND public.has_club_role(public.storage_object_club_id(name), ARRAY['doctor', 'admin'])
  );

DROP POLICY IF EXISTS "player_photos_delete_doctor_admin" ON storage.objects;
CREATE POLICY "player_photos_delete_doctor_admin"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'player-photos'
    AND public.has_club_role(public.storage_object_club_id(name), ARRAY['doctor', 'admin'])
  );

-- 4. Гарантована схема та дедуплікація/унікальний індекс у player_auth_ip_attempts (ідемпотентно)
CREATE TABLE IF NOT EXISTS public.player_auth_ip_attempts (
  ip_address text PRIMARY KEY,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.player_auth_ip_attempts
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF to_regclass('public.player_auth_ip_attempts') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.player_auth_ip_attempts WHERE ip_address IS NULL';

    EXECUTE $sql$
      DELETE FROM public.player_auth_ip_attempts a
      USING public.player_auth_ip_attempts b
      WHERE a.ip_address = b.ip_address
        AND (
          a.updated_at < b.updated_at
          OR (a.updated_at = b.updated_at AND a.ctid < b.ctid)
        )
    $sql$;

    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_player_auth_ip_attempts_unique_ip ON public.player_auth_ip_attempts (ip_address)';
  END IF;
END $$;
