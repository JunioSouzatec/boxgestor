# Teste do modo Supabase (experimental)

Guia para alternar entre **localStorage** e **Supabase** como banco principal da fase 1, sem login real e com fallback local automático.

---

## O que cada modo faz

| Modo | Variável | Comportamento |
|------|----------|---------------|
| **Local** (padrão) | `VITE_CRAFT_PERSISTENCE=local` | Tudo no localStorage, como sempre |
| **Supabase experimental** | `VITE_CRAFT_PERSISTENCE=supabase` | Oficina, clientes, motos e OS no Supabase; resto continua local |

### Entidades no Supabase (modo experimental)

- `offices` — dados da oficina
- `settings` — preferências e próximo número de OS
- `customers` — clientes
- `motorcycles` — motos
- `service_orders` — ordens de serviço

### Continuam só no localStorage

- Pagamentos / lançamentos financeiros
- Estoque, peças, fornecedores, movimentações
- Fotos da OS
- Recibos (gerados na hora)
- Relatórios (calculados dos dados)
- Usuários / auth local

---

## Pré-requisitos

1. Projeto Supabase criado e schema aplicado (`docs/supabase-schema.sql`)
2. Políticas RLS temporárias aplicadas (`docs/supabase-sync-policies.sql`)
3. `.env.local` com URL e anon key
4. **Recomendado:** sincronização manual já executada (Configurações → Backup e Segurança)

---

## Modo Local (padrão)

No `.env.local`:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-public

VITE_CRAFT_PERSISTENCE=local
```

Reinicie o servidor:

```bash
npm run dev
```

No topo do app: **Banco: Local**

---

## Modo Supabase (experimental)

No `.env.local`, altere apenas:

```env
VITE_CRAFT_PERSISTENCE=supabase
```

Reinicie o servidor (`npm run dev`).

### O que esperar

1. Badge no topo: **Banco: Supabase**
2. Ao abrir o app, carrega backup local primeiro e depois mescla dados do Supabase
3. Criar/editar **cliente, moto ou OS** grava no Supabase e mantém cópia local
4. Estoque, pagamentos etc. continuam só no navegador

### Status possíveis

| Badge | Significado |
|-------|-------------|
| **Banco: Supabase** | Modo nuvem ativo, sem fallback |
| **Banco: Supabase com fallback local** | Falha ao falar com Supabase; dados salvos localmente |
| **Offline aguardando sincronização** | Sem internet ou itens na fila de sync |

Um aviso amarelo aparece abaixo do cabeçalho quando há fallback ou fila pendente.

---

## Como voltar para Local se algo der errado

1. Pare o servidor (Ctrl+C)
2. No `.env.local`:

   ```env
   VITE_CRAFT_PERSISTENCE=local
   ```

3. `npm run dev`

Os dados locais **não são apagados**. O app volta a usar só o localStorage. O que estiver no Supabase permanece lá para quando reativar o modo experimental.

---

## Teste: criar cliente, moto e OS

### 1. Ativar modo supabase

```env
VITE_CRAFT_PERSISTENCE=supabase
```

Reinicie o app e confirme **Banco: Supabase** no topo.

### 2. Criar cliente

1. Menu **Clientes** → **Novo cliente**
2. Preencha nome e telefone → Salvar
3. No Supabase **Table Editor → customers** → deve aparecer o registro

### 3. Criar moto

1. Menu **Motos** → **Nova moto**
2. Vincule ao cliente criado → Salvar
3. Confira em **motorcycles** no Supabase

### 4. Criar OS

1. Menu **Ordens de Serviço** → **Nova OS**
2. Selecione cliente e moto → preencha defeito → Salvar
3. Confira em **service_orders** no Supabase
4. Teste **PDF** e **recibo** — devem continuar funcionando (dados locais + OS carregada)

### 5. Teste de fallback (opcional)

1. Com o app aberto, desligue a internet
2. Edite um cliente → deve aparecer aviso de fallback / fila
3. Badge: **Offline aguardando sincronização**
4. Ligue a internet → fila processa automaticamente

---

## Verificar registros no Supabase

1. [Supabase Dashboard](https://supabase.com/dashboard) → seu projeto
2. **Table Editor**
3. Tabelas: `offices`, `settings`, `customers`, `motorcycles`, `service_orders`
4. Filtre por `office_id` se houver várias oficinas no futuro

Consulta SQL útil:

```sql
SELECT 'customers' AS tabela, count(*) FROM customers
UNION ALL
SELECT 'motorcycles', count(*) FROM motorcycles
UNION ALL
SELECT 'service_orders', count(*) FROM service_orders;
```

---

## Solução de problemas

| Problema | Solução |
|----------|---------|
| Badge continua "Local" | Confirme `VITE_CRAFT_PERSISTENCE=supabase` e reinicie `npm run dev` |
| Erro permission denied | Execute `docs/supabase-sync-policies.sql` |
| Oficina não encontrada no Supabase | Rode sincronização manual antes do modo experimental |
| Dados diferentes local vs nuvem | Use sincronização manual ou volte para local e compare |
| Fila com pendências | Volte online; aguarde processamento automático |

---

## Segurança

- Use **apenas** a chave **anon public** no frontend
- **Nunca** use `service_role` no app
- Login real ainda **não** está ativo
- localStorage permanece como backup — não é apagado no modo experimental

---

*Modo experimental — fase 1. Pagamentos, estoque e fotos serão migrados em fases futuras.*
