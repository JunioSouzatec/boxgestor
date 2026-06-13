# Supabase — Passo a passo (Craft Oficina)

Guia rápido para preparar o projeto Supabase **sem alterar o funcionamento atual** do app (dados continuam no localStorage).

---

## 1. Colocar a chave anon no projeto

1. Na **raiz do projeto** (`CRAFT-OFICINA/`), abra ou crie o arquivo **`.env.local`**.
2. Use este formato (substitua a chave se regenerar no dashboard):

```env
VITE_SUPABASE_URL=https://fgarivlagocabyumniiz.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-public-aqui

VITE_CRAFT_PERSISTENCE=local
```

3. A chave correta está em: **Supabase Dashboard → Project Settings → API → Project URL** e **anon public**.
4. **Nunca** use `service_role` no frontend.
5. **Nunca** commite `.env.local` (já está no `.gitignore`).

Modelo sem chave real: copie de `.env.example`.

---

## 2. Criar as tabelas no Supabase

1. Acesse [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Abra o projeto **fgarivlagocabyumniiz**
3. No menu lateral: **SQL Editor**
4. Clique em **New query**
5. Abra no seu editor o arquivo **`docs/supabase-schema.sql`** deste repositório
6. Copie **todo** o conteúdo e cole no SQL Editor
7. Clique em **Run** (ou Ctrl+Enter)
8. Aguarde a mensagem de sucesso

---

## 3. Confirmar se as tabelas foram criadas

No Supabase: **Table Editor** (menu lateral).

Devem aparecer as tabelas principais:

| Tabela | Uso no Craft |
|--------|----------------|
| `offices` | Oficinas (multi-tenant) |
| `profiles` | Usuários ↔ oficina (login futuro) |
| `settings` | Preferências e número da próxima OS |
| `customers` | Clientes |
| `motorcycles` | Motos |
| `service_orders` | Ordens de serviço |
| `appointments` | Agenda |
| `inventory_items` | Estoque / peças |
| `financial_transactions` | Financeiro |

Tabelas extras já incluídas no schema: `service_order_photos`, `warranties`.

**SQL alternativo** — no SQL Editor, execute:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'offices', 'profiles', 'settings', 'customers', 'motorcycles',
    'service_orders', 'appointments', 'inventory_items', 'financial_transactions'
  )
ORDER BY table_name;
```

Deve retornar **9 linhas**.

---

## 4. Rodar o app localmente

```bash
npm install
npm run dev
```

1. Abra o endereço que o Vite mostrar (geralmente `http://localhost:5173`)
2. Faça login com o usuário local habitual (auth ainda é local)
3. No **console do navegador** (F12), em modo desenvolvimento, deve aparecer algo como:

   `[Craft Oficina] Supabase configurado (...). Persistência atual: localStorage.`

4. No **topo do app** (barra superior), confira o badge **Banco: Local**.
5. Vá em **Configurações → Backup e conexão Supabase** e clique em **Testar conexão Supabase**.
   - Sucesso: mensagem verde *"Supabase conectado"* (RLS bloqueando leitura sem login é normal).
   - Falha: mensagem vermelha com detalhe do erro.

Isso confirma que as variáveis foram lidas, mas **os dados ainda vêm do localStorage**.

---

## 5. O que ainda NÃO está ativo (propositalmente)

- Login real via Supabase Auth
- Gravação/leitura no Postgres em vez do localStorage
- Migração automática dos dados locais
- Políticas RLS ativas (estão preparadas no SQL, comentadas)

Para ativar no futuro: `VITE_CRAFT_PERSISTENCE=supabase` **somente após** implementar login e `SupabaseCraftRepository`.

---

## 6. Próximo passo manual no Supabase

Depois de executar o schema:

1. **Authentication → Providers** — deixe Email habilitado (para login futuro)
2. **Table Editor** — confira se as 9 tabelas existem
3. **Database → Roles** — não exponha `service_role` no frontend
4. (Opcional) **Storage** — criar bucket `service-order-photos` quando for usar fotos na nuvem

Documentação complementar: [`supabase-setup.md`](./supabase-setup.md) · [`database-architecture.md`](./database-architecture.md)

---

## 7. Solução de problemas

| Problema | O que fazer |
|----------|-------------|
| App não lê `.env.local` | Reinicie `npm run dev` após editar o arquivo |
| Console diz “Supabase não configurado” | Confira nomes `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` |
| Erro ao rodar SQL | Veja se enums/tabelas já existem; use projeto novo ou `DROP` manual com cuidado |
| Dados sumiram | Nesta fase os dados estão no **localStorage** do navegador, não no Supabase |

---

*Última atualização: preparação inicial da conexão — persistência permanece em localStorage.*
