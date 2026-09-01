-- =============================================================================
-- RC2 Comissão A1 — RPC mínima do perfil do mecânico (Minha Comissão)
-- =============================================================================
-- Por quê:
--   employee_commission_profiles tem RLS SELECT só para owner/system admin.
--   Em aparelho limpo o mecânico não recebe perfis_comissao no sync e a tela
--   Minha Comissão não resolve o employee_id (local_id).
--
-- O que muda:
--   • RPC get_my_commission_profile_minimal (SECURITY DEFINER) devolve SOMENTE
--     a linha própria do mecânico logado, sem salário.
--   • Reafirma my_linked_commission_employee_local_ids + policies SELECT próprias
--     em items/settlements (idempotente; necessária para conta corrente remota).
--
-- O que NÃO muda / NÃO retorna:
--   • Sem SELECT amplo em employee_commission_profiles
--   • Sem salário (salario_fixo_mensal)
--   • Sem perfis de outros funcionários
--   • Sem employee_commission_payments (folha com salário)
--   • Sem INSERT/UPDATE para mecânico
--   • Sem alteração de dados/valores
--
-- Aplicar com aprovação (não rodar push sem relatório):
--   supabase db push  OU  SQL Editor no painel
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Helper: local_ids vinculados ao auth.uid() (reutilizado pelas policies B3)
-- -----------------------------------------------------------------------------
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
  'RC2 A1/B3: local_ids de comissão do mecânico logado (SECURITY DEFINER; não expõe salário).';

REVOKE ALL ON FUNCTION public.my_linked_commission_employee_local_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_linked_commission_employee_local_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_linked_commission_employee_local_ids() TO service_role;

-- -----------------------------------------------------------------------------
-- 2) RPC: perfil mínimo do mecânico (sem salário)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_commission_profile_minimal()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_settings jsonb;
  v_comissoes jsonb;
  v_perm_mecanico jsonb;
  v_pode_ver boolean := FALSE;
  v_emp public.employee_commission_profiles%ROWTYPE;
  v_percentual_pecas numeric;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles p
  WHERE p.id = v_uid
    AND COALESCE(p.active, TRUE) = TRUE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  IF v_profile.office_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'office_not_found');
  END IF;

  IF v_profile.role <> 'mecanico' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_mechanic');
  END IF;

  SELECT s.metadata INTO v_settings
  FROM public.settings s
  WHERE s.office_id = v_profile.office_id
  LIMIT 1;

  v_comissoes := COALESCE(v_settings->'comissoes_config', '{}'::jsonb);
  v_perm_mecanico := COALESCE(v_settings->'permissions'->'mecanico', '{}'::jsonb);

  v_pode_ver :=
    COALESCE((v_comissoes->>'mecanico_ve_propria_comissao')::boolean, FALSE)
    OR COALESCE((v_perm_mecanico->>'ver_propria_comissao')::boolean, FALSE);

  IF NOT v_pode_ver THEN
    RETURN jsonb_build_object('ok', false, 'error', 'commission_view_disabled');
  END IF;

  SELECT * INTO v_emp
  FROM public.employee_commission_profiles e
  WHERE e.office_id = v_profile.office_id
    AND e.usuario_id = v_uid
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'perfil_configurado', false
    );
  END IF;

  IF v_emp.local_id IS NULL OR trim(v_emp.local_id) = '' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'perfil_configurado', false,
      'error', 'missing_local_id'
    );
  END IF;

  -- percentual_pecas: coluna aditiva ou espelho em metadata
  v_percentual_pecas := COALESCE(
    v_emp.percentual_pecas,
    NULLIF(v_emp.metadata->>'percentual_pecas', '')::numeric
  );

  RETURN jsonb_build_object(
    'ok', true,
    'perfil_configurado', true,
    'local_id', v_emp.local_id,
    'usuario_id', v_emp.usuario_id,
    'office_id', v_emp.office_id,
    'nome', COALESCE(NULLIF(trim(v_emp.nome), ''), 'Funcionário'),
    'cargo', COALESCE(v_emp.cargo, ''),
    'comissao_ativa', COALESCE(v_emp.comissao_ativa, FALSE),
    'tipo_comissao', COALESCE(v_emp.tipo_comissao, 'sem_comissao'),
    'percentual_comissao', v_emp.percentual_comissao,
    'percentual_pecas', v_percentual_pecas,
    'valor_fixo_por_os', v_emp.valor_fixo_por_os
    -- NÃO retorna: salario_fixo_mensal, observacoes, metadata bruto, id uuid interno
  );
END;
$$;

COMMENT ON FUNCTION public.get_my_commission_profile_minimal() IS
  'RC2 A1: perfil mínimo do mecânico logado para Minha Comissão. Sem salário; sem outros funcionários.';

REVOKE ALL ON FUNCTION public.get_my_commission_profile_minimal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_commission_profile_minimal() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_commission_profile_minimal() TO service_role;

-- -----------------------------------------------------------------------------
-- 3) Policies SELECT próprias (idempotente) — conta corrente remota
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

DROP POLICY IF EXISTS "employee_commission_settlements_select_own_mechanic"
  ON public.employee_commission_settlements;

CREATE POLICY "employee_commission_settlements_select_own_mechanic"
  ON public.employee_commission_settlements
  FOR SELECT TO authenticated
  USING (
    office_id = public.current_office_id()
    AND employee_id IN (SELECT public.my_linked_commission_employee_local_ids())
  );

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

NOTIFY pgrst, 'reload schema';
