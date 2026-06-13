# PWA e modo offline — Craft Oficina

O Craft Oficina é um **Progressive Web App (PWA)**: pode ser instalado no Windows como um aplicativo independente e continua funcionando sem internet após o primeiro carregamento.

Documentação complementar: [offline-first.md](./offline-first.md) (fila de sync e arquitetura local-first).

## O que é o PWA no Craft

| Recurso | Descrição |
|---------|-----------|
| **Instalação** | Ícone na área de trabalho / menu Iniciar |
| **Janela própria** | Abre sem barra do navegador (`display: standalone`) |
| **Cache offline** | Interface (HTML, JS, CSS) servida pelo Service Worker |
| **Dados locais** | Cadastros em `localStorage` — independentes do cache |
| **Tema escuro** | `theme_color` e `background_color` `#09090b` |

### Manifest (`vite.config.ts` → `vite-plugin-pwa`)

- **name:** Craft Oficina  
- **short_name:** Craft  
- **description:** Gestão premium para oficina de motos  
- **lang:** pt-BR  
- **display:** standalone  

### Ícones

Pasta `public/icons/`:

| Arquivo | Uso |
|---------|-----|
| `icon-192.png` | Android, atalho, Apple touch |
| `icon-512.png` | Splash, instalação, maskable |
| `icon.svg` | Fallback vetorial (letra C, tema escuro) |

Substitua os PNG provisórios pela logo final quando disponível, mantendo os mesmos nomes e tamanhos.

## Como instalar no Windows

### Chrome ou Edge (recomendado)

1. Acesse o Craft Oficina logado (`npm run dev` ou URL de produção).
2. Aguarde o carregamento completo (primeira visita cacheia os arquivos).
3. **Opção A:** Clique em **Instalar app** no header ou em **Configurações → Aplicativo instalável**.
4. **Opção B:** Menu do navegador (⋮) → **Instalar Craft Oficina** / **Aplicativo disponível**.
5. Confirme a instalação. O app abrirá em janela própria.

### Requisitos

- HTTPS em produção (ou `localhost` em desenvolvimento).
- Navegador Chromium recente (Chrome, Edge, Brave).
- Manifest + Service Worker registrados (gerados no `npm run build`).

## Como testar sem internet

### Produção (recomendado)

```bash
npm run build
npm run preview
```

1. Abra `http://localhost:4173` (ou a porta indicada).
2. Navegue pelas telas principais (Dashboard, Clientes, Motos, OS) **com internet**.
3. DevTools → **Application** → confirme **Service Worker** ativo.
4. DevTools → **Network** → marque **Offline**.
5. Recarregue a página — a interface deve abrir.
6. Cadastre um cliente ou OS — dados vão para `localStorage`.

### Desenvolvimento

O Service Worker também está habilitado em `npm run dev` (`devOptions.enabled`). Após a primeira carga, teste offline da mesma forma.

### Aviso offline

Com internet indisponível, a barra no topo exibe:

> *Modo offline: os dados serão sincronizados quando a internet voltar.*

Isso **não bloqueia** o uso do sistema.

## Quais dados ficam locais

Tudo que a oficina cadastra permanece no **localStorage** do navegador/dispositivo:

- Clientes, motos, ordens de serviço  
- Financeiro, estoque, agenda  
- Usuários, plano, lembretes, comunicação  
- Fila de sincronização (`craft_sync_queue_v1`)  

O **Service Worker** cacheia apenas **arquivos estáticos** (JS, CSS, HTML, ícones, fontes). Ele **não apaga** nem substitui o `localStorage`.

## Limites do modo offline

| Funciona offline | Não funciona offline (hoje) |
|------------------|----------------------------|
| Abrir telas já visitadas / cacheadas | Login em **novo** dispositivo sem cache |
| CRUD completo via localStorage | Sincronização Supabase (futuro) |
| Relatórios sobre dados locais | APIs externas (pagamento, etc.) |
| WhatsApp Web (abre se o app WhatsApp estiver ok) | Fontes Google na **primeira** visita sem cache |

**Primeira visita 100% offline:** se o usuário nunca abriu o app online, o Service Worker ainda não instalou o cache — é necessário pelo menos **uma** sessão online.

**Outro computador:** dados não aparecem automaticamente até existir sync na nuvem.

## Service Worker e cache

Gerenciado por **Workbox** via `vite-plugin-pwa`:

- **Precache:** bundles JS/CSS, `index.html`, ícones  
- **Navigate fallback:** rotas SPA → `index.html` (Dashboard, Clientes, etc.)  
- **Runtime cache:** Google Fonts (CacheFirst)  
- **Atualização:** `registerType: 'autoUpdate'` — nova versão ao recarregar  

Registro em `src/main.tsx` com `virtual:pwa-register`.

## Sincronização futura

Quando o Supabase estiver conectado:

1. Alterações locais → `syncQueueService.enfileirar()`  
2. Evento `online` → worker processa fila pendente  
3. Conflitos → resolução por `updated_at` (ver `offline-first.md`)  

O PWA e a fila de sync foram projetados para conviver: cache de **interface**, `localStorage` de **dados**, fila de **replicação**.

## Comandos úteis

```bash
# Instalar dependência PWA (já no package.json)
npm install

# Desenvolvimento
npm run dev

# Build + preview (teste PWA real)
npm run build
npm run preview
```

## Arquivos relevantes

| Arquivo | Função |
|---------|--------|
| `vite.config.ts` | Manifest + Workbox |
| `src/main.tsx` | Registro do Service Worker |
| `src/hooks/usePwaInstall.ts` | Prompt de instalação |
| `src/components/pwa/BotaoInstalarApp.tsx` | Botão "Instalar app" |
| `public/icons/*` | Ícones do app |
| `src/components/layout/IndicadorConexao.tsx` | Online / Offline |
