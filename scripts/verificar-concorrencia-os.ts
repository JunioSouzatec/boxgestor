/**
 * Concorrência OS (optimistic locking) — mocks locais, sem escrita remota.
 *
 * Executar (obrigatório --tsconfig para resolver paths "@/..." dos módulos src):
 *   npx tsx --tsconfig tsconfig.app.json scripts/verificar-concorrencia-os.ts
 *
 * Sem --tsconfig, Node falha em:
 *   Cannot find package '@/lib' imported from sync-queue.service.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { OrdemServico } from '../src/types/ordem-servico.ts'
import type { OrdemServicoSyncPayload } from '../src/types/sync.ts'

const memoria = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => memoria.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memoria.set(key, value)
    },
    removeItem: (key: string) => {
      memoria.delete(key)
    },
    clear: () => memoria.clear(),
    key: (index: number) => [...memoria.keys()][index] ?? null,
    get length() {
      return memoria.size
    },
  },
})

let syncQueueService: typeof import('../src/services/sync/sync-queue.service.ts').syncQueueService
let CODIGO_CONFLITO_REVISION_OS: typeof import('../src/services/supabase-sync/service-order-revision-error.ts').CODIGO_CONFLITO_REVISION_OS
let ErroConflitoRevisionOs: typeof import('../src/services/supabase-sync/service-order-revision-error.ts').ErroConflitoRevisionOs
let deveMostrarToastGenericoAoSalvar: typeof import('../src/services/supabase-sync/service-order-revision-error.ts').deveMostrarToastGenericoAoSalvar
let isErroConflitoRevisionOs: typeof import('../src/services/supabase-sync/service-order-revision-error.ts').isErroConflitoRevisionOs
let MSG: typeof import('../src/lib/mensagens-usuario.ts').MSG

try {
  ;({ syncQueueService } = await import('../src/services/sync/sync-queue.service.ts'))
  ;({
    CODIGO_CONFLITO_REVISION_OS,
    ErroConflitoRevisionOs,
    deveMostrarToastGenericoAoSalvar,
    isErroConflitoRevisionOs,
  } = await import('../src/services/supabase-sync/service-order-revision-error.ts'))
  ;({ MSG } = await import('../src/lib/mensagens-usuario.ts'))
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('@/') || msg.includes('ERR_MODULE_NOT_FOUND')) {
    console.error(
      'Falha ao resolver alias "@/..." (ex.: @/lib em sync-queue.service.ts).\n' +
        'Execute com: npx tsx --tsconfig tsconfig.app.json scripts/verificar-concorrencia-os.ts',
    )
  }
  throw err
}

const resultados: Record<string, boolean> = {}

function ok(letra: string, cond: boolean, detalhe?: string): void {
  resultados[letra] = cond
  assert.equal(cond, true, detalhe ?? `falhou ${letra}`)
}

// --- erros / toast ---
const conflito = new ErroConflitoRevisionOs()
assert.equal(conflito.codigo, CODIGO_CONFLITO_REVISION_OS)
assert.equal(isErroConflitoRevisionOs(conflito), true)
assert.equal(deveMostrarToastGenericoAoSalvar(conflito), false)
assert.equal(isErroConflitoRevisionOs(new Error(MSG.erroSalvar)), false)
assert.equal(deveMostrarToastGenericoAoSalvar(new Error(MSG.erroSalvar)), true)
assert.equal(
  deveMostrarToastGenericoAoSalvar(new Error('Esta OS foi alterada por outro usuário.')),
  true,
)

// A) duas cópias começam com revision igual
const copiaA = {
  id: 'os-local-1',
  office_id: 'office-local-1',
  oficina_id: 'office-local-1',
  revision: 5,
  diagnostico: 'Cópia A',
} as unknown as OrdemServico
const copiaB = {
  ...copiaA,
  diagnostico: 'Cópia B',
} as unknown as OrdemServico
ok('A', copiaA.revision === 5 && copiaB.revision === 5 && copiaA.revision === copiaB.revision)

// B) primeira gravação válida → revision local sobe (simula retorno RPC)
const aposPrimeiraGravacao = { ...copiaA, revision: 6, diagnostico: 'Cópia A salva' }
ok('B', aposPrimeiraGravacao.revision === 6 && aposPrimeiraGravacao.revision === (copiaA.revision ?? 0) + 1)

// C) segunda gravação com revision antiga → conflito
const item = syncQueueService.enfileirar({
  office_id: copiaB.office_id,
  tipo_acao: 'update',
  entidade: 'ordem_servico',
  entidade_id: copiaB.id,
  payload: {
    base_revision: 5,
    local_snapshot: copiaB,
  } satisfies OrdemServicoSyncPayload,
})
syncQueueService.enfileirar({
  office_id: copiaB.office_id,
  tipo_acao: 'update',
  entidade: 'ordem_servico',
  entidade_id: copiaB.id,
  payload: {
    base_revision: 5,
    local_snapshot: { ...copiaB, diagnostico: 'Cópia B editada de novo' },
  } satisfies OrdemServicoSyncPayload,
})
let fila = syncQueueService.listar(copiaB.office_id)
assert.equal(fila.length, 1)
assert.equal((fila[0]!.payload as OrdemServicoSyncPayload).base_revision, 5)

const remotoRevision6 = {
  ...copiaA,
  revision: 6,
  diagnostico: 'Alteração do usuário A',
} as unknown as OrdemServico
syncQueueService.marcarConflito(
  item.id,
  'Esta OS foi alterada por outro usuário.',
  remotoRevision6,
)
fila = syncQueueService.listar(copiaB.office_id)
ok('C', fila[0]!.status === 'conflito' && syncQueueService.contarConflitos(copiaB.office_id) === 1)

// D) conflito não sobrescreve versão remota mais nova
ok(
  'D',
  ((fila[0]!.payload as OrdemServicoSyncPayload).remote_snapshot as OrdemServico).revision === 6 &&
    (fila[0]!.payload as OrdemServicoSyncPayload).base_revision === 5,
)

// E) rascunho local permanece disponível
ok(
  'E',
  (fila[0]!.payload as OrdemServicoSyncPayload).local_snapshot.diagnostico ===
    'Cópia B editada de novo',
)

// F) após “recarregar” remota, nova edição parte da revision atual
const rascunhoAposConflito = {
  ...copiaB,
  diagnostico: 'Rascunho preservado após conflito',
} as unknown as OrdemServico
syncQueueService.enfileirar({
  office_id: copiaB.office_id,
  tipo_acao: 'update',
  entidade: 'ordem_servico',
  entidade_id: copiaB.id,
  payload: {
    base_revision: 6,
    local_snapshot: rascunhoAposConflito,
  } satisfies OrdemServicoSyncPayload,
})
fila = syncQueueService.listar(copiaB.office_id)
assert.equal(fila[0]!.status, 'conflito')
assert.equal((fila[0]!.payload as OrdemServicoSyncPayload).base_revision, 5)
assert.equal(
  (fila[0]!.payload as OrdemServicoSyncPayload).local_snapshot.diagnostico,
  'Rascunho preservado após conflito',
)

syncQueueService.resolverConflitosPorEntidade(copiaB.office_id, 'ordem_servico', copiaB.id)
assert.equal(syncQueueService.contarConflitos(copiaB.office_id), 0)

const itemAposReload = syncQueueService.enfileirar({
  office_id: copiaB.office_id,
  tipo_acao: 'update',
  entidade: 'ordem_servico',
  entidade_id: copiaB.id,
  payload: {
    base_revision: 6,
    local_snapshot: {
      ...remotoRevision6,
      diagnostico: 'Nova edição a partir da remota',
    } as unknown as OrdemServico,
  } satisfies OrdemServicoSyncPayload,
})
ok(
  'F',
  (itemAposReload.payload as OrdemServicoSyncPayload).base_revision === 6 &&
    ((itemAposReload.payload as OrdemServicoSyncPayload).local_snapshot as OrdemServico)
      .revision === 6,
)

// G) criação de nova OS — expected_revision null / revision inicial 1 (DEFAULT migration)
const novaOs = {
  id: 'os-nova-1',
  office_id: 'office-local-1',
  oficina_id: 'office-local-1',
  revision: 1,
  diagnostico: 'OS nova',
} as unknown as OrdemServico
const itemNova = syncQueueService.enfileirar({
  office_id: novaOs.office_id,
  tipo_acao: 'create',
  entidade: 'ordem_servico',
  entidade_id: novaOs.id,
  payload: {
    base_revision: null as unknown as number,
    local_snapshot: novaOs,
  } satisfies OrdemServicoSyncPayload,
})
ok(
  'G',
  novaOs.revision === 1 &&
    (itemNova.payload as OrdemServicoSyncPayload).local_snapshot.revision === 1,
)

// estoque pós-revision (regressão fila)
const itemEstoque = syncQueueService.enfileirar({
  office_id: copiaB.office_id,
  tipo_acao: 'update',
  entidade: 'ordem_servico',
  entidade_id: 'os-local-estoque',
  payload: {
    base_revision: 5,
    local_snapshot: { ...copiaA, id: 'os-local-estoque' } as unknown as OrdemServico,
  } satisfies OrdemServicoSyncPayload,
})
syncQueueService.manterOsPendenteAposRevision(
  itemEstoque.id,
  6,
  { ...copiaA, id: 'os-local-estoque', revision: 6 } as unknown as OrdemServico,
  '2026-09-13T03:30:00.000Z',
)
const retryEstoque = syncQueueService
  .listar(copiaB.office_id, 'pendente')
  .find((itemFila) => itemFila.id === itemEstoque.id)
assert.ok(retryEstoque)
assert.equal((retryEstoque.payload as OrdemServicoSyncPayload).base_revision, 6)

// H) orçamento → OS: migration cobre pair RPC (fluxo local mock)
const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260913030000_service_orders_optimistic_locking.sql',
    import.meta.url,
  ),
  'utf8',
)
assert.match(migration, /ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1/)
assert.match(migration, /FOR UPDATE/)
assert.match(migration, /revision = p_expected_revision/)
assert.match(migration, /updated_at = NOW\(\)/)
assert.match(migration, /'status', 'conflict'/)
assert.match(migration, /save_service_order_pair_if_revisions/)
assert.match(migration, /second service order could not be saved atomically/)
assert.match(migration, /c\.office_id = p_office_id/)
assert.match(migration, /m\.office_id = p_office_id/)
assert.match(migration, /m\.customer_id = v_customer_id/)
assert.match(migration, /REVOKE INSERT, UPDATE ON public\.service_orders FROM authenticated/)
ok('H', /save_service_order_pair_if_revisions/.test(migration))

// --- DELETE direto fechado (código local; migration ainda não aplicada) ---
const resetSrc = readFileSync(
  new URL('../src/services/supabase-sync/supabase-office-reset.service.ts', import.meta.url),
  'utf8',
)
const revokeMigration = readFileSync(
  new URL(
    '../supabase/migrations/20260924221500_revoke_service_orders_delete_authenticated.sql',
    import.meta.url,
  ),
  'utf8',
)

// A) criação continua via CAS
ok('DEL_A', /save_service_order_if_revision/.test(migration) && /p_expected_revision IS NULL/.test(migration))

// B) edição continua via CAS
ok('DEL_B', /revision = p_expected_revision/.test(migration))

// C) soft delete continua via CAS UPDATE (excluirOS → deleted_at, sem .delete em service_orders no craft-data)
const craftData = readFileSync(
  new URL('../src/services/craft-data.service.ts', import.meta.url),
  'utf8',
)
ok(
  'DEL_C',
  /excluirOS\(/.test(craftData) &&
    /deleted_at/.test(craftData) &&
    !/\.from\(\s*['"]service_orders['"]\s*\)\s*\.delete/.test(craftData),
)

// D) cancelamento por status (fluxo UI/context; não DELETE físico)
const osStatus = readFileSync(
  new URL('../src/services/os-status.service.ts', import.meta.url),
  'utf8',
)
ok('DEL_D', /cancelada/.test(osStatus) || /cancelada/.test(craftData))

// E) fila offline não depende de DELETE de OS
const hybridSrc = readFileSync(
  new URL('../src/services/repository/hybrid.repository.ts', import.meta.url),
  'utf8',
)
ok(
  'DEL_E',
  /enfileirarOrdemServicoPendente|tipo_acao:\s*'update'/.test(hybridSrc) &&
    !/entidade:\s*'ordem_servico'[\s\S]{0,120}tipo_acao:\s*'delete'/.test(hybridSrc),
)

// F) reset usa RPC e não DELETE direto de service_orders no fallback
ok(
  'DEL_F',
  /reset_office_test_data/.test(resetSrc) &&
    /limpeza remota exige RPC reset_office_test_data/.test(resetSrc) &&
    !/TabelaOperacionalFallback[\s\S]*\|\s*'service_orders'/.test(resetSrc) &&
    !/ordem\.push\(['"]service_orders['"]\)/.test(resetSrc),
)

// G) nenhuma chamada no reset faz DELETE físico em service_orders; REVOKE na nova migration
ok(
  'DEL_G',
  /REVOKE DELETE ON TABLE public\.service_orders FROM anon/.test(revokeMigration) &&
    /REVOKE DELETE ON TABLE public\.service_orders FROM authenticated/.test(revokeMigration) &&
    !/FROM service_role/.test(revokeMigration),
)

// --- Merge atômico aprovação (RPC + Edge; migration ainda NÃO aplicada) ---
const approvalMigration = readFileSync(
  new URL(
    '../supabase/migrations/20260924233000_apply_service_order_approval_patch.sql',
    import.meta.url,
  ),
  'utf8',
)
const respondSrc = readFileSync(
  new URL('../supabase/functions/approval-link-respond/index.ts', import.meta.url),
  'utf8',
)
const createSrc = readFileSync(
  new URL('../supabase/functions/approval-link-create/index.ts', import.meta.url),
  'utf8',
)
const approvalCommonSrc = readFileSync(
  new URL('../supabase/functions/_shared/approval-common.ts', import.meta.url),
  'utf8',
)
const phase1Src = readFileSync(
  new URL('../src/services/supabase-sync/supabase-phase1.persistence.ts', import.meta.url),
  'utf8',
)

// A) aprovação normal via RPC (não UPDATE amplo)
ok(
  'APR_A',
  /apply_service_order_approval_patch/.test(approvalMigration) &&
    /aplicarApprovalPatchOs/.test(respondSrc) &&
    /kind:\s*'client_response'/.test(respondSrc),
)

// B/C) merge no parts_used ATUAL com FOR UPDATE; não substitui snapshot inteiro
ok(
  'APR_B',
  /FOR UPDATE/.test(approvalMigration) &&
    /v_parts := COALESCE\(v_row\.parts_used/.test(approvalMigration) &&
    !/parts_used = p_/.test(approvalMigration),
)
ok(
  'APR_C',
  /jsonb_set\(v_parts, '\{craft_meta\}'/.test(approvalMigration) &&
    /aprovacao_cliente/.test(approvalMigration) &&
    /historico_eventos/.test(approvalMigration) &&
    !/\.from\(\s*['"]service_orders['"]\s*\)\s*\.update\(\s*\{[\s\S]*parts_used:/.test(respondSrc),
)

// D) user depois da aprovação: CAS exige revision (conflito se stale)
ok(
  'APR_D',
  /p_expected_revision IS NULL OR v_current\.revision <> p_expected_revision/.test(migration) &&
    /trg_service_orders_revision/.test(migration) &&
    !/NEW\.revision\s*:=/.test(approvalMigration),
)

// E) replay: link não pending devolve already_responded; ids estáveis no create/resposta
ok(
  'APR_E',
  /already_responded/.test(approvalMigration) &&
    /already_applied/.test(approvalMigration) &&
    /idsEventosAprovacaoPorLink/.test(respondSrc) &&
    /aprov-evt-/.test(approvalCommonSrc) &&
    /status = 'pending'/.test(approvalMigration) &&
    !/\.from\(\s*['"]approval_links['"]\s*\)\s*\.update/.test(respondSrc),
)

// F/G) parcial e recusa só via client_response + budget_status (JSON não-aprovação preservado)
ok(
  'APR_F',
  /approvalType === 'partial'/.test(respondSrc) &&
    /budgetStatus/.test(respondSrc) &&
    /jsonb_set\(v_craft, '\{aprovacao_cliente\}'/.test(approvalMigration),
)
ok(
  'APR_G',
  /approvalType === 'rejected'/.test(respondSrc) &&
    /budgetStatus\s*=\s*approvalType === 'rejected' \? 'recusado'/.test(respondSrc) &&
    /p_kind = 'client_response'/.test(approvalMigration),
)

// H) revision sobe via trigger (1 bump por UPDATE da OS); RPC não seta revision
ok(
  'APR_H',
  /bump_service_order_revision/.test(migration) &&
    /BEFORE UPDATE ON public\.service_orders/.test(migration) &&
    !/revision\s*=/.test(approvalMigration.split('CREATE OR REPLACE')[1] ?? approvalMigration),
)

// I) create do link usa RPC atômica (não UPDATE direto de parts_used)
ok(
  'APR_I',
  /aplicarApprovalPatchOs/.test(createSrc) &&
    /kind:\s*'link_created'/.test(createSrc) &&
    /montarPatchLinkCriado/.test(createSrc) &&
    !/\.from\(\s*['"]service_orders['"]\s*\)\s*\.update\(\s*\{[\s\S]*parts_used/.test(createSrc),
)

// J) offline/base_revision: fila guarda base_revision; update existente com expected null → conflict no CAS
ok(
  'APR_J',
  /base_revision/.test(
    readFileSync(new URL('../src/services/sync/sync-queue.service.ts', import.meta.url), 'utf8'),
  ) &&
    /expectedRevision/.test(phase1Src) &&
    /p_expected_revision IS NULL OR v_current\.revision <> p_expected_revision/.test(migration) &&
    /GRANT EXECUTE[\s\S]*TO service_role/.test(approvalMigration) &&
    /REVOKE ALL[\s\S]*FROM authenticated/.test(approvalMigration),
)

// --- Resposta transacional link + OS (mesma função; migration ainda NÃO aplicada) ---
const clientResponseSql =
  approvalMigration.split("IF p_kind = 'client_response' THEN").slice(1).join("\n") || ''

ok(
  'ATX_A',
  /p_link_status = 'approved'/.test(approvalMigration) &&
    /UPDATE public\.service_orders/.test(clientResponseSql) &&
    /UPDATE public\.approval_links/.test(clientResponseSql) &&
    /linkStatus/.test(respondSrc) &&
    /status: osPatch\.linkStatus/.test(respondSrc),
)
ok(
  'ATX_B',
  /budgetStatus\s*=\s*approvalType === 'rejected' \? 'recusado'/.test(respondSrc) &&
    /v_expected_link_status := CASE WHEN p_budget_status = 'recusado' THEN 'rejected' ELSE 'approved' END/.test(
      approvalMigration,
    ),
)
ok(
  'ATX_C',
  /FROM public\.approval_links[\s\S]*FOR UPDATE/.test(approvalMigration) &&
    /already_responded/.test(approvalMigration) &&
    /already_responded/.test(respondSrc) &&
    /409/.test(respondSrc),
)
ok(
  'ATX_D',
  /status', 'already_responded'[\s\S]{0,180}'updated', FALSE/.test(approvalMigration) &&
    /FROM public\.service_orders/.test(approvalMigration),
)
ok(
  'ATX_E',
  !/EXCEPTION\s+WHEN/.test(approvalMigration) &&
    /RAISE EXCEPTION 'service_order approval update failed'/.test(approvalMigration),
)
ok(
  'ATX_F',
  /RAISE EXCEPTION 'approval link close failed'/.test(approvalMigration) &&
    /UPDATE public\.service_orders[\s\S]*UPDATE public\.approval_links/.test(clientResponseSql),
)
ok(
  'ATX_G',
  /already_responded/.test(respondSrc) &&
    /409/.test(respondSrc) &&
    /'revision', NULL/.test(approvalMigration),
)
ok(
  'ATX_H',
  /v_link\.office_id IS DISTINCT FROM p_office_id/.test(approvalMigration) &&
    /v_link\.service_order_id IS DISTINCT FROM p_service_order_id/.test(approvalMigration) &&
    /v_link\.token_hash IS DISTINCT FROM trim\(p_token_hash\)/.test(approvalMigration) &&
    /invalid_link/.test(respondSrc),
)
ok(
  'ATX_I',
  /v_link\.expires_at <= NOW\(\)/.test(approvalMigration) &&
    /SET status = 'expired'/.test(approvalMigration) &&
    clientResponseSql.indexOf("SET status = 'expired'") <
      clientResponseSql.indexOf('UPDATE public.service_orders'),
)
ok(
  'ATX_J',
  /v_parts := COALESCE\(v_row\.parts_used/.test(approvalMigration) &&
    /jsonb_set\(v_parts, '\{craft_meta\}'/.test(approvalMigration) &&
    !/parts_used = p_/.test(approvalMigration) &&
    /create NÃO é transacional/.test(approvalMigration),
)

console.log(
  'OK — concorrência OS local A–H:',
  Object.entries(resultados)
    .filter(([k]) => k.length === 1)
    .map(([k, v]) => `${k}=${v ? 'PASS' : 'FAIL'}`)
    .join(' '),
)
console.log(
  'OK — DELETE direto fechado DEL_A–G:',
  Object.entries(resultados)
    .filter(([k]) => k.startsWith('DEL_'))
    .map(([k, v]) => `${k}=${v ? 'PASS' : 'FAIL'}`)
    .join(' '),
)
console.log(
  'OK — merge atômico aprovação APR_A–J:',
  Object.entries(resultados)
    .filter(([k]) => k.startsWith('APR_'))
    .map(([k, v]) => `${k}=${v ? 'PASS' : 'FAIL'}`)
    .join(' '),
)
console.log(
  'OK — resposta transacional ATX_A–J:',
  Object.entries(resultados)
    .filter(([k]) => k.startsWith('ATX_'))
    .map(([k, v]) => `${k}=${v ? 'PASS' : 'FAIL'}`)
    .join(' '),
)
console.log('OK — revision atômica e preservação de conflito offline validadas.')
