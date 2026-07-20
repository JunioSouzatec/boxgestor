-- =============================================================================
-- BoxGestor — RC2 Fase 2: correção do ON CONFLICT da baixa de comissão
-- Migration ADITIVA e idempotente. NÃO apaga tabela, NÃO apaga registros,
-- NÃO renomeia colunas, NÃO remove RLS, NÃO libera anon, NÃO cria DELETE.
--
-- Problema em produção:
--   Ao confirmar a baixa, o Supabase/PostgREST retornava:
--     "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- Causa:
--   O serviço (src/services/comissoes/comissao-pagamento-folha.service.ts) faz:
--     .upsert(row, { onConflict: 'office_id,local_id' })
--   Mas o índice único de (office_id, local_id) foi criado como PARCIAL
--   (WHERE local_id IS NOT NULL AND trim(local_id) <> '') na migration
--   20260720210000. O ON CONFLICT do PostgREST NÃO infere índice parcial
--   (o predicado não é informado no upsert), então a constraint não é encontrada.
--
-- Correção:
--   Criar um índice único NÃO parcial em (office_id, local_id), que o ON CONFLICT
--   reconhece corretamente, e remover o índice parcial redundante de mesmas colunas.
--   O índice parcial de (funcionário + competência) que impede duplicidade ATIVA é
--   mantido intacto.
-- =============================================================================

-- 1) Índice único NÃO parcial para satisfazer onConflict: 'office_id,local_id'.
CREATE UNIQUE INDEX IF NOT EXISTS employee_commission_payments_office_local_id_uidx
  ON public.employee_commission_payments (office_id, local_id);

-- 2) Remove o índice parcial redundante de (office_id, local_id) — não reconhecido
--    pelo ON CONFLICT e agora coberto pelo índice não parcial acima.
--    (DROP INDEX remove apenas a estrutura de índice; não apaga dados/linhas.)
DROP INDEX IF EXISTS public.employee_commission_payments_office_local_unique;

-- 3) Mantido de propósito (NÃO alterar): índice parcial que impede baixa ATIVA
--    duplicada para o mesmo funcionário + competência:
--      employee_commission_payments_ativo_unique
--        (office_id, employee_local_id, competence_month) WHERE canceled_at IS NULL
--    Recriado aqui apenas com IF NOT EXISTS por segurança/idempotência.
CREATE UNIQUE INDEX IF NOT EXISTS employee_commission_payments_ativo_unique
  ON public.employee_commission_payments (office_id, employee_local_id, competence_month)
  WHERE canceled_at IS NULL;

-- Recarrega o cache de schema do PostgREST.
NOTIFY pgrst, 'reload schema';
