# Approval Links — variáveis de ambiente (A2.1B)

Usadas pelas Edge Functions:

- `approval-link-create`
- `approval-link-get`
- `approval-link-respond`

## Obrigatórias

| Variável | Uso |
|----------|-----|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Client admin (bypass RLS). Alternativa: `SUPABASE_SECRET_KEYS` (JSON) |

## create (autenticado)

| Variável | Uso |
|----------|-----|
| `SUPABASE_ANON_KEY` | Validar JWT do usuário. Alternativa: `SUPABASE_PUBLISHABLE_KEYS` (JSON) |
| `PUBLIC_APP_URL` | Origem do app para montar URL pública (ex.: `https://boxgestor.vercel.app`). Se ausente, retorna path relativo `/aprovar-orcamento/:token`. |

## get / respond (público)

Não precisam de anon key; usam só `SUPABASE_URL` + service role.

## Regras

- Nunca commitar valores reais de keys.
- Nunca logar token bruto.
- Nunca salvar token/token_hash/URL com token em `craft_meta`.
- Após migration aplicada e secrets configurados:

```bash
supabase functions deploy approval-link-create
supabase functions deploy approval-link-get
supabase functions deploy approval-link-respond
```
