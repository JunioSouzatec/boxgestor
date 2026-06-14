-- =============================================================================
-- Craft Oficina — Datas de ciclo da OS (entrada, previsão, saída)
-- =============================================================================
--
-- STATUS ATUAL (app em produção):
--   As datas são persistidas em parts_used JSONB → craft_meta:
--     - data_entrada
--     - data_previsao
--     - data_saida
--   NÃO é necessário rodar este script para o app funcionar hoje.
--
-- QUANDO RODAR:
--   Apenas se quiser colunas dedicadas no Supabase para consultas SQL/relatórios
--   diretos, sem depender do JSON craft_meta.
--
-- ANTES DE EXECUTAR:
--   1. Faça backup ou teste em projeto de staging.
--   2. Confirme que a tabela public.service_orders existe.
--   3. Avise a equipe — este script altera o schema.
-- =============================================================================

-- Verificar colunas existentes (opcional):
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'service_orders'
--   AND column_name IN ('entry_date', 'expected_delivery_date', 'exit_date');

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS entry_date DATE,
  ADD COLUMN IF NOT EXISTS expected_delivery_date DATE,
  ADD COLUMN IF NOT EXISTS exit_date DATE;

COMMENT ON COLUMN public.service_orders.entry_date IS
  'Data de entrada da moto na oficina (YYYY-MM-DD). Espelha craft_meta.data_entrada.';

COMMENT ON COLUMN public.service_orders.expected_delivery_date IS
  'Previsão de entrega (YYYY-MM-DD). Espelha craft_meta.data_previsao.';

COMMENT ON COLUMN public.service_orders.exit_date IS
  'Data de saída/entrega da moto (YYYY-MM-DD). Espelha craft_meta.data_saida.';

-- Migração opcional a partir do JSON craft_meta (ajuste se a estrutura mudar):
-- UPDATE public.service_orders so
-- SET
--   entry_date = COALESCE(
--     entry_date,
--     (so.parts_used->'craft_meta'->>'data_entrada')::date
--   ),
--   expected_delivery_date = COALESCE(
--     expected_delivery_date,
--     (so.parts_used->'craft_meta'->>'data_previsao')::date
--   ),
--   exit_date = COALESCE(
--     exit_date,
--     (so.parts_used->'craft_meta'->>'data_saida')::date
--   )
-- WHERE so.parts_used ? 'craft_meta';
