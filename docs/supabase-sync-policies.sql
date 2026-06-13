-- =============================================================================
-- Craft Oficina — Políticas RLS temporárias para sincronização manual (fase MVP)
-- Execute APÓS docs/supabase-schema.sql, antes de usar "Sincronizar dados locais"
-- =============================================================================
--
-- Contexto:
-- - O schema principal habilita RLS sem políticas ativas (anon não consegue INSERT).
-- - Este arquivo libera anon apenas nas tabelas da fase 1 da sync manual.
-- - Usa apenas a chave anon public no frontend (sem service_role).
--
-- IMPORTANTE: Remova ou substitua estas políticas quando o login real estiver ativo.
-- =============================================================================

-- Oficina
DROP POLICY IF EXISTS "sync_mvp_offices" ON public.offices;
CREATE POLICY "sync_mvp_offices" ON public.offices
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

-- Preferências / número da próxima OS
DROP POLICY IF EXISTS "sync_mvp_settings" ON public.settings;
CREATE POLICY "sync_mvp_settings" ON public.settings
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

-- Clientes
DROP POLICY IF EXISTS "sync_mvp_customers" ON public.customers;
CREATE POLICY "sync_mvp_customers" ON public.customers
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

-- Motos
DROP POLICY IF EXISTS "sync_mvp_motorcycles" ON public.motorcycles;
CREATE POLICY "sync_mvp_motorcycles" ON public.motorcycles
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

-- Ordens de serviço
DROP POLICY IF EXISTS "sync_mvp_service_orders" ON public.service_orders;
CREATE POLICY "sync_mvp_service_orders" ON public.service_orders
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

-- Leitura anon (teste de conexão consulta settings)
-- As políticas acima já cobrem SELECT; nenhuma ação extra necessária.
