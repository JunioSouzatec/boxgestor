-- =============================================================================
-- BoxGestor — RC2 Fase 1C.1: policies de Storage para fotos de OS
-- Migration IDEMPOTENTE. NÃO aplica sozinha — revisar e fazer db push depois.
--
-- Objetivo:
--   Isolar leitura/upload do bucket service-order-photos por office_id no path,
--   usando public.current_office_id() (já existente no projeto).
--
-- Path obrigatório (deve bater com o serviço):
--   offices/{office_id}/orders/{service_order_id}/{foto_id}.{ext}
--
-- PRÉ-REQUISITO MANUAL (NÃO feito por esta migration):
--   • Criar bucket privado "service-order-photos" no Dashboard Supabase
--     (public = false; MIME: image/jpeg, image/png, image/webp; limite ~5MB)
--
-- NÃO faz nesta migration:
--   • criar / alterar storage.buckets
--   • tornar bucket público
--   • policy de UPDATE em storage.objects
--   • policy de DELETE físico em storage.objects (v1)
--   • validação por papel / mecânico atribuído à OS (fase futura)
--
-- Soft delete:
--   Exclusão lógica fica em public.service_order_photos.deleted_at.
--   Arquivo no Storage permanece na v1.
-- =============================================================================

-- SELECT: autenticado lê só objetos da própria oficina (segmento 2 do path)
DROP POLICY IF EXISTS "sop_photos_select_office" ON storage.objects;
CREATE POLICY "sop_photos_select_office"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'service-order-photos'
    AND public.current_office_id() IS NOT NULL
    AND (storage.foldername(name))[1] = 'offices'
    AND (storage.foldername(name))[2] = public.current_office_id()::text
  );

-- INSERT: autenticado faz upload só sob o prefixo da própria oficina
DROP POLICY IF EXISTS "sop_photos_insert_office" ON storage.objects;
CREATE POLICY "sop_photos_insert_office"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'service-order-photos'
    AND public.current_office_id() IS NOT NULL
    AND (storage.foldername(name))[1] = 'offices'
    AND (storage.foldername(name))[2] = public.current_office_id()::text
  );

-- UPDATE / DELETE: intencionalmente ausentes na v1
-- (sem policy = negado por default com RLS ativo em storage.objects)
