-- =============================================================================
-- RC2 Comissão Fase B3 — SELECT da própria conta corrente para o mecânico
-- =============================================================================
-- Por quê:
--   As tabelas de itens/baixas (B1) ficaram com RLS só para owner/admin.
--   Sem SELECT próprio, a tela Minha comissão não consegue mostrar
--   recebido / em aberto / histórico de baixas.
--
-- O que muda:
--   • Função SECURITY DEFINER que devolve apenas o local_id do perfil
--     vinculado ao auth.uid() (mecânico da mesma oficina).
--   • Policies SELECT adicionais (OR) nas 3 tabelas B1 para o mecânico
--     ler SOMENTE as linhas do próprio employee_id.
--
-- O que NÃO muda:
--   • Sem INSERT/UPDATE para mecânico
--   • Sem acesso a employee_commission_profiles (salário/regras)
--   • Sem abertura de employee_commission_payments (contém salary_amount)
--   • Políticas do dono/admin permanecem
--
-- Aplicar com revisão (não rodar push sem aprovação):
--   supabase db push  OU  aplicar este SQL no painel
-- =============================================================================

CREATE OR REPLACE FUNCTION public.my_linked_commission_employee_local_ids()
RETURNS SETOF TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT e.local_id
  FROM public.employee_commission_profiles e
  INNER JOIN public.profiles p
    ON p.id = auth.uid()
   AND p.office_id = e.office_id
  WHERE e.usuario_id = auth.uid()
    AND COALESCE(p.active, TRUE) = TRUE
    AND p.role = 'mecanico'
    AND e.local_id IS NOT NULL
    AND trim(e.local_id) <> '';
$$;

COMMENT ON FUNCTION public.my_linked_commission_employee_local_ids() IS
  'RC2 B3: local_ids de comissão do mecânico logado (SECURITY DEFINER; não expõe salário).';

REVOKE ALL ON FUNCTION public.my_linked_commission_employee_local_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_linked_commission_employee_local_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_linked_commission_employee_local_ids() TO service_role;

-- -----------------------------------------------------------------------------
-- employee_commission_items — SELECT próprio
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "employee_commission_items_select_own_mechanic"
  ON public.employee_commission_items;

CREATE POLICY "employee_commission_items_select_own_mechanic"
  ON public.employee_commission_items
  FOR SELECT TO authenticated
  USING (
    office_id = public.current_office_id()
    AND employee_id IN (SELECT public.my_linked_commission_employee_local_ids())
  );

-- -----------------------------------------------------------------------------
-- employee_commission_settlements — SELECT próprio
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "employee_commission_settlements_select_own_mechanic"
  ON public.employee_commission_settlements;

CREATE POLICY "employee_commission_settlements_select_own_mechanic"
  ON public.employee_commission_settlements
  FOR SELECT TO authenticated
  USING (
    office_id = public.current_office_id()
    AND employee_id IN (SELECT public.my_linked_commission_employee_local_ids())
  );

-- -----------------------------------------------------------------------------
-- employee_commission_settlement_items — SELECT das baixas do próprio mecânico
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "employee_commission_settlement_items_select_own_mechanic"
  ON public.employee_commission_settlement_items;

CREATE POLICY "employee_commission_settlement_items_select_own_mechanic"
  ON public.employee_commission_settlement_items
  FOR SELECT TO authenticated
  USING (
    office_id = public.current_office_id()
    AND EXISTS (
      SELECT 1
      FROM public.employee_commission_settlements s
      WHERE s.id = employee_commission_settlement_items.settlement_id
        AND s.office_id = employee_commission_settlement_items.office_id
        AND s.employee_id IN (SELECT public.my_linked_commission_employee_local_ids())
    )
  );
