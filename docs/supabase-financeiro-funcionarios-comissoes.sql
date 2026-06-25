-- =============================================================================
-- BoxGestor — Funcionários, salários e comissões (Financeiro interno)
-- Execute manualmente no SQL Editor do Supabase.
--
-- Pré-requisitos:
--   • public.current_office_id()  — docs/supabase-fix-rls-office.sql
--   • public.is_system_admin()    — docs/supabase-admin-system.sql (opcional)
--   • public.profiles, public.offices, public.settings
--   • public.service_orders, public.financial_transactions (para RPC Minha Comissão)
--
-- NÃO executar automaticamente.
--
-- SEGURANÇA:
--   • employee_commission_profiles contém salário e regras internas — somente DONO ou Admin Sistema.
--   • Gerente (role admin), recepção e mecânico: SEM acesso direto à tabela (RLS bloqueia).
--   • Mecânico usa RPC get_my_commission_summary (retorna só comissão calculada, sem salário).
--
-- PERMISSÃO FUTURA (gerente) — NÃO IMPLEMENTADA:
--   Se o dono quiser liberar gerente para ver/editar salários/comissões, usar flag explícita em
--   settings.metadata.permissions (ex.: gerente_ve_salarios_comissoes = true) e recriar policies
--   com essa condição. Nunca liberar gerente (role admin) por padrão.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.employee_commission_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  local_id TEXT NOT NULL,
  usuario_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  cargo TEXT NOT NULL DEFAULT '',
  salario_fixo_mensal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  comissao_ativa BOOLEAN NOT NULL DEFAULT FALSE,
  tipo_comissao TEXT NOT NULL DEFAULT 'sem_comissao'
    CHECK (tipo_comissao IN ('sem_comissao', 'percentual_mao_obra', 'valor_fixo_por_os')),
  percentual_comissao NUMERIC(6, 2),
  valor_fixo_por_os NUMERIC(12, 2),
  observacoes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_commission_profiles
  ADD COLUMN IF NOT EXISTS local_id TEXT,
  ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS employee_commission_profiles_office_local_unique
  ON public.employee_commission_profiles (office_id, local_id);

CREATE INDEX IF NOT EXISTS idx_employee_commission_profiles_office
  ON public.employee_commission_profiles (office_id);

CREATE INDEX IF NOT EXISTS idx_employee_commission_profiles_usuario
  ON public.employee_commission_profiles (office_id, usuario_id)
  WHERE usuario_id IS NOT NULL;

COMMENT ON TABLE public.employee_commission_profiles IS
  'Perfis financeiros sensíveis (salário + regras de comissão). Acesso direto: dono (owner) ou Admin Sistema apenas.';

-- Configuração da oficina (incl. mecanico_ve_propria_comissao) em settings.metadata.comissoes_config.

-- =============================================================================
-- RLS — employee_commission_profiles (dados sensíveis)
-- SELECT/INSERT/UPDATE/DELETE: Admin Sistema ou DONO (role owner) da oficina.
-- Gerente (role admin), recepção, mecânico: SEM acesso direto (nem SELECT da própria linha).
-- =============================================================================

ALTER TABLE public.employee_commission_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employee_commission_profiles_select" ON public.employee_commission_profiles;
DROP POLICY IF EXISTS "employee_commission_profiles_insert" ON public.employee_commission_profiles;
DROP POLICY IF EXISTS "employee_commission_profiles_update" ON public.employee_commission_profiles;
DROP POLICY IF EXISTS "employee_commission_profiles_delete" ON public.employee_commission_profiles;

CREATE POLICY "employee_commission_profiles_select" ON public.employee_commission_profiles
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = employee_commission_profiles.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

CREATE POLICY "employee_commission_profiles_insert" ON public.employee_commission_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND public.current_office_id() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = employee_commission_profiles.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

CREATE POLICY "employee_commission_profiles_update" ON public.employee_commission_profiles
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = employee_commission_profiles.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  )
  WITH CHECK (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND public.current_office_id() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = employee_commission_profiles.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

CREATE POLICY "employee_commission_profiles_delete" ON public.employee_commission_profiles
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = employee_commission_profiles.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

-- =============================================================================
-- RPC segura — Minha Comissão (mecânico)
-- SECURITY DEFINER: lê perfil internamente para calcular, mas a resposta JSON NÃO inclui:
--   salario_fixo_mensal, percentual_comissao, valor_fixo_por_os, tipo_comissao,
--   comissão de outros funcionários nem lucro da oficina.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_my_commission_summary(p_month TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_profile public.profiles%ROWTYPE;
  v_emp public.employee_commission_profiles%ROWTYPE;
  v_settings JSONB;
  v_config JSONB;
  v_criterio TEXT;
  v_mes TEXT;
  v_mes_inicio DATE;
  v_mes_fim DATE;
  v_detalhes JSONB := '[]'::jsonb;
  v_total_comissao NUMERIC(12, 2) := 0;
  v_total_mao_obra NUMERIC(12, 2) := 0;
  v_qtd_os INT := 0;
  r RECORD;
  v_meta JSONB;
  v_data_ref DATE;
  v_resp TEXT;
  v_entregue BOOLEAN;
  v_pago BOOLEAN;
  v_elegivel BOOLEAN;
  v_comissao NUMERIC(12, 2);
  v_pago_os NUMERIC(12, 2);
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles p
  WHERE p.id = v_uid AND COALESCE(p.active, TRUE) = TRUE;

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

  v_config := COALESCE(v_settings->'comissoes_config', '{}'::jsonb);

  IF COALESCE((v_config->>'mecanico_ve_propria_comissao')::boolean, FALSE) IS NOT TRUE THEN
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
      'nome', v_profile.full_name,
      'mes_referencia', COALESCE(NULLIF(trim(p_month), ''), to_char(CURRENT_DATE, 'YYYY-MM')),
      'quantidade_os', 0,
      'total_comissao', 0,
      'total_mao_obra', 0,
      'detalhes', '[]'::jsonb,
      'perfil_configurado', false
    );
  END IF;

  v_criterio := COALESCE(v_config->>'criterio_os', 'entregue_ou_pago');
  v_mes := COALESCE(NULLIF(trim(p_month), ''), to_char(CURRENT_DATE, 'YYYY-MM'));

  IF v_mes !~ '^\d{4}-\d{2}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_month');
  END IF;

  v_mes_inicio := (v_mes || '-01')::date;
  v_mes_fim := (v_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

  FOR r IN
    SELECT
      so.id,
      so.number,
      so.status,
      so.labor_value,
      so.total_value,
      so.parts_used,
      so.updated_at,
      so.created_at
    FROM public.service_orders so
    WHERE so.office_id = v_profile.office_id
      AND so.status <> 'cancelada'
  LOOP
    v_meta := COALESCE(r.parts_used->'craft_meta', '{}'::jsonb);

    v_data_ref := COALESCE(
      NULLIF(v_meta->>'data_saida', '')::date,
      r.updated_at::date,
      r.created_at::date
    );

    IF v_data_ref < v_mes_inicio OR v_data_ref > v_mes_fim THEN
      CONTINUE;
    END IF;

    v_resp := lower(trim(COALESCE(v_meta->>'responsavel', '')));
    IF v_resp = '' OR v_resp <> lower(trim(v_emp.nome)) THEN
      CONTINUE;
    END IF;

    v_entregue := r.status IN ('finalizada', 'entregue');

    SELECT COALESCE(SUM(ft.amount), 0) INTO v_pago_os
    FROM public.financial_transactions ft
    WHERE ft.office_id = v_profile.office_id
      AND ft.service_order_id = r.id
      AND ft.type = 'receita'
      AND ft.paid = TRUE;

    v_pago := v_pago_os >= GREATEST(r.total_value - 0.01, 0);

    v_elegivel := CASE v_criterio
      WHEN 'entregue_finalizada' THEN v_entregue
      WHEN 'pagamento_recebido' THEN v_pago
      ELSE v_entregue OR v_pago
    END;

    IF NOT v_elegivel THEN
      CONTINUE;
    END IF;

    IF NOT v_emp.comissao_ativa OR v_emp.tipo_comissao = 'sem_comissao' THEN
      v_comissao := 0;
    ELSIF v_emp.tipo_comissao = 'percentual_mao_obra' THEN
      v_comissao := ROUND(
        r.labor_value * LEAST(100, GREATEST(0, COALESCE(v_emp.percentual_comissao, 0))) / 100,
        2
      );
    ELSIF v_emp.tipo_comissao = 'valor_fixo_os' THEN
      v_comissao := GREATEST(0, COALESCE(v_emp.valor_fixo_por_os, 0));
    ELSE
      v_comissao := 0;
    END IF;

    v_qtd_os := v_qtd_os + 1;
    v_total_mao_obra := v_total_mao_obra + COALESCE(r.labor_value, 0);
    v_total_comissao := v_total_comissao + v_comissao;

    v_detalhes := v_detalhes || jsonb_build_array(
      jsonb_build_object(
        'os_id', r.id,
        'numero', r.number,
        'data_referencia', to_char(v_data_ref, 'YYYY-MM-DD'),
        'mao_obra', COALESCE(r.labor_value, 0),
        'comissao', v_comissao
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'nome', v_emp.nome,
    'mes_referencia', v_mes,
    'quantidade_os', v_qtd_os,
    'total_comissao', v_total_comissao,
    'total_mao_obra', v_total_mao_obra,
    'detalhes', v_detalhes,
    'perfil_configurado', true
  );
END;
$$;

COMMENT ON FUNCTION public.get_my_commission_summary(TEXT) IS
  'Retorna comissão mensal do mecânico logado (SECURITY DEFINER). '
  'Resposta: nome, mês, quantidade_os, total_comissao, total_mao_obra, detalhes por OS. '
  'Nunca retorna salario_fixo_mensal, percentual_comissao, valor_fixo_por_os nem dados de terceiros. '
  'Requer settings.metadata.comissoes_config.mecanico_ve_propria_comissao = true.';

REVOKE ALL ON FUNCTION public.get_my_commission_summary(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_commission_summary(TEXT) TO authenticated;
