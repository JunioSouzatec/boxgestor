-- Numeração sequencial de Ordens de Serviço por oficina
-- NÃO executar automaticamente. Revisar duplicidades antes de criar índice único.

-- 1) Auditoria: números duplicados por office
SELECT office_id, number, COUNT(*) AS qtd
FROM service_orders
GROUP BY office_id, number
HAVING COUNT(*) > 1
ORDER BY office_id, number;

-- 2) Maior número por oficina
SELECT office_id, MAX(number) AS maior_numero, COUNT(*) AS total_os
FROM service_orders
GROUP BY office_id;

-- 3) Função RPC: próximo número de OS (atômico)
-- Executar apenas após corrigir duplicidades existentes.
CREATE OR REPLACE FUNCTION public.next_service_order_number(p_office_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  SELECT COALESCE(MAX(number), 0) + 1
    INTO v_next
    FROM service_orders
   WHERE office_id = p_office_id
   FOR UPDATE;

  UPDATE settings
     SET next_service_order_num = GREATEST(COALESCE(next_service_order_num, 1), v_next + 1),
         updated_at = now()
   WHERE office_id = p_office_id;

  RETURN v_next;
END;
$$;

-- 4) Índice único (somente se a auditoria do item 1 retornar zero linhas)
-- CREATE UNIQUE INDEX IF NOT EXISTS service_orders_office_number_unique
--   ON service_orders (office_id, number);

-- 5) Sincronizar settings.next_service_order_num com o maior número real
UPDATE settings s
   SET next_service_order_num = sub.maior + 1
  FROM (
    SELECT office_id, COALESCE(MAX(number), 0) AS maior
      FROM service_orders
     GROUP BY office_id
  ) sub
 WHERE s.office_id = sub.office_id
   AND COALESCE(s.next_service_order_num, 1) <= sub.maior;
