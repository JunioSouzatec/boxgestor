# Notificação admin — nova oficina cadastrada

Aviso assíncrono para `contato@useboxgestor.com.br` quando uma office é criada com sucesso.

**Status desta fase:** código + testes + documentação locais.
**Ainda NÃO:** deploy Homolog/Production, secrets remotos, Database Webhook remoto, migration.

## Quando dispara

- Evento: `INSERT` em `public.offices`
- Cadastro concluído = RPC `create_office_for_new_user` (office + owner + settings)
- **Não** dispara só por `auth.users` (usuário sem office)

A Edge Function **não** é chamada pelo frontend. O cadastro **nunca** aguarda este e-mail.

## Edge Function

- Nome: `notify-admin-nova-oficina`
- Código: `supabase/functions/notify-admin-nova-oficina/`
- Lógica testável: `logic.ts`
- Handler Deno: `index.ts`

## Secrets (somente server-side / Edge Function Secrets)

| Secret | Uso |
|--------|-----|
| `ADMIN_OFFICE_WEBHOOK_SECRET` | Header do Database Webhook |
| `RESEND_API_KEY` | API Resend |
| `ADMIN_NOTIFY_TO` | Destinatário admin (ex.: `contato@useboxgestor.com.br`) |
| `ADMIN_NOTIFY_FROM` | Remetente (ex.: `BoxGestor <contato@useboxgestor.com.br>`) |

Supabase injeta automaticamente `SUPABASE_URL` + service role na função.

**Proibido:** `VITE_*`, frontend, repo, logs com API key.

## Autenticação do webhook

Header obrigatório:

```http
x-boxgestor-webhook-secret: <ADMIN_OFFICE_WEBHOOK_SECRET>
```

Secret ausente/incorreto → `401`, zero envio.

## Database Webhook — configuração futura (Homolog)

Projeto Homolog: `cqnktgouczyrxkkeusio`

No Dashboard Supabase → Database → Webhooks (ou Integrations):

| Campo | Valor |
|-------|--------|
| Table | `public.offices` |
| Events | `INSERT` |
| Type | HTTP Request / Supabase Edge Function |
| Destination | `notify-admin-nova-oficina` |
| HTTP Headers | `x-boxgestor-webhook-secret` = valor de `ADMIN_OFFICE_WEBHOOK_SECRET` |

Payload esperado (formato Database Webhook):

```json
{
  "type": "INSERT",
  "table": "offices",
  "schema": "public",
  "record": { "id": "<uuid>", "...": "..." },
  "old_record": null
}
```

## Resend — checklist antes do deploy Homolog

1. Conta Resend
2. Verificar domínio `useboxgestor.com.br`
3. Criar `RESEND_API_KEY` (somente Homolog secret)
4. Definir `ADMIN_NOTIFY_TO=contato@useboxgestor.com.br`
5. Definir `ADMIN_NOTIFY_FROM=BoxGestor <contato@useboxgestor.com.br>` (após domínio verificado)
6. Gerar `ADMIN_OFFICE_WEBHOOK_SECRET` forte e único Homolog
7. Deploy da função **só** no projeto Homolog
8. Criar o Database Webhook só em Homolog

Não coloque valores reais neste repositório.

## Idempotência

1. **Antes do envio:** se `settings.metadata.admin_nova_oficina_email_em` existir → `200 already_notified`, sem Resend
2. **Resend:** header `Idempotency-Key: boxgestor-nova-oficina/<office_id>`
3. **Após sucesso:** merge em `settings.metadata`:
   - `admin_nova_oficina_email_em`
   - `admin_nova_oficina_email_id`
   Preserva o restante do metadata.

Se o marker falhar depois do envio, retries do webhook ainda são deduplicados pela Idempotency-Key do Resend.

## Falha do e-mail

- Office / owner / trial permanecem
- Usuário continua podendo entrar
- Função retorna erro retryable (`502`/`503`) para o webhook tentar de novo
- Nenhum rollback de cadastro

## Testes locais

```bash
npx tsx --tsconfig tsconfig.app.json scripts/verificar-notificacao-nova-oficina.ts
```

Sem chamada real ao Resend.

## Production

Não configurar webhook/secrets/deploy em Production (`fgarivlagocabyumniiz`) até Homolog validado.
