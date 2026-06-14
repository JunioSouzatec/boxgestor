# Teste isolado do Supabase Auth

Este guia explica como manter o **modo local** funcionando enquanto testa o **login real do Supabase** de forma controlada, sem ativar o auth em todo o app.

## Modo local (padrão seguro)

No `.env.local`, mantenha:

```env
VITE_CRAFT_AUTH=local
VITE_CRAFT_PERSISTENCE=local
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon
```

Com isso:

- O app abre com o usuário demo local (`demo@craft.com` / `craft123`)
- Dados, logo, OS, clientes e demais módulos continuam no **localStorage**
- O Supabase Auth **não** controla as rotas nem o login principal

Reinicie o servidor após alterar o `.env.local`:

```bash
npm run dev
```

## Pré-requisitos no Supabase

1. Execute `docs/supabase-schema.sql` no SQL Editor (tabelas `offices`, `profiles`, etc.)
2. Execute `docs/supabase-auth-rls.sql` (RPC `create_office_for_new_user` + políticas RLS)
3. Em **Authentication → Providers → Email**, desabilite a confirmação de e-mail **em dev** (opcional, facilita testes)
4. Nunca use `service_role` no frontend — apenas a chave **anon**

## Onde fica a área de teste

1. Abra o app em modo local e entre com a conta demo
2. Vá em **Configurações**
3. Role até o card **Backup e Segurança**
4. A seção **Teste de Login Supabase** aparece apenas para usuários com cargo **Dono**

Essa área é **independente** do login local: ela usa o cliente Supabase diretamente, sem alterar `VITE_CRAFT_AUTH`.

## O que a área de teste mostra

| Item | Descrição |
|------|-----------|
| VITE_SUPABASE_URL | Se a variável está definida |
| VITE_SUPABASE_ANON_KEY | Se a chave anon está definida |
| Modo do app | Sempre "Login: Demo (local)" enquanto `VITE_CRAFT_AUTH=local` |
| Sessão Supabase | Usuário logado **apenas** no Supabase Auth (separado do demo local) |
| Perfil | Registro em `profiles` vinculado ao usuário |
| Office ID / Oficina | Oficina em `offices` vinculada ao perfil |

### Mensagens de status

| Situação | Mensagem |
|----------|----------|
| Sem sessão Supabase | "Nenhum usuário Supabase logado." |
| Usuário sem profile | "Usuário sem perfil. Criar perfil." |
| Profile sem oficina | "Usuário sem oficina. Criar oficina." |
| Tudo OK | "Usuário, perfil e oficina vinculados corretamente." |

## Fluxo recomendado de teste

### 1. Verificar variáveis e conexão

1. Confira se URL e anon key aparecem como **OK**
2. Clique em **Testar conexão Supabase Auth**
3. Deve retornar sucesso (com ou sem sessão ativa)

### 2. Criar conta de teste

1. Preencha e-mail, senha (mín. 6 caracteres) e nome do responsável
2. Clique em **Criar conta de teste**
3. Se a confirmação de e-mail estiver ativa no Supabase, confirme o e-mail antes de entrar

### 3. Entrar com conta de teste

1. Use o mesmo e-mail e senha
2. Clique em **Entrar com conta de teste**
3. A sessão Supabase aparece na área de status (o login local do app **não muda**)

### 4. Criar primeira oficina

1. Com usuário Supabase logado e **sem perfil**, preencha:
   - Nome da oficina
   - Telefone / WhatsApp
   - Cidade
   - Estado
2. Clique em **Criar oficina para usuário logado**
3. A RPC `create_office_for_new_user`:
   - Insere em `offices`
   - Cria `profiles` com cargo **owner** (Dono)
   - Vincula `office_id`
   - Cria registro em `settings`

### 5. Verificar perfil e oficina

- **Verificar perfil** — confirma registro em `profiles`
- **Verificar oficina vinculada** — confirma registro em `offices`

### 6. Sair da conta Supabase

- **Sair da conta Supabase** encerra apenas a sessão Supabase
- O app continua logado no modo demo local

## Verificar no Supabase Table Editor

Após criar conta e oficina:

1. **Authentication → Users** — usuário com o e-mail de teste
2. **Table Editor → profiles** — linha com `id` = user id, `role` = `owner`, `office_id` preenchido
3. **Table Editor → offices** — oficina com nome, telefone e endereço (cidade - estado)
4. **Table Editor → settings** — registro com o mesmo `office_id`

## Funções reutilizáveis (código)

Disponíveis em `src/services/auth/supabase-auth-safe.service.ts` (reexportadas em `src/lib/supabase-auth-safe.ts`):

| Função | Uso |
|--------|-----|
| `getAuthMode()` | Modo do app (`local` ou `supabase`) |
| `getCurrentSupabaseUser()` | Usuário da sessão Supabase atual |
| `getCurrentProfile()` | Profile do usuário logado |
| `getCurrentOffice()` | Oficina vinculada ao profile |
| `ensureProfileForUser()` | Verifica perfil; orienta criar oficina se ausente |
| `ensureOfficeForUser()` | Cria oficina + profile via RPC segura |

Todas tratam `null`/`undefined` sem lançar erros não tratados.

## Quando ativar login real no app inteiro

**Somente depois** de validar nesta área de teste:

1. Conta criada e login OK
2. Profile e oficina vinculados
3. RLS funcionando (`docs/supabase-auth-rls.sql` executado)

Então altere (em ambiente de homologação, não em produção imediata):

```env
VITE_CRAFT_AUTH=supabase
VITE_CRAFT_PERSISTENCE=supabase
```

Isso fará o app usar Supabase Auth em todas as rotas — **não faça isso antes de concluir os testes isolados**.

## Segurança

- Dados locais (`localStorage`) **não são apagados** pelos testes Supabase
- A logo e configurações locais permanecem intactas
- Erros são exibidos na própria área de teste — nunca tela preta
- O modo local continua sendo o padrão recomendado para uso diário

## Solução de problemas

| Problema | Ação |
|----------|------|
| RPC não encontrada | Execute `docs/supabase-auth-rls.sql` |
| E-mail não confirmado | Desabilite confirmação em dev ou confirme o e-mail |
| Perfil já existe | Use Verificar perfil / Verificar oficina |
| RLS bloqueia leitura | Normal antes do profile; crie a oficina via botão dedicado |
| URL/anon ausentes | Verifique `.env.local` e reinicie `npm run dev` |
