-- =============================================================================
-- BoxGestor — RC2 Caixa Fase 1A: base técnica (abrir / fechar sessão)
-- Migration ADITIVA e idempotente. NÃO remove dados.
--
-- Escopo desta fase:
--   • cash_sessions — sessão de caixa (open | closed)
--   • cash_audit_logs — auditoria de abrir/fechar
--   • NÃO cria cash_movements (fica para Caixa 2/3)
--   • NÃO vincula pagamentos de OS
--
-- Pré-requisitos:
--   • public.offices
--   • public.current_office_id()
--   • public.is_system_admin() (opcional, usado nas policies)
--   • public.set_updated_at()
-- =============================================================================

-- -----------------------------------------------------------------------------
-- cash_sessions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  opened_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  opened_by_name TEXT,
  closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_by_name TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  opening_balance NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
  closing_balance_informed NUMERIC(12, 2) CHECK (
    closing_balance_informed IS NULL OR closing_balance_informed >= 0
  ),
  expected_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  difference NUMERIC(12, 2),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes TEXT,
  craft_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.cash_sessions
  ADD COLUMN IF NOT EXISTS opened_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opened_by_name TEXT,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_by_name TEXT,
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS closing_balance_informed NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS expected_balance NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS difference NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS craft_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Uma oficina: no máximo um caixa aberto (não soft-deleted)
CREATE UNIQUE INDEX IF NOT EXISTS cash_sessions_one_open_per_office
  ON public.cash_sessions (office_id)
  WHERE status = 'open' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cash_sessions_office
  ON public.cash_sessions (office_id);

CREATE INDEX IF NOT EXISTS idx_cash_sessions_office_status
  ON public.cash_sessions (office_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cash_sessions_office_opened_at
  ON public.cash_sessions (office_id, opened_at DESC);

COMMENT ON TABLE public.cash_sessions IS
  'Sessão de caixa da oficina (abrir/fechar). Fase 1A: sem movimentos vinculados a pagamentos de OS.';

DROP TRIGGER IF EXISTS trg_cash_sessions_updated_at ON public.cash_sessions;
CREATE TRIGGER trg_cash_sessions_updated_at
  BEFORE UPDATE ON public.cash_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- cash_audit_logs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cash_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  cash_session_id UUID REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_audit_logs
  ADD COLUMN IF NOT EXISTS cash_session_id UUID REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS action TEXT,
  ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actor_name TEXT,
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_cash_audit_logs_office
  ON public.cash_audit_logs (office_id);

CREATE INDEX IF NOT EXISTS idx_cash_audit_logs_session
  ON public.cash_audit_logs (cash_session_id)
  WHERE cash_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cash_audit_logs_office_created
  ON public.cash_audit_logs (office_id, created_at DESC);

COMMENT ON TABLE public.cash_audit_logs IS
  'Auditoria de ações do caixa (abrir, fechar, etc.). Append-only nesta fase.';

-- -----------------------------------------------------------------------------
-- RLS — tenant por office_id (padrão financial_transactions / inventory)
-- -----------------------------------------------------------------------------
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cash_sessions_select" ON public.cash_sessions;
DROP POLICY IF EXISTS "cash_sessions_insert" ON public.cash_sessions;
DROP POLICY IF EXISTS "cash_sessions_update" ON public.cash_sessions;
DROP POLICY IF EXISTS "cash_sessions_delete" ON public.cash_sessions;

CREATE POLICY "cash_sessions_select" ON public.cash_sessions
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_system_admin())
    OR office_id = public.current_office_id()
  );

CREATE POLICY "cash_sessions_insert" ON public.cash_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND public.current_office_id() IS NOT NULL
    )
  );

CREATE POLICY "cash_sessions_update" ON public.cash_sessions
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_system_admin())
    OR office_id = public.current_office_id()
  )
  WITH CHECK (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND public.current_office_id() IS NOT NULL
    )
  );

-- Soft delete via UPDATE (deleted_at). Sem DELETE físico para authenticated.
CREATE POLICY "cash_sessions_delete" ON public.cash_sessions
  FOR DELETE TO authenticated
  USING ((SELECT public.is_system_admin()));

DROP POLICY IF EXISTS "cash_audit_logs_select" ON public.cash_audit_logs;
DROP POLICY IF EXISTS "cash_audit_logs_insert" ON public.cash_audit_logs;
DROP POLICY IF EXISTS "cash_audit_logs_update" ON public.cash_audit_logs;
DROP POLICY IF EXISTS "cash_audit_logs_delete" ON public.cash_audit_logs;

CREATE POLICY "cash_audit_logs_select" ON public.cash_audit_logs
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_system_admin())
    OR office_id = public.current_office_id()
  );

CREATE POLICY "cash_audit_logs_insert" ON public.cash_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND public.current_office_id() IS NOT NULL
    )
  );

-- Audit log é append-only para usuários da oficina
CREATE POLICY "cash_audit_logs_update" ON public.cash_audit_logs
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_system_admin()))
  WITH CHECK ((SELECT public.is_system_admin()));

CREATE POLICY "cash_audit_logs_delete" ON public.cash_audit_logs
  FOR DELETE TO authenticated
  USING ((SELECT public.is_system_admin()));

-- -----------------------------------------------------------------------------
-- GRANTs (PostgREST checa privilégios de tabela antes da RLS)
-- -----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.cash_sessions TO authenticated;
GRANT SELECT, INSERT ON public.cash_audit_logs TO authenticated;
GRANT ALL ON public.cash_sessions TO service_role;
GRANT ALL ON public.cash_audit_logs TO service_role;
REVOKE ALL ON public.cash_sessions FROM anon;
REVOKE ALL ON public.cash_audit_logs FROM anon;

NOTIFY pgrst, 'reload schema';
