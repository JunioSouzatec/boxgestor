import { getCraftPersistenceMode, isSupabaseConfigured } from '@/lib/supabase'
import {
  carregarLembretesDoSupabase,
  persistirLembretesNoSupabase,
} from '@/services/lembretes/supabase-lembretes.persistence'
import {
  LEMBRETES_STORAGE_KEY,
  obterDadosOfficeLembretes,
  salvarDadosOfficeLembretesSemSync,
} from '@/services/lembretes/lembretes.service'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import { atualizarContagemPendenciasAtivas } from '@/services/persistence-status.events'
import type { LembreteCliente, RegraLembrete } from '@/types/lembrete'

export const LEMBRETES_MIGRACAO_KEY = 'craft_lembretes_migrados_supabase_v1'

interface MigracaoLembretesStore {
  version: 1
  offices: Record<string, { migrado_em: string }>
}

const syncTimers: Record<string, ReturnType<typeof setTimeout>> = {}
let suprimirSync = false

export function lembretesSyncHabilitado(): boolean {
  return getCraftPersistenceMode() === 'supabase' && isSupabaseConfigured() && navigator.onLine
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

export function officeLembretesJaMigrado(officeId: string): boolean {
  return Boolean(carregarMigracao().offices[officeId])
}

export function marcarOfficeLembretesMigrado(officeId: string): void {
  const store = carregarMigracao()
  store.offices[officeId] = { migrado_em: new Date().toISOString() }
  salvarMigracao(store)
}

function mesclarRegras(local: RegraLembrete[], remoto: RegraLembrete[]): RegraLembrete[] {
  const porId = new Map<string, RegraLembrete>()
  for (const r of local) porId.set(r.id, r)
  for (const r of remoto) {
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

function mesclarHistorico(
  local: RegistroHistoricoLembrete[] = [],
  remoto: RegistroHistoricoLembrete[] = []
): RegistroHistoricoLembrete[] {
  const porId = new Map<string, RegistroHistoricoLembrete>()
  for (const h of local) porId.set(h.id, h)
  for (const h of remoto) {
    if (!porId.has(h.id)) porId.set(h.id, h)
  }
  return [...porId.values()].sort((a, b) => a.data.localeCompare(b.data))
}

type RegistroHistoricoLembrete = NonNullable<LembreteCliente['historico']>[number]

function mesclarLembretes(local: LembreteCliente[], remoto: LembreteCliente[]): LembreteCliente[] {
  const porId = new Map<string, LembreteCliente>()
  for (const l of local) porId.set(l.id, l)
  for (const r of remoto) {
    const existente = porId.get(r.id)
    if (!existente) {
      porId.set(r.id, r)
      continue
    }
    porId.set(r.id, {
      ...existente,
      ...r,
      historico: mesclarHistorico(existente.historico, r.historico),
      contato: r.contato ?? existente.contato,
    })
  }
  return [...porId.values()]
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
  if (suprimirSync || getCraftPersistenceMode() !== 'supabase' || !isSupabaseConfigured()) return

  clearTimeout(syncTimers[officeId])
  syncTimers[officeId] = setTimeout(() => {
    void sincronizarLembretesOfficeParaSupabase(officeId)
  }, 900)
}

export async function sincronizarLembretesOfficeParaSupabase(officeId: string): Promise<boolean> {
  if (getCraftPersistenceMode() !== 'supabase' || !isSupabaseConfigured()) return false

  if (!navigator.onLine) {
    enfileirarSyncLembretes(officeId)
    return false
  }

  const { regras, lembretes } = obterDadosOfficeLembretes(officeId)
  const resultado = await persistirLembretesNoSupabase(officeId, regras, lembretes)

  if (resultado.ok) {
    syncQueueService.marcarSincronizadosPorEntidade(officeId, 'lembrete', officeId)
    atualizarContagemPendenciasAtivas(officeId)
    return true
  }

  enfileirarSyncLembretes(officeId)
  return false
}

export async function migrarLembretesLocalParaSupabase(officeId: string): Promise<boolean> {
  if (officeLembretesJaMigrado(officeId)) return true
  if (!lembretesSyncHabilitado()) return false

  const { regras, lembretes } = obterDadosOfficeLembretes(officeId)
  if (regras.length === 0 && lembretes.length === 0) {
    marcarOfficeLembretesMigrado(officeId)
    return true
  }

  const resultado = await persistirLembretesNoSupabase(officeId, regras, lembretes)
  if (resultado.ok) {
    marcarOfficeLembretesMigrado(officeId)
    return true
  }
  return false
}

export async function carregarEMesclarLembretesDoSupabase(officeId: string): Promise<boolean> {
  if (!lembretesSyncHabilitado()) return false

  const remoto = await carregarLembretesDoSupabase(officeId)
  if (!remoto.ok || !remoto.dados) return false

  const local = obterDadosOfficeLembretes(officeId)
  suprimirSync = true
  try {
    salvarDadosOfficeLembretesSemSync(officeId, {
      regras: mesclarRegras(local.regras, remoto.dados.regras),
      lembretes: mesclarLembretes(local.lembretes, remoto.dados.lembretes),
    })
  } finally {
    suprimirSync = false
  }
  return true
}

export async function inicializarLembretesSupabase(officeId: string): Promise<void> {
  if (getCraftPersistenceMode() !== 'supabase' || !isSupabaseConfigured()) return

  await migrarLembretesLocalParaSupabase(officeId)
  await carregarEMesclarLembretesDoSupabase(officeId)

  if (!officeLembretesJaMigrado(officeId)) {
    await migrarLembretesLocalParaSupabase(officeId)
  }

  await sincronizarLembretesOfficeParaSupabase(officeId)
}

export async function processarFilaLembretesPendente(officeId: string): Promise<boolean> {
  const pendentes = syncQueueService
    .listar(officeId, 'pendente')
    .filter((i) => i.entidade === 'lembrete')

  if (pendentes.length === 0) return true

  const ok = await sincronizarLembretesOfficeParaSupabase(officeId)
  if (ok) {
    for (const item of pendentes) {
      syncQueueService.marcarSincronizado(item.id)
    }
  }
  return ok
}

/** Conta lembretes ainda só no localStorage (não migrados ou fila pendente). */
export function contarLembretesLocaisPendentes(officeId: string): number {
  const { lembretes } = obterDadosOfficeLembretes(officeId)
  const fila = contarLembretesPendentesSync(officeId)
  if (!officeLembretesJaMigrado(officeId) && lembretes.length > 0) {
    return lembretes.length + fila
  }
  return fila
}

/** Verifica se há dados legados no storage global (pré-migração por office). */
export function storageLembretesLegadoExiste(): boolean {
  return Boolean(localStorage.getItem(LEMBRETES_STORAGE_KEY))
}
