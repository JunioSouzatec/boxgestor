# Auditoria de pagamentos por OS (Supabase)

Consultas opcionais para verificar vínculos de pagamentos no Supabase.
**Não executar automaticamente** — revisar `office_id` e IDs antes de rodar.

## Pagamentos vinculados a uma OS (por número)

Substitua `:office_uuid` e `:os_number`:

```sql
SELECT
  sop.id AS payment_id,
  sop.paid_at,
  sop.payment_method,
  sop.amount,
  sop.installments,
  sop.notes,
  sop.service_order_id,
  so.number AS os_number,
  so.id AS service_order_uuid
FROM service_order_payments sop
INNER JOIN service_orders so ON so.id = sop.service_order_id
WHERE so.office_id = :office_uuid
  AND so.number = :os_number
ORDER BY sop.paid_at DESC, sop.created_at DESC;
```

## Pagamentos com service_order_id apontando para OS errada

Lista pagamentos cuja descrição/notas mencionam outro número de OS:

```sql
SELECT
  sop.id,
  sop.amount,
  sop.paid_at,
  sop.notes,
  so.number AS os_vinculada,
  (regexp_match(sop.notes, 'OS\s*#(\d+)', 'i'))[1]::int AS os_na_nota
FROM service_order_payments sop
INNER JOIN service_orders so ON so.id = sop.service_order_id
WHERE so.office_id = :office_uuid
  AND sop.notes ~* 'OS\s*#\d+'
  AND (regexp_match(sop.notes, 'OS\s*#(\d+)', 'i'))[1]::int IS DISTINCT FROM so.number;
```

## Corrigir vínculo no Supabase (manual)

Somente após confirmar OS destino correta. Substitua IDs reais:

```sql
-- Verificar OS destino
SELECT id, number FROM service_orders
WHERE office_id = :office_uuid AND number = :os_destino;

-- Mover pagamento (exemplo)
UPDATE service_order_payments
SET service_order_id = :uuid_os_destino,
    updated_at = now()
WHERE id = :payment_uuid
  AND service_order_id = :uuid_os_origem_errada;
```

## Remover vínculo (manter pagamento no financeiro)

No Supabase, pagamentos de OS normalmente exigem `service_order_id`. Para “desvincular”,
prefira mover para uma OS de ajuste interna ou usar a ferramenta local **Auditar pagamentos por OS**
no Admin BoxGestor, que marca `ordem_servico_id` como vazio localmente e sincroniza depois.
