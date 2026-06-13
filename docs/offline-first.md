# Modo offline-first — Craft Oficina

Este documento descreve a estratégia offline-first do Craft: a oficina continua operando sem internet e os dados são sincronizados quando a conexão voltar.

## Princípio

**Local primeiro.** Todas as operações (clientes, motos, OS, estoque, financeiro, lembretes etc.) são gravadas imediatamente no **localStorage** do navegador, keyed por `office_id`. A interface responde na hora — não depende de rede para cadastrar ou consultar.

A integração com **Supabase** (nuvem) será incremental: quando houver internet, uma fila de sincronização enviará as alterações pendentes.

## Arquitetura atual

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   React UI      │────▶│  CraftDataService    │────▶│ localStorage    │
│   (telas)       │     │  + repositório local │     │ craft_tenants…  │
└─────────────────┘     └──────────────────────┘     └─────────────────┘
                                    │
                                    ▼ (futuro)
                        ┌──────────────────────┐
                        │  SyncQueueService    │
                        │  craft_sync_queue_v1 │
                        └──────────────────────┘
                                    │
                                    ▼ (futuro)
                        ┌──────────────────────┐
                        │      Supabase        │
                        └──────────────────────┘
```

### Storages locais (exemplos)

| Chave | Conteúdo |
|-------|----------|
| `craft_tenants_v1` | Clientes, motos, OS, peças, financeiro, agenda |
| `craft_auth_v1` | Sessão e usuários |
| `craft_assinaturas_v1` | Plano da oficina |
| `craft_lembretes_v1` | Lembretes e regras |
| `craft_comunicacao_v1` | Histórico WhatsApp |
| `craft_sync_queue_v1` | Fila de sincronização (pendências) |

## Fila de sincronização

Arquivo: `src/services/sync/sync-queue.service.ts`

Cada alteração que no futuro for replicada na nuvem pode ser registrada com:

| Campo | Descrição |
|-------|-----------|
| `tipo_acao` | `create`, `update`, `delete` |
| `entidade` | Ex.: `cliente`, `ordem_servico`, `lancamento` |
| `entidade_id` | ID local do registro |
| `payload` | Snapshot opcional dos dados |
| `criado_em` | Data/hora da operação |
| `status` | `pendente`, `sincronizado`, `erro` |
| `tentativas` | Contador de retentativas |
| `erro_mensagem` | Detalhe quando `status = erro` |

### API disponível hoje

- `syncQueueService.enfileirar({ ... })` — adiciona ou atualiza item pendente
- `syncQueueService.listar(officeId, status?)` — lista itens
- `syncQueueService.contarPendentes(officeId)` — contagem para badge futuro
- `syncQueueService.marcarSincronizado(id)` — após sucesso no Supabase
- `syncQueueService.marcarErro(id, mensagem)` — falha de rede/API
- `syncQueueService.reprocessar(id)` — volta item com erro para `pendente`
- `syncQueueService.limparSincronizados(officeId)` — housekeeping

> **Nota:** A fila já está implementada, mas **ainda não está ligada** aos commits do repositório. Isso evita quebrar o fluxo atual. Na fase Supabase, o `CraftDataService` chamará `enfileirar` após cada `salvar`.

## Status online / offline

- Hook: `src/hooks/useOnlineStatus.ts` — escuta `online` / `offline` do navegador
- UI: `IndicadorConexao` no header (Online / Offline)
- Aviso: barra discreta quando offline — *"Modo offline: os dados serão sincronizados quando a internet voltar."*

Offline **não bloqueia** o uso do app: cadastros e edições seguem funcionando no localStorage.

## Sincronização futura (Supabase)

Fluxo planejado:

1. Usuário altera dado → grava local → `enfileirar` com status `pendente`
2. Evento `online` ou intervalo periódico → worker lê fila pendente
3. Para cada item: `upsert` / `delete` no Supabase com `office_id`
4. Sucesso → `marcarSincronizado`; falha → `marcarErro` + backoff
5. Pull periódico: buscar alterações remotas mais recentes (`updated_at`) e mesclar

## Conflitos de dados

Estratégia recomendada para a v1 cloud:

- **Last-write-wins** por campo, usando `updated_at` no registro
- Registros com conflito grave (ex.: mesma OS editada offline em dois dispositivos) → marcar `status = erro` na fila e exibir tela de resolução manual para Dono/Gerente
- IDs locais já são UUID (`crypto.randomUUID`) — compatíveis com Supabase

## Backup

Recomendações para a oficina:

1. **Exportação manual** — tela Configurações (restaurar/exportar dados) — Dono
2. **Backup automático na nuvem** — após Supabase ativo, backup diário via RLS por `office_id`
3. **Cópia local** — periodicamente exportar JSON do localStorage em máquina da oficina

Antes de limpar cache do navegador, exportar dados ou confirmar sincronização concluída.

## Checklist para desenvolvedores

- [ ] Conectar `enfileirar` no `CraftDataService.commit`
- [ ] Implementar `SyncWorker` no evento `online`
- [ ] Supabase: tabelas espelhando entidades + RLS por `office_id`
- [ ] Tela admin: fila pendente / erros
- [ ] Service Worker (PWA) para cache de assets — opcional

## Referências no código

- `src/services/repository/local.repository.ts` — persistência local multi-tenant
- `src/services/sync/sync-queue.service.ts` — fila
- `src/types/sync.ts` — tipos da fila
- `src/components/layout/IndicadorConexao.tsx` — indicador visual
- `src/components/shared/MoneyInput.tsx` — valores monetários (independente de rede)
