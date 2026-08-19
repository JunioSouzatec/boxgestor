-- RC2 Portal A3 — flag opt-in para fotos no Portal do Cliente
-- Somente coluna. NÃO altera Storage, bucket, RLS, include_in_pdf, dados de OS/caixa/financeiro.
--
-- Fotos existentes permanecem include_in_portal = false (default).
-- Portal NÃO usa include_in_pdf.

ALTER TABLE public.service_order_photos
  ADD COLUMN IF NOT EXISTS include_in_portal BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.service_order_photos.include_in_portal IS
  'Se true, a foto pode aparecer no Portal do Cliente (opt-in). Independente de include_in_pdf. Default false.';

CREATE INDEX IF NOT EXISTS idx_service_order_photos_include_portal
  ON public.service_order_photos (office_id, service_order_id)
  WHERE deleted_at IS NULL AND include_in_portal = true;
