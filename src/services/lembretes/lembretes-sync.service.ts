import { getCraftPersistenceMode, isSupabaseConfigured } from '@/lib/supabase'
import {
  carregarLembretesDoSupabase,
  persistirLembretesNoSupabase,
} from '@/services/lembretes/supabase-lembretes.persistence'
import {
  LEMBRETES_STORAGE_KEY,
  normalizarLembreteAposCarga,
  obterDadosOfficeLembretes,
  obterUpdatedAtLembrete,
  salvarDadosOfficeLembretesSemSync,
} from '@/services/lembretes/lembretes.service'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import { atualizarContagemPendenciasAtivas } from '@/services/persistence-status.events'
import type { LembreteCliente, RegraLembrete } from '@/types/lembrete'

export const LEMBRETES_MIGRACAO_KEY = 'craft_lembretes_migrados_supabase_v1'
export const LEMBRETES_SYNC_STATE_KEY = 'craft_lembretes_sync_state_v1'

export const LEMBRETES_EVENTO_ATUALIZADO = 'craft:lembretes-atualizados'

export interface EstadoSyncLembretesOffice {
  ultima_sincronizacao?: string
  ultima_carga_supabase?: string
  fonte: 'supabase' | 'local'
}

interface MigracaoLembretesStore {
  version: 1
  offices: Record<string, { migrado_em: string }>
}

interface SyncStateStore {
  version: 1
  offices: Record<string, EstadoSyncLembretesOffice>
}

const syncTimers: Record<string, ReturnType<typeof setTimeout>> = {}
let suprimirSync = false

export function lembretesSyncHabilitado(): boolean {
  return getCraftPersistenceMode() === 'supabase' && isSupabaseConfigured() && navigator.onLine
}

export function lembretesModoSupabase(): boolean {
  return getCraftPersistenceMode() === 'supabase' && isSupabaseConfigured()
}

function emitirLembretesAtualizados(): void {
  window.dispatchEvent(new CustomEvent(LEMBRETES_EVENTO_ATUALIZADO))
}

function carregarMigracao(): MigracaoLembretesStore {
  try {
    const raw = localStorage.getItem(LEMBRETES_MIGRACAO_KEY)
    if (raw) return JSON.parse(raw) as MigracaoLembretesStore
  } catch {
    /* seed */
  }
  return { version: 1, offices: {} }
}

function salvarMigracao(store: MigracaoLembretesStore): void {
  localStorage.setItem(LEMBRETES_MIGRACAO_KEY, JSON.stringify(store))
}

function carregarEstadoSyncStore(): SyncStateStore {
  try {
    const raw = localStorage.getItem(LEMBRETES_SYNC_STATE_KEY)
    if (raw) return JSON.parse(raw) as SyncStateStore
  } catch {
    /* seed */
  }
  return { version: 1, offices: {} }
}

function salvarEstadoSyncStore(store: SyncStateStore): void {
  localStorage.setItem(LEMBRETES_SYNC_STATE_KEY, JSON.stringify(store))
}

export function obterEstadoSyncLembretes(officeId: string): EstadoSyncLembretesOffice {
  const store = carregarEstadoSyncStore()
  return (
    store.offices[officeId] ?? {
      fonte: lembretesModoSupabase() ? 'supabase' : 'local',
    }
  )
}

function atualizarEstadoSync(officeId: string, parcial: Partial<EstadoSyncLembretesOffice>): void {
  const store = carregarEstadoSyncStore()
  store.offices[officeId] = {
    ...obterEstadoSyncLembretes(officeId),
    ...parcial,
  }
  salvarEstadoSyncStore(store)
}

export function officeLembretesJaMigrado(officeId: string): boolean {
  return Boolean(carregarMigracao().offices[officeId])
}

export function marcarOfficeLembretesMigrado(officeId: string): void {
  const store = carregarMigracao()
  store.offices[officeId] = { migrado_em: new Date().toISOString() }
  salvarMigracao(store)
}

export function fingerprintLembrete(lembrete: LembreteCliente): string {
  return [
    lembrete.cliente_id,
    lembrete.moto_id,
    lembrete.ordem_servico_id ?? '',
    lembrete.servico.trim().toLowerCase(),
    lembrete.data_prevista.slice(0, 10),
  ].join('|')
}

type RegistroHistoricoLembrete = NonNullable<LembreteCliente['historico']>[number]

function mesclarHistorico(
  local: RegistroHistoricoLembrete[] = [],
  remoto: RegistroHistoricoLembrete[] = []
): RegistroHistoricoLembrete[] {
  const porId = new Map<string, RegistroHistoricoLembrete>()
  for (const h of remoto) porId.set(h.id, h)
  for (const h of local) {
    if (!porId.has(h.id)) porId.set(h.id, h)
  }
  return [...porId.values()].sort((a, b) => a.data.localeCompare(b.data))
}

function mesclarRegras(local: RegraLembrete[], remoto: RegraLembrete[]): RegraLembrete[] {
  const porId = new Map<string, RegraLembrete>()
  for (const r of remoto) porId.set(r.id, r)
  for (const r of local) {
    const existente = porId.get(r.id)
    if (!existente) {
      porId.set(r.id, r)
      continue
    }
    const remotoMaisNovo = (r.updated_at ?? '') >= (existente.updated_at ?? '')
    porId.set(r.id, remotoMaisNovo ? r : existente)
  }
  return [...porId.values()]
}

/** Pull: Supabase manda nos ids existentes; mantém só locais ainda não enviados. */
function mesclarPullSupabasePrioritario(
  local: LembreteCliente[],
  remoto: LembreteCliente[]
): LembreteCliente[] {
  const porId = new Map<string, LembreteCliente>()
  const fingerprintsRemotos = new Set(remoto.map(fingerprintLembrete))

  for (const r of remoto) {
    porId.set(r.id, normalizarLembreteAposCarga(r))
  }

  for (const l of local) {
    if (porId.has(l.id)) continue
    if (fingerprintsRemotos.has(fingerprintLembrete(l))) continue
    porId.set(l.id, normalizarLembreteAposCarga(l))
  }

  return [...porId.values()]
}

/** Após push: mescla por updated_at — vence o mais recente. */
function mesclarLembretesPorUpdatedAt(
  local: LembreteCliente[],
  remoto: LembreteCliente[]
): LembreteCliente[] {
  const porId = new Map<string, LembreteCliente>()
  const todosIds = new Set([...local.map((l) => l.id), ...remoto.map((r) => r.id)])

  for (const id of todosIds) {
    const l = local.find((x) => x.id === id)
    const r = remoto.find((x) => x.id === id)

    if (!l && r) {
      porId.set(id, normalizarLembreteAposCarga(r))
      continue
    }
    if (l && !r) {
      porId.set(id, normalizarLembreteAposCarga(l))
      continue
    }
    if (!l || !r) continue

    const lTs = obterUpdatedAtLembrete(l)
    const rTs = obterUpdatedAtLembrete(r)
    const base = rTs >= lTs ? r : l
    const mesclado: LembreteCliente = {
      ...base,
      historico: mesclarHistorico(l.historico, r.historico),
      criado_por_nome: r.criado_por_nome ?? l.criado_por_nome,
      criado_por_id: r.criado_por_id ?? l.criado_por_id,
      automatico: r.automatico ?? l.automatico,
      status_fixo: rTs >= lTs ? r.status_fixo : l.status_fixo,
      updated_at: rTs >= lTs ? r.updated_at ?? rTs : l.updated_at ?? lTs,
    }
    porId.set(id, normalizarLembreteAposCarga(mesclado))
  }

  return [...porId.values()]
}

function salvarCacheMesclado(
  officeId: string,
  dados: { regras: RegraLembrete[]; lembretes: LembreteCliente[] }
): void {
  suprimirSync = true
  try {
    salvarDadosOfficeLembretesSemSync(officeId, dados)
  } finally {
    suprimirSync = false
  }
}

export function contarLembretesPendentesSync(officeId: string): number {
  return syncQueueService
    .listar(officeId, 'pendente')
    .filter((i) => i.entidade === 'lembrete' || i.entidade === 'regra_lembrete').length
}

function enfileirarSyncLembretes(officeId: string): void {
  syncQueueService.enfileirar({
    office_id: officeId,
    tipo_acao: 'update',
    entidade: 'lembrete',
    entidade_id: officeId,
    payload: { sync_lembretes: true },
  })
  atualizarContagemPendenciasAtivas(officeId)
}

export function agendarSincronizacaoLembretes(officeId: string): void {
  if (suprimirSync || !lembretesModoSupabase()) return

  clearTimeout(syncTimers[officeId])
  syncTimers[officeId] = setTimeout(() => {
    void publicarAlteracoesLocais(officeId)
  }, 600)
}

/** Apenas baixa do Supabase — não envia cache local (refresh automático). */
export async function refreshRemotoParaCache(officeId: string): Promise<boolean> {
  if (!lembretesModoSupabase() || !navigator.onLine) return false

  const local = obterDadosOfficeLembretes(officeId)
  const remoto = await carregarLembretesDoSupabase(officeId)

  if (!remoto.ok || !remoto.dados) return false

  salvarCacheMesclado(officeId, {
    regras: mesclarRegras(local.regras, remoto.dados.regras),
    lembretes: mesclarPullSupabasePrioritario(local.lembretes, remoto.dados.lembretes),
  })

  marcarOfficeLembretesMigrado(officeId)
  const agora = new Date().toISOString()
  atualizarEstadoSync(officeId, {
    fonte: 'supabase',
    ultima_carga_supabase: agora,
    ultima_sincronizacao: agora,
  })
  emitirLembretesAtualizados()
  return true
}

/** Envia alterações locais ao Supabase (após criar/editar/contato). */
export async function publicarAlteracoesLocais(officeId: string): Promise<boolean> {
  if (!lembretesModoSupabase()) return false

  if (!navigator.onLine) {
    enfileirarSyncLembretes(officeId)
    return false
  }

  const local = obterDadosOfficeLembretes(officeId)
  const normalizados = local.lembretes.map(normalizarLembreteAposCarga)

  if (normalizados.length === 0 && local.regras.length === 0) return true

  const push = await persistirLembretesNoSupabase(officeId, local.regras, normalizados)
  if (!push.ok && push.enviados.lembretes === 0 && normalizados.length > 0) {
    enfileirarSyncLembretes(officeId)
    return false
  }

  syncQueueService.marcarSincronizadosPorEntidade(officeId, 'lembrete', officeId)
  atualizarContagemPendenciasAtivas(officeId)
  return true
}

/** Push + pull completo — usar após mutação local. */
export async function sincronizarLembretesCompleto(officeId: string): Promise<{
  ok: boolean
  fonte: 'supabase' | 'local'
}> {
  if (!lembretesModoSupabase()) {
    return { ok: true, fonte: 'local' }
  }

  if (!navigator.onLine) {
    enfileirarSyncLembretes(officeId)
    atualizarEstadoSync(officeId, { fonte: 'local' })
    return { ok: false, fonte: 'local' }
  }

  await publicarAlteracoesLocais(officeId)

  const local = obterDadosOfficeLembretes(officeId)
  const remoto = await carregarLembretesDoSupabase(officeId)

  if (remoto.ok && remoto.dados) {
    salvarCacheMesclado(officeId, {
      regras: mesclarRegras(local.regras, remoto.dados.regras),
      lembretes: mesclarLembretesPorUpdatedAt(local.lembretes, remoto.dados.lembretes),
    })

    marcarOfficeLembretesMigrado(officeId)
    const agora = new Date().toISOString()
    atualizarEstadoSync(officeId, {
      fonte: 'supabase',
      ultima_sincronizacao: agora,
      ultima_carga_supabase: agora,
    })
    emitirLembretesAtualizados()
    return { ok: true, fonte: 'supabase' }
  }

  enfileirarSyncLembretes(officeId)
  atualizarEstadoSync(officeId, { fonte: 'local' })
  return { ok: false, fonte: 'local' }
}

export async function sincronizarLembretesOfficeParaSupabase(officeId: string): Promise<boolean> {
  return (await sincronizarLembretesCompleto(officeId)).ok
}

export async function refreshLembretesDoSupabase(officeId: string): Promise<boolean> {
  return refreshRemotoParaCache(officeId)
}

export async function inicializarLembretesSupabase(officeId: string): Promise<void> {
  if (!lembretesModoSupabase()) return
  await refreshRemotoParaCache(officeId)
  const local = obterDadosOfficeLembretes(officeId)
  if (local.lembretes.length > 0) {
    await sincronizarLembretesCompleto(officeId)
  }
}

export async function processarFilaLembretesPendente(officeId: string): Promise<boolean> {
  const pendentes = syncQueueService
    .listar(officeId, 'pendente')
    .filter((i) => i.entidade === 'lembrete')

  if (pendentes.length === 0) return true

  const resultado = await sincronizarLembretesCompleto(officeId)
  if (resultado.ok) {
    for (const item of pendentes) {
      syncQueueService.marcarSincronizado(item.id)
    }
  }
  return resultado.ok
}

export function contarLembretesLocaisPendentes(officeId: string): number {
  return contarLembretesPendentesSync(officeId)
}

export function storageLembretesLegadoExiste(): boolean {
  return Boolean(localStorage.getItem(LEMBRETES_STORAGE_KEY))
}
