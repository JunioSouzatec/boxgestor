-- =============================================================================
-- Adicionar valor "pronto_para_retirada" ao enum public.status_os
-- =============================================================================
-- Contexto:
--   Tabela: public.service_orders
--   Coluna: status
--   Tipo:   public.status_os (ENUM Postgres)
--   Valores existentes: recebida, em_diagnostico, aguardando_aprovacao,
--                       aguardando_peca, em_servico, finalizada, entregue, cancelada
--
-- Objetivo (RC2 Fase 3B.0): apenas registrar oficialmente o novo status
-- operacional "pronto_para_retirada" no banco, ANTES de qualquer mudança no app.
--
-- Cuidados aplicados:
--   - Aditiva e idempotente (ADD VALUE IF NOT EXISTS).
--   - Não remove valores antigos, não recria o enum.
--   - Não altera a tabela service_orders nem registros existentes.
--   - Sem UPDATE / DELETE / INSERT. Sem mudança de RLS.
--   - Não usa o novo valor nesta mesma migration.
-- =============================================================================

ALTER TYPE public.status_os ADD VALUE IF NOT EXISTS 'pronto_para_retirada';

NOTIFY pgrst, 'reload schema';
