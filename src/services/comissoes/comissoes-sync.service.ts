import { getCraftPersistenceMode, isSupabaseConfigured } from '@/lib/supabase'
import { localCraftRepository } from '@/services/repository/local.repository'
import {
  carregarPerfisComissaoDoSupabase,
  persistirPerfisComissaoNoSupabase,
} from '@/services/comissoes/supabase-comissoes.persistence'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import { atualizarContagemPendenciasAtivas } from '@/services/persistence-status.events'
import { normalizarComissoesConfig } from '@/types/comissoes'
import type { ComissoesConfigOficina, PerfilComissaoFuncionario } from '@/types/comissoes'
import type { CraftDatabase } from '@/types/database'

export const COMISSOES_MIGRACAO_KEY = 'craft_comissoes_migrados_supabase_v1'
export const COMISSOES_EVENTO_ATUALIZADO = 'craft:comissoes-atualizados'

interface MigracaoComissoesStore {
  version: 1
  offices: Record<string, { migrado_em: string }>
}

const syncTimers: Record<string, ReturnType<typeof setTimeout>> = {}
let suprimirSync = false

export function comissoesSyncHabilitado(): boolean {
  return getCraftPersistenceMode() === 'supabase' && isSupabaseConfigured() && navigator.onLine
}

export function comissoesModoSupabase(): boolean {
  return getCraftPersistenceMode() === 'supabase' && isSupabaseConfigured()
}

function emitirComissoesAtualizados(): void {
  window.dispatchEvent(new CustomEvent(COMISSOES_EVENTO_ATUALIZADO))
}

function carregarMigracao(): MigracaoComissoesStore {
  try {
    const raw = localStorage.getItem(COMISSOES_MIGRACAO_KEY)
    if (raw) return JSON.parse(raw) as MigracaoComissoesStore
  } catch {
    /* seed */
  }
  return { version: 1, offices: {} }
}

function salvarMigracao(store: MigracaoComissoesStore): void {
  localStorage.setItem(COMISSOES_MIGRACAO_KEY, JSON.stringify(store))
}

export function officeComissoesJaMigrado(officeId: string): boolean {
  return Boolean(carregarMigracao().offices[officeId])
}

function marcarOfficeComissoesMigrado(officeId: string): void {
  const store = carregarMigracao()
  store.offices[officeId] = { migrado_em: new Date().toISOString() }
  salvarMigracao(store)
}

function obterUpdatedAtPerfil(p: PerfilComissaoFuncionario): string {
  return p.updated_at ?? p.created_at ?? ''
}

function mesclarPerfisPorUpdatedAt(
  local: PerfilComissaoFuncionario[],
  remoto: PerfilComissaoFuncionario[]
): PerfilComissaoFuncionario[] {
  const porId = new Map<string, PerfilComissaoFuncionario>()
  const todosIds = new Set([...local.map((p) => p.id), ...remoto.map((p) => p.id)])

  for (const id of todosIds) {
    const l = local.find((x) => x.id === id)
    const r = remoto.find((x) => x.id === id)

    if (!l && r) {
      porId.set(id, r)
      continue
    }
    if (l && !r) {
      porId.set(id, l)
      continue
    }
    if (!l || !r) continue

    const lTs = obterUpdatedAtPerfil(l)
    const rTs = obterUpdatedAtPerfil(r)
    porId.set(id, rTs >= lTs ? r : l)
  }

  return [...porId.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

function mesclarConfigComissoes(
  local: ComissoesConfigOficina | undefined,
  remoto: ComissoesConfigOficina | undefined,
  configUpdatedAtLocal?: string,
  configUpdatedAtRemoto?: string
): ComissoesConfigOficina {
  const l = normalizarComissoesConfig(local)
  const r = normalizarComissoesConfig(remoto)
  if (!remoto) return l
  if (!local) return r
  const localTs = configUpdatedAtLocal ?? ''
  const remotoTs = configUpdatedAtRemoto ?? ''
  return remotoTs >= localTs ? r : l
}

/** Mescla config de comissões vindas do settings Supabase (metadata). */
export function mesclarComissoesConfigNoDatabase(
  db: CraftDatabase,
  remoto?: ComissoesConfigOficina,
  remotoUpdatedAt?: string
): CraftDatabase {
  if (!remoto) return db
  const configMesclada = mesclarConfigComissoes(
    db.configuracao.comissoes_config,
    remoto,
    db.configuracao.updated_at,
    remotoUpdatedAt
  )
  return {
    ...db,
    configuracao: {
      ...db.configuracao,
      comissoes_config: configMesclada,
    },
  }
}

function salvarDatabaseSemSync(officeId: string, db: CraftDatabase): void {
  suprimirSync = true
  try {
    localCraftRepository.salvar(officeId, db)
  } finally {
    suprimirSync = false
  }
}

export function agendarSincronizacaoComissoes(officeId: string): void {
  if (suprimirSync || !comissoesModoSupabase()) return

  clearTimeout(syncTimers[officeId])
  syncTimers[officeId] = setTimeout(() => {
    void sincronizarComissoesCompleto(officeId)
  }, 600)
}

function enfileirarSyncComissoes(officeId: string): void {
  syncQueueService.enfileirar({
    office_id: officeId,
    tipo_acao: 'update',
    entidade: 'perfil_comissao',
    entidade_id: officeId,
    payload: { sync_comissoes: true },
  })
  atualizarContagemPendenciasAtivas(officeId)
}

export async function publicarPerfisComissaoLocais(officeId: string): Promise<boolean> {
  if (!comissoesModoSupabase()) return false

  if (!navigator.onLine) {
    enfileirarSyncComissoes(officeId)
    return false
  }

  const local = localCraftRepository.carregar(officeId)
  const perfis = local.perfis_comissao ?? []

  const push = await persistirPerfisComissaoNoSupabase(officeId, perfis)
  if (!push.ok && push.enviados === 0 && perfis.length > 0) {
    enfileirarSyncComissoes(officeId)
    return false
  }

  syncQueueService.marcarSincronizadosPorEntidade(officeId, 'perfil_comissao', officeId)
  atualizarContagemPendenciasAtivas(officeId)
  return true
}

export async function sincronizarComissoesCompleto(officeId: string): Promise<{
  ok: boolean
  fonte: 'supabase' | 'local'
}> {
  if (!comissoesModoSupabase()) {
    return { ok: true, fonte: 'local' }
  }

  if (!navigator.onLine) {
    enfileirarSyncComissoes(officeId)
    return { ok: false, fonte: 'local' }
  }

  const localDb = localCraftRepository.carregar(officeId)
  const localPerfis = localDb.perfis_comissao ?? []

  if (!officeComissoesJaMigrado(officeId) && localPerfis.length > 0) {
    await persistirPerfisComissaoNoSupabase(officeId, localPerfis)
    marcarOfficeComissoesMigrado(officeId)
  }

  await publicarPerfisComissaoLocais(officeId)

  const remoto = await carregarPerfisComissaoDoSupabase(officeId)

  if (remoto.ok) {
    const perfisMesclados = mesclarPerfisPorUpdatedAt(localPerfis, remoto.perfis)

    const dbAtualizado: CraftDatabase = {
      ...localDb,
      perfis_comissao: perfisMesclados,
    }

    salvarDatabaseSemSync(officeId, dbAtualizado)
    marcarOfficeComissoesMigrado(officeId)
    emitirComissoesAtualizados()
    return { ok: true, fonte: 'supabase' }
  }

  if (localPerfis.length > 0) {
    enfileirarSyncComissoes(officeId)
  }
  return { ok: false, fonte: 'local' }
}

/** Mescla perfis do Supabase no snapshot após carregar fase 1. */
export async function mesclarComissoesNoDatabase(
  officeId: string,
  db: CraftDatabase
): Promise<CraftDatabase> {
  if (!comissoesModoSupabase() || !navigator.onLine) {
    return db
  }

  const localPerfis = db.perfis_comissao ?? []
  const remoto = await carregarPerfisComissaoDoSupabase(officeId)

  if (!remoto.ok) {
    if (!officeComissoesJaMigrado(officeId) && localPerfis.length > 0) {
      void persistirPerfisComissaoNoSupabase(officeId, localPerfis).then(() => {
        marcarOfficeComissoesMigrado(officeId)
      })
    }
    return db
  }

  if (!officeComissoesJaMigrado(officeId) && localPerfis.length > 0 && remoto.perfis.length === 0) {
    await persistirPerfisComissaoNoSupabase(officeId, localPerfis)
    marcarOfficeComissoesMigrado(officeId)
    return db
  }

  const perfisMesclados = mesclarPerfisPorUpdatedAt(localPerfis, remoto.perfis)

  return {
    ...db,
    perfis_comissao: perfisMesclados,
  }
}

export async function inicializarComissoesSupabase(officeId: string): Promise<void> {
  if (!comissoesModoSupabase()) return
  await mesclarComissoesNoDatabase(officeId, localCraftRepository.carregar(officeId)).then(
    (db) => {
      salvarDatabaseSemSync(officeId, db)
      emitirComissoesAtualizados()
    }
  )
  await sincronizarComissoesCompleto(officeId)
}

export async function processarFilaComissoesPendente(officeId: string): Promise<boolean> {
  const pendentes = syncQueueService
    .listar(officeId, 'pendente')
    .filter((i) => i.entidade === 'perfil_comissao')

  if (pendentes.length === 0) return true

  const resultado = await sincronizarComissoesCompleto(officeId)
  if (resultado.ok) {
    for (const item of pendentes) {
      syncQueueService.marcarSincronizado(item.id)
    }
    return true
  }
  return false
}

export function syncComissoesSuprimido(): boolean {
  return suprimirSync
}
