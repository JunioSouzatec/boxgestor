# Deploy online — BoxGestor (Vercel / Netlify)

Guia para publicar o app com **Supabase** como banco real, sem refazer o projeto.

> **Nota sobre prefixo CRAFT:** variáveis como `VITE_CRAFT_AUTH` e `VITE_CRAFT_PERSISTENCE` mantêm o nome histórico do projeto. Funcionam normalmente; o app exibe **BoxGestor** via `VITE_APP_NAME`.

---

## 1. Pré-requisitos

- Projeto Supabase criado
- SQLs executados manualmente (ordem abaixo)
- Conta Vercel ou Netlify
- Repositório Git conectado (recomendado)

---

## 2. SQL no Supabase (executar manualmente, nesta ordem)

| # | Arquivo | O que faz |
|---|---------|-----------|
| 1 | `docs/supabase-schema.sql` | Schema base (oficinas, clientes, OS, etc.) |
| 2 | `docs/supabase-auth-rls.sql` | Auth, profiles, RLS, RPC `create_office_for_new_user` |
| 3 | `docs/supabase-plans-permissions.sql` | Colunas `plan_tier`, `trial_started_at`, permissões |
| 4 | `docs/supabase-cadastro-publico.sql` | Cadastro público + Teste Premium no signup |
| 5 | `docs/supabase-user-invites.sql` | Convites de usuário |
| 6 | `docs/supabase-upgrade-requests.sql` | Solicitações de upgrade (opcional, se usar online) |
| 7 | `docs/supabase-payments-finance.sql` | Pagamentos / financeiro |
| 8 | `docs/supabase-payments-idempotency.sql` | Idempotência de pagamentos |
| 9 | `docs/supabase-inventory-os-items.sql` | Itens de OS / estoque (se ainda não aplicado) |
| 10 | `docs/supabase-admin-system.sql` | Admin BoxGestor: listar oficinas, planos, trial |

**Correções RLS** (se necessário no seu projeto):

- `docs/supabase-fix-rls-office.sql`
- `docs/supabase-fix-rls-v2.sql`
- `docs/supabase-fix-service-orders-rls.sql`
- `docs/supabase-fix-payments-rls.sql`
- `docs/supabase-sync-policies.sql`

**Não executar em produção:**

- `docs/supabase-reset-office-test-data.sql` — apenas limpeza de testes

**Após `supabase-admin-system.sql`**, cadastre seu e-mail admin:

```sql
INSERT INTO public.system_admin_emails (email) VALUES ('seu@email.com');
```

---

## 3. Supabase Auth — URLs para configurar

No painel Supabase → **Authentication** → **URL Configuration**:

| Campo | Valor |
|-------|--------|
| **Site URL** | URL pública do deploy (ex.: `https://seu-app.vercel.app`) |
| **Redirect URLs** | Adicione **todas** as URLs abaixo |

```
http://localhost:5173
http://localhost:5173/login
http://localhost:5173/convite/*
https://SEU-DOMINIO.vercel.app
https://SEU-DOMINIO.vercel.app/login
https://SEU-DOMINIO.vercel.app/convite/*
```

Substitua `SEU-DOMINIO` pela URL real após o primeiro deploy. Para Netlify, use o domínio `.netlify.app` equivalente.

**E-mail de confirmação / reset de senha:** o app usa `VITE_APP_URL` ou `window.location.origin` — não há URL fixa de localhost no código.

---

## 4. Variáveis na Vercel / Netlify

Configure em **Environment Variables** (Production):

| Variável | Valor | Obrigatório |
|----------|-------|-------------|
| `VITE_SUPABASE_URL` | Project URL do Supabase | Sim |
| `VITE_SUPABASE_ANON_KEY` | anon public key | Sim |
| `VITE_CRAFT_AUTH` | `supabase` | Sim (recomendado) |
| `VITE_CRAFT_PERSISTENCE` | `supabase` | Sim (recomendado) |
| `VITE_APP_NAME` | `BoxGestor` | Opcional |
| `VITE_APP_URL` | `https://seu-app.vercel.app` | Recomendado |
| `VITE_SYSTEM_ADMIN_EMAILS` | `seu@email.com` | Sim (Admin BoxGestor) |

> Em build **PROD** com Supabase configurado, auth e persistência já defaultam para `supabase` se não estiver `VITE_CRAFT_*=local`.

**Build command:** `npm run build`  
**Output directory:** `dist`

Arquivos incluídos no repo:

- `vercel.json` — rewrite SPA
- `netlify.toml` — redirect SPA

---

## 5. O que usa Supabase vs localStorage (produção)

### No Supabase (modo `VITE_CRAFT_AUTH=supabase` + `VITE_CRAFT_PERSISTENCE=supabase`)

| Dado | Onde |
|------|------|
| Usuários / login | Supabase Auth + `profiles` |
| Oficinas (cadastro) | `offices` + RPC signup |
| Planos / Teste Premium | `offices.plan_tier`, `trial_*` (+ cache local UI) |
| Admin listar oficinas | RPC `admin_list_offices` |
| Convites | `user_invites` (modo Supabase) |
| Clientes, motos, OS (fase 1) | Supabase via `hybrid.repository` |
| Pagamentos / financeiro | Supabase (com SQL aplicado) |

### Ainda em localStorage (cache ou pendente de migração)

| Dado | Observação |
|------|------------|
| Cache de assinatura/plano | Espelho da UI; fonte real = Supabase online |
| Solicitações de upgrade | `craft_upgrade_requests_v1` — local por enquanto |
| Estoque / lançamentos / agendamentos | Parcialmente local se não sincronizados |
| Fila de sync, id-registry | Metadados técnicos de sincronização |
| Lembretes, comunicação | localStorage |
| Modo demo (`VITE_CRAFT_AUTH=local`) | Tudo local — **não usar em produção** |

localStorage continua aceitável para **preferências visuais**, cache de sync e filas — **não** como única fonte em produção.

---

## 6. Passo a passo para testar online

1. **Supabase:** executar SQLs da seção 2 (na ordem).
2. **Admin:** `INSERT INTO system_admin_emails` com seu e-mail.
3. **Auth URLs:** configurar Site URL e Redirect URLs (seção 3).
4. **Deploy:** conectar repo na Vercel ou Netlify; definir variáveis (seção 4).
5. **Build:** aguardar `npm run build` concluir sem erro.
6. **Cadastro:** abrir `https://seu-app/comece-agora` em outro PC/navegador anônimo.
7. **Verificar:** nova oficina → Teste Premium 7 dias → dashboard limpo.
8. **Admin:** login com e-mail em `VITE_SYSTEM_ADMIN_EMAILS` → `/admin-craft` → aba Oficinas → deve listar oficinas reais do Supabase.
9. **Convite:** criar convite de usuário → link deve usar domínio do deploy, não localhost.
10. **Funcional:** clientes, motos, OS, estoque, financeiro conforme SQLs aplicados.

---

## 7. Desenvolvimento local (continua funcionando)

`.env.local` exemplo:

```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_CRAFT_AUTH=supabase
VITE_CRAFT_PERSISTENCE=supabase
VITE_SYSTEM_ADMIN_EMAILS=seu@email.com
```

Redirect URLs devem incluir `http://localhost:5173`.

---

## 8. Segurança

- Admin BoxGestor (`/admin-craft`): apenas `VITE_SYSTEM_ADMIN_EMAILS` + RPC protegida por `is_system_admin()`.
- Oficinas clientes **não** veem SQL, logs técnicos, diagnóstico Supabase ou manutenção.
- Labels técnicas de login (modo demo/Supabase) ocultas em produção (`import.meta.env.DEV`).

---

## 9. Checklist rápido

- [ ] SQLs base executados
- [ ] `system_admin_emails` preenchido
- [ ] Auth URLs (local + produção)
- [ ] Variáveis Vercel/Netlify
- [ ] `npm run build` OK
- [ ] Cadastro online + trial
- [ ] Admin vê oficinas Supabase
- [ ] Convite com URL correta
