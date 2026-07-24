-- =============================================================================
-- BoxGestor — RC2 Fase 2.3.1: auditoria de ocultação + include_in_pdf
-- Migration ADITIVA e idempotente. NÃO aplica sozinha — revisar e fazer db push depois.
--
-- Objetivo:
--   Preparar colunas para:
--   • ocultar foto (soft delete) com auditoria;
--   • marcar quais fotos entram na impressão/PDF da OS.
--
-- Pré-requisitos:
--   • public.service_order_photos (base + migration 20260723180000)
--   • public.profiles(id UUID)
--   • deleted_at já existe (soft delete v1)
--
-- NÃO faz nesta migration:
--   • DELETE físico em Storage
--   • include_in_whatsapp
--   • alterar RLS/policies
--   • criar/alterar bucket
--   • DROP / TRUNCATE / recriar tabela
-- =============================================================================

ALTER TABLE public.service_order_photos
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_by_name TEXT,
  ADD COLUMN IF NOT EXISTS deleted_reason TEXT,
  ADD COLUMN IF NOT EXISTS include_in_pdf BOOLEAN NOT NULL DEFAULT false;

-- Fotos ativas marcadas para PDF (consulta por OS)
CREATE INDEX IF NOT EXISTS idx_service_order_photos_include_pdf
  ON public.service_order_photos (office_id, service_order_id)
  WHERE deleted_at IS NULL AND include_in_pdf = true;

COMMENT ON COLUMN public.service_order_photos.deleted_at IS
  'Soft delete / ocultação — arquivo permanece no Storage na v1 (sem DELETE físico).';
COMMENT ON COLUMN public.service_order_photos.deleted_by IS
  'profiles.id (= auth.uid()) de quem ocultou a foto.';
COMMENT ON COLUMN public.service_order_photos.deleted_by_name IS
  'Nome exibido de quem ocultou (auditoria legível).';
COMMENT ON COLUMN public.service_order_photos.deleted_reason IS
  'Motivo opcional da ocultação (ex.: foto ruim, duplicada).';
COMMENT ON COLUMN public.service_order_photos.include_in_pdf IS
  'Se true, a foto pode entrar na impressão/PDF da OS. Default false (PDF leve).';
