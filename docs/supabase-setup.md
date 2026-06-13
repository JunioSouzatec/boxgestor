# Supabase — Guia de Configuração (Craft Oficina)

Este guia prepara o **Craft** para integração com Supabase **sem alterar o comportamento atual** do app. Por padrão, os dados continuam no **localStorage**.

---

## Pré-requisitos

- Conta em [supabase.com](https://supabase.com)
- Node.js 18+
- Projeto Craft clonado localmente

---

## 1. Criar projeto no Supabase

1. Acesse **New project** no dashboard Supabase
2. Escolha região próxima (ex.: South America)
3. Anote a **senha do banco** (guarde em local seguro)

---

## 2. Executar o schema SQL

1. No dashboard: **SQL Editor → New query**
2. Cole o conteúdo de [`supabase-schema.sql`](./supabase-schema.sql)
3. Execute (**Run**)

Isso cria:

| Tabela | Descrição |
|--------|-----------|
| `offices` | Oficinas (tenants) |
| `profiles` | Usuários ↔ oficina (login futuro) |
| `settings` | Preferências e contador de OS |
| `customers` | Clientes |
| `motorcycles` | Motos |
| `service_orders` | Ordens de serviço |
| `service_order_photos` | Fotos da OS |
| `appointments` | Agenda |
| `inventory_items` | Estoque |
| `financial_transactions` | Financeiro |
| `warranties` | Garantias |

Todas incluem `id`, `created_at`, `updated_at` e `office_id` quando aplicável.

---

## 3. Configurar variáveis de ambiente

```bash
cp .env.example .env.local
```

Edite `.env.local`:

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
VITE_CRAFT_PERSISTENCE=local
```

| Variável | Onde encontrar |
|----------|----------------|
| `VITE_SUPABASE_URL` | Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Settings → API → anon public |

> **Importante:** mantenha `VITE_CRAFT_PERSISTENCE=local` até login e repositório Supabase estarem implementados.

---

## 4. Verificar instalação (opcional)

O client Supabase é inicializado em `src/lib/supabase.ts` apenas se as variáveis existirem. O app **não exige** `.env.local` para funcionar hoje.

```bash
npm run dev
```

Sem `.env.local`, tudo continua via localStorage.

---

## 5. Storage para fotos de OS (futuro)

1. **Storage → New bucket** → nome: `service-order-photos`
2. Marque como **private**
3. Políticas sugeridas (após login):

```sql
-- Exemplo: path = {office_id}/{service_order_id}/{filename}
CREATE POLICY "office_photos_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'service-order-photos'
    AND (storage.foldername(name))[1] = public.current_office_id()::text
  );
```

---

## 6. Auth e RLS (futuro — não ativar ainda)

O schema já inclui:

- Tabela `profiles` ligada a `auth.users`
- RLS **habilitado** em todas as tabelas
- Políticas **comentadas** em `supabase-schema.sql`
- Função `current_office_id()` para isolamento por tenant

**Quando implementar login:**

1. Ativar Auth (email/senha ou OAuth) no dashboard
2. Descomentar políticas RLS no SQL
3. Implementar `SupabaseCraftRepository` (`src/services/repository/supabase.repository.ts`)
4. Criar telas de login e onboarding (escolha de oficina)
5. Alterar `.env.local`: `VITE_CRAFT_PERSISTENCE=supabase`

---

## 7. Arquitetura de persistência

```
┌─────────────────────────────────────────┐
│  UI (React) — sem alterações              │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  CraftDataService                       │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  createCraftRepository()  ← factory     │
│    ├─ local  (ATIVO)                    │
│    └─ supabase (preparado)              │
└─────────────────────────────────────────┘
```

Trocar a persistência = alterar factory + implementar mappers app ↔ SQL.

---

## 8. Gerar tipos TypeScript do banco (opcional)

Com [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase gen types typescript --linked > src/types/supabase.generated.ts
```

Compare com `src/types/supabase.ts` e mescle conforme necessário.

---

## 9. Migrar dados do localStorage (futuro)

Script planejado:

1. Ler `craft_database_v1` do localStorage
2. Inserir `offices` + `settings`
3. Upsert `customers`, `motorcycles`, etc. preservando UUIDs quando possível
4. Validar contagem e totais financeiros

---

## Checklist de ativação Supabase

- [ ] Schema SQL executado
- [ ] `.env.local` configurado
- [ ] Auth habilitado
- [ ] RLS policies aplicadas
- [ ] `SupabaseCraftRepository` implementado
- [ ] Mappers app ↔ SQL testados
- [ ] Login + seleção de oficina
- [ ] `VITE_CRAFT_PERSISTENCE=supabase`
- [ ] Migração de dados demo validada

---

## Referências

- [database-architecture.md](./database-architecture.md) — modelo de dados app
- [supabase-schema.sql](./supabase-schema.sql) — DDL completo
- [Documentação Supabase](https://supabase.com/docs)
