-- =============================================================================
-- Craft Oficina — Correção RLS apenas para service_orders
-- Execute no SQL Editor do Supabase APÓS:
--   docs/supabase-schema.sql
--   docs/supabase-fix-rls-v2.sql
--
-- Corrige:
--   • INSERT/UPDATE bloqueados por políticas conflitantes (tenant_all, sync_mvp)
--   • UPSERT falhando no UPDATE quando office_id antigo estava errado (migração MVP)
--   • Validação de customer_id e motorcycle_id da mesma office_id
-- =============================================================================

-- Garantir função tenant (idempotente — não altera offices)
CREATE OR REPLACE FUNCTION public.current_office_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_office_id UUID;
  v_has_user_id BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'user_id'
  ) INTO v_has_user_id;

  IF v_has_user_id THEN
    SELECT p.office_id INTO v_office_id
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND COALESCE(p.active, TRUE) = TRUE
    LIMIT 1;
  ELSE
    SELECT p.office_id INTO v_office_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND COALESCE(p.active, TRUE) = TRUE
    LIMIT 1;
  END IF;

  RETURN v_office_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_office_id() TO authenticated;

-- Valida referências de OS (cliente e moto da mesma oficina)
CREATE OR REPLACE FUNCTION public.service_order_refs_valid(
  p_office_id UUID,
  p_customer_id UUID,
  p_motorcycle_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_office_id IS NOT NULL
    AND p_customer_id IS NOT NULL
    AND p_motorcycle_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.customers c
      WHERE c.id = p_customer_id
        AND c.office_id = p_office_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.motorcycles m
      WHERE m.id = p_motorcycle_id
        AND m.office_id = p_office_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.service_order_refs_valid(UUID, UUID, UUID) TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_orders TO authenticated;

ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;

-- Remover TODAS as políticas conhecidas (evita conflito tenant_all + insert_tenant)
DROP POLICY IF EXISTS "sync_mvp_service_orders" ON public.service_orders;
DROP POLICY IF EXISTS "service_orders_tenant_all" ON public.service_orders;
DROP POLICY IF EXISTS "service_orders_select_tenant" ON public.service_orders;
DROP POLICY IF EXISTS "service_orders_insert_tenant" ON public.service_orders;
DROP POLICY IF EXISTS "service_orders_update_tenant" ON public.service_orders;
DROP POLICY IF EXISTS "service_orders_delete_tenant" ON public.service_orders;

-- SELECT: ver OS da própria office
CREATE POLICY "service_orders_select_tenant" ON public.service_orders
  FOR SELECT TO authenticated
  USING (office_id = public.current_office_id());

-- INSERT: office_id correto + cliente/moto da mesma office
CREATE POLICY "service_orders_insert_tenant" ON public.service_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    office_id IS NOT NULL
    AND public.current_office_id() IS NOT NULL
    AND office_id = public.current_office_id()
    AND public.service_order_refs_valid(office_id, customer_id, motorcycle_id)
  );

-- UPDATE: permite corrigir office_id errado da migração MVP quando cliente pertence ao tenant atual
CREATE POLICY "service_orders_update_tenant" ON public.service_orders
  FOR UPDATE TO authenticated
  USING (
    public.current_office_id() IS NOT NULL
    AND (
      office_id = public.current_office_id()
      OR EXISTS (
        SELECT 1
        FROM public.customers c
        WHERE c.id = service_orders.customer_id
          AND c.office_id = public.current_office_id()
      )
    )
  )
  WITH CHECK (
    office_id = public.current_office_id()
    AND public.service_order_refs_valid(office_id, customer_id, motorcycle_id)
  );

-- DELETE: somente OS da própria office
CREATE POLICY "service_orders_delete_tenant" ON public.service_orders
  FOR DELETE TO authenticated
  USING (office_id = public.current_office_id());

-- =============================================================================
-- Reparo opcional (migração MVP com office_id errado)
-- Descomente e substitua SEU-OFFICE-UUID pelo id real da tabela offices/profiles
-- =============================================================================
-- UPDATE public.service_orders so
-- SET office_id = 'SEU-OFFICE-UUID'::uuid
-- WHERE so.office_id <> 'SEU-OFFICE-UUID'::uuid
--   AND EXISTS (
--     SELECT 1 FROM public.customers c
--     WHERE c.id = so.customer_id
--       AND c.office_id = 'SEU-OFFICE-UUID'::uuid
--   );

-- Verificação rápida (via app autenticado ou SQL Editor com JWT):
-- SELECT public.current_office_id();
-- SELECT id, office_id, customer_id, motorcycle_id, number FROM public.service_orders LIMIT 5;
