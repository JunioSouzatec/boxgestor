# Ativar login real com Supabase Auth

Guia para usar o Craft Oficina com **login real** e **banco Supabase**, mantendo opção segura de voltar ao **modo local demo**.

## Dois modos de operação

### Modo local (padrão seguro)

```env
VITE_CRAFT_AUTH=local
VITE_CRAFT_PERSISTENCE=local
```

- Abre com conta demo (`demo@craft.com` / `craft123`)
- Dados no **localStorage**
- Não depende de sessão Supabase
- Ideal para desenvolvimento e uso offline

### Modo Supabase (login real)

```env
VITE_CRAFT_AUTH=supabase
VITE_CRAFT_PERSISTENCE=supabase
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon
```

- Exige **login com e-mail e senha**
- Carrega **profile** e **office_id** do Supabase
- Dados fase 1 no Supabase: oficina, clientes, motos, OS
- Pagamentos, estoque, fotos, recibos e relatórios permanecem locais (com fallback)

Reinicie sempre após alterar `.env.local`:

```bash
npm run dev
```

## Pré-requisitos no Supabase

1. Execute `docs/supabase-schema.sql`
2. Execute `docs/supabase-auth-rls.sql` (RPC `create_office_for_new_user` + RLS)
3. Authentication → Providers → Email habilitado
4. Em dev, desabilite confirmação de e-mail (opcional)
5. Use apenas a chave **anon** no frontend — nunca `service_role`

## Fluxo de login (modo Supabase)

| Situação | Destino |
|----------|---------|
| Sem sessão | `/login` |
| Sessão sem profile | `/completar-cadastro` |
| Profile sem oficina | `/criar-oficina` |
| Tudo OK | Dashboard |

O app **nunca** abre o Dashboard antes de carregar sessão, profile e `office_id`.

## Criar conta

1. Acesse `/cadastro`
2. Preencha seus dados e da oficina (cidade e estado obrigatórios)
3. Conta criada em Authentication → Users
4. Oficina criada via RPC em `offices` + `profiles` (cargo Dono)

Se o e-mail exigir confirmação, confirme antes de entrar em `/login`.

## Criar oficina (onboarding)

Se entrou mas ainda não tem oficina vinculada:

1. Será redirecionado para `/completar-cadastro` ou `/criar-oficina`
2. Preencha nome, telefone, cidade e estado
3. Clique **Criar oficina e continuar**
4. Verifique no Table Editor: `profiles`, `offices`, `settings`

## Dados no Supabase (fase 1)

Salvos automaticamente com `office_id` do usuário logado:

- `offices` — configuração da oficina
- `settings` — preferências e metadados
- `customers` — clientes
- `motorcycles` — motos
- `service_orders` — ordens de serviço

**Permanecem locais** (com fila de sync se offline):

- Pagamentos / financeiro
- Estoque e fornecedores
- Fotos e recibos PDF
- Relatórios
- Backup local

Se o Supabase falhar ao salvar, os dados vão para **localStorage** e entram na **fila de sincronização**, com aviso na interface.

## Status no topo do app

Com login Supabase ativo, o header mostra:

- **Login: Supabase Auth**
- **Banco: Supabase** (ou *Supabase com fallback local* se offline/erro)
- **Nome da oficina**
- **Cargo do usuário**

## Voltar ao modo local

### Opção 1 — Alterar .env (recomendado)

```env
VITE_CRAFT_AUTH=local
VITE_CRAFT_PERSISTENCE=local
```

Reinicie `npm run dev`. Dados locais **não são apagados**.

### Opção 2 — Fallback runtime (em caso de erro)

Se o Supabase Auth falhar, a tela de erro oferece:

- **Tentar novamente**
- **Voltar para modo local** — ativa fallback no navegador e recarrega com conta demo

Para reativar Supabase depois do fallback, altere `.env.local` e clique em **limpe o fallback** na tela de erro, ou remova manualmente a chave `craft_force_local_v1` do localStorage.

## Testar no Supabase

Após login e criação de oficina:

| Onde | O que verificar |
|------|-----------------|
| Authentication → Users | E-mail do usuário |
| Table Editor → profiles | `office_id`, `role` = owner |
| Table Editor → offices | Nome, telefone, endereço |
| Table Editor → customers | Clientes criados no app |
| Table Editor → service_orders | OS criadas no app |

## Área de teste isolada (opcional)

Com `VITE_CRAFT_AUTH=local`, ainda é possível testar Supabase Auth em **Configurações → Backup e Segurança → Teste de Login Supabase**. Veja `docs/teste-supabase-auth.md`.

## Solução de problemas

| Problema | Solução |
|----------|---------|
| Tela de erro ao iniciar | Use **Voltar para modo local** ou corrija `.env` |
| Perfil não encontrado | Complete cadastro em `/completar-cadastro` |
| RPC não existe | Execute `docs/supabase-auth-rls.sql` |
| RLS bloqueia dados | Confirme login e `office_id` no profile |
| Dados não aparecem no Supabase | Verifique `VITE_CRAFT_PERSISTENCE=supabase` e conexão |
| Logo sumiu | Logo permanece no localStorage; reconfigure em Aparência se necessário |

## Segurança

- Consultas filtradas por `office_id` via RLS
- Usuário só acessa dados da própria oficina
- Sem `service_role` no frontend
- Modo local preservado como fallback
