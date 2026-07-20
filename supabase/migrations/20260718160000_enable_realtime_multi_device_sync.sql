-- ============================================================
-- RC1 multi-device sync: habilitar Supabase Realtime por office_id
-- ============================================================
-- TIPO: ADITIVA (não destrutiva)
-- NÃO apaga, TRUNCATE, DELETE ou altera linhas existentes.
-- Apenas:
--   1) REPLICA IDENTITY FULL (necessário para filtros Realtime em UPDATE/DELETE)
--   2) Inclusão das tabelas na publication supabase_realtime (se ainda não estiverem)
--
-- IMPACTO: dispositivos da mesma oficina passam a receber eventos de mudança
-- e agendam pull reconciliado. Sem misturar office_id (filtro no cliente).
--
-- ANTES DE APLICAR EM PRODUÇÃO: exportar backup do projeto no Supabase Dashboard
-- (Settings → Database → Backups / ou pg_dump). Sem TRUNCATE/DELETE nesta migration.
-- ============================================================

DO $$
DECLARE
  tbl text;
  tabelas text[] := ARRAY[
    'customers',
    'motorcycles',
    'service_orders',
    'inventory_items',
    'inventory_movements',
    'suppliers',
    'financial_transactions',
    'communication_history',
    'communication_alerts',
    'scheduled_messages'
  ];
BEGIN
  FOREACH tbl IN ARRAY tabelas
  LOOP
    -- Só aplica se a tabela existir (seguro em ambientes parciais)
    IF to_regclass(format('public.%I', tbl)) IS NULL THEN
      RAISE NOTICE 'Tabela %.% inexistente — pulando', 'public', tbl;
      CONTINUE;
    END IF;

    -- Replica identity FULL: aditivo, não altera dados
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', tbl);

    -- Adiciona à publication apenas se ainda não estiver
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
      RAISE NOTICE 'Realtime habilitado para public.%', tbl;
    ELSE
      RAISE NOTICE 'Realtime já ativo para public.%', tbl;
    END IF;
  END LOOP;
END $$;
