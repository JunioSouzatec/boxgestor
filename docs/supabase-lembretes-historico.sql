-- BoxGestor — Lembretes e histórico de comunicação (Supabase)
-- Execute manualmente no SQL Editor quando for sincronizar lembretes na nuvem.
-- Hoje os lembretes ficam em localStorage (craft_lembretes_v1); este script prepara o schema futuro.

-- Regras de retorno por oficina
CREATE TABLE IF NOT EXISTS regras_lembrete (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  nome_regra TEXT NOT NULL,
  servico_relacionado TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'geral',
  prazo_dias INTEGER NOT NULL DEFAULT 90,
  prazo_meses INTEGER NOT NULL DEFAULT 0,
  km_retorno INTEGER,
  mensagem_padrao TEXT NOT NULL,
  observacoes_internas TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regras_lembrete_office ON regras_lembrete(office_id);

-- Lembretes operacionais (nunca apagar — usar status)
CREATE TABLE IF NOT EXISTS lembretes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL,
  moto_id UUID NOT NULL,
  ordem_servico_id UUID,
  ordem_servico_numero INTEGER,
  regra_id UUID REFERENCES regras_lembrete(id) ON DELETE SET NULL,
  servico TEXT NOT NULL,
  data_prevista DATE NOT NULL,
  km_prevista INTEGER,
  km_base INTEGER,
  mensagem TEXT NOT NULL,
  observacoes TEXT,
  personalizado BOOLEAN NOT NULL DEFAULT false,
  status_fixo TEXT CHECK (status_fixo IN ('enviado', 'concluido', 'cancelado', 'falha_envio', 'contatado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lembretes_office ON lembretes(office_id);
CREATE INDEX IF NOT EXISTS idx_lembretes_cliente ON lembretes(office_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_lembretes_moto ON lembretes(office_id, moto_id);
CREATE INDEX IF NOT EXISTS idx_lembretes_os ON lembretes(office_id, ordem_servico_id);
CREATE INDEX IF NOT EXISTS idx_lembretes_data ON lembretes(office_id, data_prevista);

-- Histórico de comunicação (um lembrete pode ter vários registros)
CREATE TABLE IF NOT EXISTS lembretes_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  lembrete_id UUID NOT NULL REFERENCES lembretes(id) ON DELETE CASCADE,
  data TIMESTAMPTZ NOT NULL,
  tipo_acao TEXT NOT NULL,
  canal TEXT NOT NULL,
  mensagem TEXT,
  resultado TEXT,
  responsavel TEXT NOT NULL,
  status_apos TEXT NOT NULL,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lembretes_historico_lembrete ON lembretes_historico(lembrete_id);
CREATE INDEX IF NOT EXISTS idx_lembretes_historico_office ON lembretes_historico(office_id, data DESC);

-- RLS: cada oficina vê apenas seus dados
ALTER TABLE regras_lembrete ENABLE ROW LEVEL SECURITY;
ALTER TABLE lembretes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lembretes_historico ENABLE ROW LEVEL SECURITY;

-- Políticas devem ser ajustadas conforme auth JWT do BoxGestor (office_id no token).
-- Exemplo:
-- CREATE POLICY lembretes_office_isolation ON lembretes
--   FOR ALL USING (office_id = auth.jwt() ->> 'office_id'::uuid);

COMMENT ON TABLE lembretes IS 'Lembretes de retorno — não apagar; usar status_fixo';
COMMENT ON TABLE lembretes_historico IS 'Histórico de contatos (WhatsApp, ligação, presencial, etc.)';
