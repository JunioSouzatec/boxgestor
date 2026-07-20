-- =============================================================================
-- BoxGestor — RC2 Fase 2: Baixa de comissão em folha (premium)
-- Migration ADITIVA e idempotente. NÃO remove dados nem colunas existentes.
--
-- Objetivo:
--   Registrar, de forma auditável, quando o DONO/Admin marca a comissão mensal
--   de um funcionário como paga (junto com o salário/folha). NÃO paga nada
--   automaticamente e NÃO cria despesa/caixa — apenas grava a baixa.
--
-- Pré-requisitos (já existentes no projeto):
--   • public.offices, public.profiles
--   • public.employee_commission_profiles (docs/supabase-financeiro-funcionarios-comissoes.sql)
--   • public.current_office_id()  — docs/supabase-fix-rls-office.sql
--   • public.is_system_admin()    — docs/supabase-admin-system.sql
--
-- SEGURANÇA (dados sensíveis: contém salário + comissão):
--   • SELECT/INSERT/UPDATE: DONO (role owner) da oficina ou Admin Sistema.
--   • Gerente (role admin), recepção e mecânico: SEM acesso direto (RLS bloqueia).
--   • DELETE: sem policy → bloqueado para todos (registros não são apagados;
--     correções futuras devem usar cancelamento auditável via canceled_at).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.employee_commission_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  -- id local estável para upsert idempotente vindo do cliente
  local_id TEXT,
  -- vínculo com o perfil do funcionário (uuid derivado) + id local estável
  employee_id UUID REFERENCES public.employee_commission_profiles(id) ON DELETE SET NULL,
  employee_local_id TEXT NOT NULL,
  employee_name TEXT NOT NULL DEFAULT '',
  -- competência no formato YYYY-MM
  competence_month TEXT NOT NULL CHECK (competence_month ~ '^\d{4}-\d{2}$'),
  salary_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  paid_by_name TEXT,
  notes TEXT,
  -- preparado para cancelamento/estorno auditável futuro (nunca apagar)
  canceled_at TIMESTAMPTZ,
  canceled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Colunas aditivas (idempotência para bancos que já tenham uma versão parcial da tabela)
ALTER TABLE public.employee_commission_payments
  ADD COLUMN IF NOT EXISTS local_id TEXT,
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employee_commission_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS employee_local_id TEXT,
  ADD COLUMN IF NOT EXISTS employee_name TEXT,
  ADD COLUMN IF NOT EXISTS salary_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_by_name TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canceled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Evita duplicidade de pagamento ATIVO para o mesmo funcionário + competência.
-- Parcial (canceled_at IS NULL): se um dia houver cancelamento, permite novo registro.
CREATE UNIQUE INDEX IF NOT EXISTS employee_commission_payments_ativo_unique
  ON public.employee_commission_payments (office_id, employee_local_id, competence_month)
  WHERE canceled_at IS NULL;

-- Upsert idempotente por id local (evita duplicar em reenvio/retry).
CREATE UNIQUE INDEX IF NOT EXISTS employee_commission_payments_office_local_unique
  ON public.employee_commission_payments (office_id, local_id)
  WHERE local_id IS NOT NULL AND trim(local_id) <> '';

CREATE INDEX IF NOT EXISTS idx_employee_commission_payments_office
  ON public.employee_commission_payments (office_id);

CREATE INDEX IF NOT EXISTS idx_employee_commission_payments_competence
  ON public.employee_commission_payments (office_id, competence_month);

COMMENT ON TABLE public.employee_commission_payments IS
  'Baixa auditável de comissão paga em folha (premium). Registro do dono/admin; não paga automático, não cria caixa. Nunca apagar — usar canceled_at para estorno futuro.';

-- =============================================================================
-- RLS — employee_commission_payments (dados sensíveis: salário + comissão)
-- SELECT/INSERT/UPDATE: Admin Sistema ou DONO (role owner). Sem DELETE policy.
-- =============================================================================

ALTER TABLE public.employee_commission_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employee_commission_payments_select" ON public.employee_commission_payments;
DROP POLICY IF EXISTS "employee_commission_payments_insert" ON public.employee_commission_payments;
DROP POLICY IF EXISTS "employee_commission_payments_update" ON public.employee_commission_payments;

CREATE POLICY "employee_commission_payments_select" ON public.employee_commission_payments
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = employee_commission_payments.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

CREATE POLICY "employee_commission_payments_insert" ON public.employee_commission_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND public.current_office_id() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = employee_commission_payments.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

CREATE POLICY "employee_commission_payments_update" ON public.employee_commission_payments
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = employee_commission_payments.office_id
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
          AND p.office_id = employee_commission_payments.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

-- =============================================================================
-- GRANTs — obrigatórios neste projeto (privilégios de tabela são checados ANTES
-- da RLS pelo PostgREST). Sem GRANT, até o dono recebe "permission denied" (42501).
-- Segue o padrão de supabase/migrations/20260718190000_admin_auth_claims_and_table_grants.sql.
-- Sem DELETE para authenticated (registros não são apagados — estorno via canceled_at).
-- =============================================================================
GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.employee_commission_payments TO authenticated;
GRANT ALL ON public.employee_commission_payments TO service_role;
REVOKE ALL ON public.employee_commission_payments FROM anon;

-- Recarrega o cache de schema do PostgREST para expor a tabela imediatamente.
NOTIFY pgrst, 'reload schema';
