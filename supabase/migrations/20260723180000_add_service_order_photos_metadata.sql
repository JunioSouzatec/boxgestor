-- =============================================================================
-- BoxGestor — RC2 Fase 1A: metadados extras em service_order_photos
-- Migration ADITIVA e idempotente. NÃO remove dados, colunas, policies nem Storage.
--
-- Objetivo:
--   Preparar colunas para fotos de OS/checklist (vínculo opcional ao item,
--   auditoria, soft delete, idempotência offline via local_id).
--
-- Pré-requisito (já existente no schema):
--   public.service_order_photos (id, office_id, service_order_id, storage_path,
--   public_url, caption, photo_type, sort_order, created_at, updated_at)
--
-- NÃO faz nesta migration:
--   • criar bucket Storage
--   • alterar RLS/policies
--   • DROP / TRUNCATE / recriar tabela
--   • constraint rígida em photo_type
-- =============================================================================

ALTER TABLE public.service_order_photos
  ADD COLUMN IF NOT EXISTS checklist_item_id TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS local_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Índices de leitura (idempotentes). office_id e service_order_id já têm índices simples.
CREATE INDEX IF NOT EXISTS idx_service_order_photos_office_order
  ON public.service_order_photos (office_id, service_order_id);

CREATE INDEX IF NOT EXISTS idx_service_order_photos_deleted_at
  ON public.service_order_photos (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Upsert/idempotência por id local (fila offline futura).
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_order_photos_office_local_unique
  ON public.service_order_photos (office_id, local_id)
  WHERE local_id IS NOT NULL AND trim(local_id) <> '';

COMMENT ON COLUMN public.service_order_photos.checklist_item_id IS
  'Item do checklist (snapshot item_id) opcional — null = foto geral da OS.';
COMMENT ON COLUMN public.service_order_photos.created_by IS
  'profiles.id (= auth.uid()) de quem anexou a foto.';
COMMENT ON COLUMN public.service_order_photos.deleted_at IS
  'Soft delete — Storage não é removido na v1.';
COMMENT ON COLUMN public.service_order_photos.local_id IS
  'Id estável do cliente para reenvio/idempotência offline.';
COMMENT ON COLUMN public.service_order_photos.metadata IS
  'Metadados opcionais (mime, width, height, device, etc.).';
