SELECT 'customers.deleted_at' AS check_item,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'deleted_at'
  ) AS ok
UNION ALL
SELECT 'motorcycles.deleted_at',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'motorcycles' AND column_name = 'deleted_at'
  )
UNION ALL
SELECT 'inventory_items.deleted_at',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_items' AND column_name = 'deleted_at'
  )
UNION ALL
SELECT 'scheduled_messages table',
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'scheduled_messages'
  );
