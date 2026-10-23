-- ==============================================================================
-- Migration: 20261023130000_injury_attachments.sql
-- Description: Вкладення до травми (МРТ, УЗД, рентген, виписки) з приватним
--              бакетом 'injury-documents', RLS (тільки doctor/admin),
--              soft-delete архівуванням та аудитом.
-- ==============================================================================

-- 1. Створення таблиці вкладень
CREATE TABLE IF NOT EXISTS public.injury_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  injury_id uuid NOT NULL REFERENCES public.injuries(id) ON DELETE CASCADE,
  file_type text NOT NULL CHECK (file_type IN ('mri', 'ultrasound', 'xray', 'conclusion', 'other')),
  file_name text NOT NULL,
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 20971520), -- макс 20 МБ
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  storage_path text NOT NULL UNIQUE,
  examination_date date NOT NULL DEFAULT CURRENT_DATE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text NOT NULL DEFAULT 'Медичний персонал',
  facility text,
  notes text,
  is_archived boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Коментарі
COMMENT ON TABLE public.injury_attachments IS 'Клінічні вкладення (МРТ, УЗД, рентген, висновки) до травм гравців';
COMMENT ON COLUMN public.injury_attachments.storage_path IS 'Шлях у приватному бакеті: club_id/player_id/injury_id/file_id_name';
COMMENT ON COLUMN public.injury_attachments.is_archived IS 'Soft-delete прапорець: переміщення в архів замість фізичного видалення';

-- Індекси
CREATE INDEX IF NOT EXISTS idx_injury_attachments_injury_id ON public.injury_attachments(injury_id);
CREATE INDEX IF NOT EXISTS idx_injury_attachments_player_id ON public.injury_attachments(player_id);
CREATE INDEX IF NOT EXISTS idx_injury_attachments_club_id ON public.injury_attachments(club_id);
CREATE INDEX IF NOT EXISTS idx_injury_attachments_active ON public.injury_attachments(injury_id, is_archived);

-- 2. RLS політики: ТІЛЬКИ doctor та admin мають доступ до медичних файлів
ALTER TABLE public.injury_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "injury_attachments_select_doctor_admin"
  ON public.injury_attachments
  FOR SELECT
  TO authenticated
  USING (
    club_id IN (SELECT public.get_user_club_ids())
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  );

CREATE POLICY "injury_attachments_insert_doctor_admin"
  ON public.injury_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    club_id IN (SELECT public.get_user_club_ids())
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  );

CREATE POLICY "injury_attachments_update_doctor_admin"
  ON public.injury_attachments
  FOR UPDATE
  TO authenticated
  USING (
    club_id IN (SELECT public.get_user_club_ids())
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  )
  WITH CHECK (
    club_id IN (SELECT public.get_user_club_ids())
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  );

-- 3. Приватний бакет у storage.buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'injury-documents',
  'injury-documents',
  false,
  20971520, -- 20 MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png'];

-- 4. Storage RLS політики для бакета 'injury-documents'
CREATE POLICY "injury_documents_select_doctor_admin"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'injury-documents'
    AND (
      -- Перший сегмент шляху це club_id
      (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_club_ids())
      AND public.has_club_role((storage.foldername(name))[1]::uuid, ARRAY['doctor', 'admin'])
    )
  );

CREATE POLICY "injury_documents_insert_doctor_admin"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'injury-documents'
    AND (
      (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_club_ids())
      AND public.has_club_role((storage.foldername(name))[1]::uuid, ARRAY['doctor', 'admin'])
    )
  );

CREATE POLICY "injury_documents_update_doctor_admin"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'injury-documents'
    AND (
      (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_club_ids())
      AND public.has_club_role((storage.foldername(name))[1]::uuid, ARRAY['doctor', 'admin'])
    )
  );
