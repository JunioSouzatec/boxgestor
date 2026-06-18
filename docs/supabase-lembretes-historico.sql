-- BoxGestor — Lembretes e histórico de comunicação (Supabase)
-- Execute manualmente no SQL Editor do Supabase.
-- Pré-requisitos: offices, current_office_id() (docs/supabase-fix-rls-office.sql)
-- Admin sistema opcional: is_system_admin() (docs/supabase-admin-system.sql)
-- Não apaga dados existentes. Idempotente (CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- =============================================================================
-- REGRAS DE RETORNO
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.regras_lembrete (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  local_id TEXT,
  nome_regra TEXT NOT NULL,
  servico_relacionado TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'geral',
  prazo_dias INTEGER NOT NULL DEFAULT 90,
  prazo_meses INTEGER NOT NULL DEFAULT 0,
  km_retorno INTEGER,
  mensagem_padrao TEXT NOT NULL,
  observacoes_internas TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.regras_lembrete
  ADD COLUMN IF NOT EXISTS local_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_regras_lembrete_office ON public.regras_lembrete(office_id);
CREATE INDEX IF NOT EXISTS idx_regras_lembrete_office_local ON public.regras_lembrete(office_id, local_id);

-- =============================================================================
-- LEMBRETES OPERACIONAIS (nunca apagar — usar status_fixo)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.lembretes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  local_id TEXT,
  cliente_id UUID NOT NULL,
  moto_id UUID NOT NULL,
  ordem_servico_id UUID,
  ordem_servico_numero INTEGER,
  regra_id UUID REFERENCES public.regras_lembrete(id) ON DELETE SET NULL,
  servico TEXT NOT NULL,
  data_prevista DATE NOT NULL,
  km_prevista INTEGER,
  km_base INTEGER,
  mensagem TEXT NOT NULL,
  observacoes TEXT,
  personalizado BOOLEAN NOT NULL DEFAULT false,
  status_fixo TEXT CHECK (status_fixo IN ('enviado', 'concluido', 'cancelado', 'falha_envio', 'contatado')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lembretes
  ADD COLUMN IF NOT EXISTS local_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_lembretes_office ON public.lembretes(office_id);
CREATE INDEX IF NOT EXISTS idx_lembretes_cliente ON public.lembretes(office_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_lembretes_moto ON public.lembretes(office_id, moto_id);
CREATE INDEX IF NOT EXISTS idx_lembretes_os ON public.lembretes(office_id, ordem_servico_id);
CREATE INDEX IF NOT EXISTS idx_lembretes_data ON public.lembretes(office_id, data_prevista);
CREATE INDEX IF NOT EXISTS idx_lembretes_office_local ON public.lembretes(office_id, local_id);

-- =============================================================================
-- HISTÓRICO DE COMUNICAÇÃO
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.lembretes_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  local_id TEXT,
  lembrete_id UUID REFERENCES public.lembretes(id) ON DELETE SET NULL,
  lembrete_local_id TEXT,
  cliente_id UUID,
  moto_id UUID,
  ordem_servico_id UUID,
  ordem_servico_numero INTEGER,
  servico TEXT,
  data TIMESTAMPTZ NOT NULL,
  tipo_acao TEXT NOT NULL,
  canal TEXT NOT NULL,
  mensagem TEXT,
  resultado TEXT,
  responsavel TEXT NOT NULL,
  responsavel_nome TEXT,
  status_apos TEXT NOT NULL,
  observacao TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lembretes_historico
  ADD COLUMN IF NOT EXISTS local_id TEXT,
  ADD COLUMN IF NOT EXISTS lembrete_local_id TEXT,
  ADD COLUMN IF NOT EXISTS cliente_id UUID,
  ADD COLUMN IF NOT EXISTS moto_id UUID,
  ADD COLUMN IF NOT EXISTS ordem_servico_id UUID,
  ADD COLUMN IF NOT EXISTS ordem_servico_numero INTEGER,
  ADD COLUMN IF NOT EXISTS servico TEXT,
  ADD COLUMN IF NOT EXISTS responsavel_nome TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- lembrete_id opcional (histórico pode existir mesmo se lembrete for removido no futuro)
ALTER TABLE public.lembretes_historico
  ALTER COLUMN lembrete_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lembretes_historico_lembrete ON public.lembretes_historico(lembrete_id);
CREATE INDEX IF NOT EXISTS idx_lembretes_historico_office ON public.lembretes_historico(office_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_lembretes_historico_cliente ON public.lembretes_historico(office_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_lembretes_historico_moto ON public.lembretes_historico(office_id, moto_id);
CREATE INDEX IF NOT EXISTS idx_lembretes_historico_os ON public.lembretes_historico(office_id, ordem_servico_id);
CREATE INDEX IF NOT EXISTS idx_lembretes_historico_office_local ON public.lembretes_historico(office_id, local_id);

COMMENT ON TABLE public.lembretes IS 'Lembretes de retorno — não apagar; usar status_fixo';
COMMENT ON TABLE public.lembretes_historico IS 'Histórico de contatos (WhatsApp, ligação, presencial, etc.)';

-- =============================================================================
-- RLS — isolamento por office_id (+ admin sistema se existir)
-- =============================================================================

ALTER TABLE public.regras_lembrete ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lembretes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lembretes_historico ENABLE ROW LEVEL SECURITY;

-- regras_lembrete
DROP POLICY IF EXISTS "regras_lembrete_select_tenant" ON public.regras_lembrete;
DROP POLICY IF EXISTS "regras_lembrete_insert_tenant" ON public.regras_lembrete;
DROP POLICY IF EXISTS "regras_lembrete_update_tenant" ON public.regras_lembrete;
DROP POLICY IF EXISTS "regras_lembrete_delete_tenant" ON public.regras_lembrete;

CREATE POLICY "regras_lembrete_select_tenant" ON public.regras_lembrete
  FOR SELECT TO authenticated
  USING (
    office_id = public.current_office_id()
    OR (SELECT public.is_system_admin())
  );

CREATE POLICY "regras_lembrete_insert_tenant" ON public.regras_lembrete
  FOR INSERT TO authenticated
  WITH CHECK (
    office_id IS NOT NULL
    AND office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "regras_lembrete_update_tenant" ON public.regras_lembrete
  FOR UPDATE TO authenticated
  USING (office_id = public.current_office_id())
  WITH CHECK (
    office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "regras_lembrete_delete_tenant" ON public.regras_lembrete
  FOR DELETE TO authenticated
  USING (office_id = public.current_office_id());

-- lembretes
DROP POLICY IF EXISTS "lembretes_select_tenant" ON public.lembretes;
DROP POLICY IF EXISTS "lembretes_insert_tenant" ON public.lembretes;
DROP POLICY IF EXISTS "lembretes_update_tenant" ON public.lembretes;
DROP POLICY IF EXISTS "lembretes_delete_tenant" ON public.lembretes;

CREATE POLICY "lembretes_select_tenant" ON public.lembretes
  FOR SELECT TO authenticated
  USING (
    office_id = public.current_office_id()
    OR (SELECT public.is_system_admin())
  );

CREATE POLICY "lembretes_insert_tenant" ON public.lembretes
  FOR INSERT TO authenticated
  WITH CHECK (
    office_id IS NOT NULL
    AND office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "lembretes_update_tenant" ON public.lembretes
  FOR UPDATE TO authenticated
  USING (office_id = public.current_office_id())
  WITH CHECK (
    office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "lembretes_delete_tenant" ON public.lembretes
  FOR DELETE TO authenticated
  USING (office_id = public.current_office_id());

-- lembretes_historico
DROP POLICY IF EXISTS "lembretes_historico_select_tenant" ON public.lembretes_historico;
DROP POLICY IF EXISTS "lembretes_historico_insert_tenant" ON public.lembretes_historico;
DROP POLICY IF EXISTS "lembretes_historico_update_tenant" ON public.lembretes_historico;
DROP POLICY IF EXISTS "lembretes_historico_delete_tenant" ON public.lembretes_historico;

CREATE POLICY "lembretes_historico_select_tenant" ON public.lembretes_historico
  FOR SELECT TO authenticated
  USING (
    office_id = public.current_office_id()
    OR (SELECT public.is_system_admin())
  );

CREATE POLICY "lembretes_historico_insert_tenant" ON public.lembretes_historico
  FOR INSERT TO authenticated
  WITH CHECK (
    office_id IS NOT NULL
    AND office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "lembretes_historico_update_tenant" ON public.lembretes_historico
  FOR UPDATE TO authenticated
  USING (office_id = public.current_office_id())
  WITH CHECK (
    office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "lembretes_historico_delete_tenant" ON public.lembretes_historico
  FOR DELETE TO authenticated
  USING (office_id = public.current_office_id());
