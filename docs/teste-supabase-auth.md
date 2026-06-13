# Teste — Supabase Auth (login real)

## Variáveis (.env.local)

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon
VITE_CRAFT_AUTH=supabase
VITE_CRAFT_PERSISTENCE=supabase
```

Reinicie o servidor após alterar: `npm run dev`

## SQL obrigatório (ordem)

1. `docs/supabase-schema.sql`
2. `docs/supabase-auth-rls.sql`

Não use `docs/supabase-sync-policies.sql` com auth RLS ativo.

## Dashboard Supabase

- Email provider habilitado
- Dev: desabilite confirmação de e-mail para login imediato
- Redirect URLs: `http://localhost:5173`

## Migrar dados demo

Configurações → Backup e Segurança → Migrar dados locais para minha oficina no Supabase
