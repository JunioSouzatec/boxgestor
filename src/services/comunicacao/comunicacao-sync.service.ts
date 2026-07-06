import { getCraftPersistenceMode, isSupabaseConfigured } from '@/lib/supabase'
import {
  listarHistoricoLocal,
  mesclarHistoricoContatos,
  salvarHistoricoOfficeLocal,
} from '@/services/comunicacao/comunicacao.storage'
import { logSyncComunicacaoDev } from '@/services/comunicacao/comunicacao-sync-debug'
import {
  carregarHistoricoDoSupabase,
  inserirHistoricoNoSupabase,
  migrarHistoricoLocalParaSupabase,
} from '@/services/comunicacao/supabase-comunicacao.persistence'
import type { HistoricoContato } from '@/types/comunicacao'

export const COMUNICACAO_MIGRACAO_KEY = 'craft_comunicacao_migrados_supabase_v1'
export const COMUNICACAO_EVENTO_ATUALIZADO = 'craft:comunicacao-atualizados'

interface MigracaoComunicacaoStore {
  version: 1
  offices: Record<string, { migrado_em: string }>
}

export function comunicacaoModoSupabase(): boolean {
  return getCraftPersistenceMode() === 'supabase' && isSupabaseConfigured()
}

function emitirComunicacaoAtualizada(): void {
  window.dispatchEvent(new CustomEvent(COMUNICACAO_EVENTO_ATUALIZADO))
}

function carregarMigracao(): MigracaoComunicacaoStore {
  try {
    const raw = localStorage.getItem(COMUNICACAO_MIGRACAO_KEY)
    if (raw) return JSON.parse(raw) as MigracaoComunicacaoStore
  } catch {
    /* seed */
  }
  return { version: 1, offices: {} }
}

function salvarMigracao(store: MigracaoComunicacaoStore): void {
  localStorage.setItem(COMUNICACAO_MIGRACAO_KEY, JSON.stringify(store))
}

export function officeComunicacaoJaMigrado(officeId: string): boolean {
  return Boolean(carregarMigracao().offices[officeId])
}

export function marcarOfficeComunicacaoMigrado(officeId: string): void {
  const store = carregarMigracao()
  store.offices[officeId] = { migrado_em: new Date().toISOString() }
  salvarMigracao(store)
}

function salvarCacheHistorico(
  officeId: string,
  itens: HistoricoContato[],
  info: Parameters<typeof logSyncComunicacaoDev>[1]
): void {
  salvarHistoricoOfficeLocal(officeId, itens)
  logSyncComunicacaoDev('historico', info)
}

/** Carrega histórico: Supabase primeiro (online), localStorage como fallback. */
export async function carregarHistoricoComunicacaoRemoto(
  officeId: string
): Promise<{ ok: boolean; origem: 'supabase' | 'local' }> {
  const local = listarHistoricoLocal(officeId)

  if (!comunicacaoModoSupabase() || !navigator.onLine) {
    logSyncComunicacaoDev('historico', {
      local: local.length,
      aposMerge: local.length,
      origem: 'local',
    })
    return { ok: true, origem: 'local' }
  }

  const remoto = await carregarHistoricoDoSupabase(officeId)

  if (!remoto.ok || !remoto.dados) {
    logSyncComunicacaoDev('historico', {
      local: local.length,
      aposMerge: local.length,
      origem: 'local',
    })
    return { ok: false, origem: 'local' }
  }

  const mesclados = mesclarHistoricoContatos(local, remoto.dados, { prioridadeRemota: true })
  salvarCacheHistorico(officeId, mesclados, {
    supabase: remoto.dados.length,
    local: local.length,
    aposMerge: mesclados.length,
    origem: 'supabase',
  })
  emitirComunicacaoAtualizada()
  return { ok: true, origem: 'supabase' }
}

export async function refreshHistoricoDoSupabase(officeId: string): Promise<boolean> {
  const resultado = await carregarHistoricoComunicacaoRemoto(officeId)
  return resultado.ok && resultado.origem === 'supabase'
}

export async function migrarHistoricoLocalSeNecessario(officeId: string): Promise<boolean> {
  if (!comunicacaoModoSupabase() || !navigator.onLine) return false
  if (officeComunicacaoJaMigrado(officeId)) return true

  const local = listarHistoricoLocal(officeId)
  if (local.length === 0) {
    marcarOfficeComunicacaoMigrado(officeId)
    return true
  }

  const resultado = await migrarHistoricoLocalParaSupabase(officeId, local)
  if (!resultado.ok) return false

  marcarOfficeComunicacaoMigrado(officeId)
  return true
}

export async function publicarRegistroComunicacao(
  officeId: string,
  registro: HistoricoContato
): Promise<boolean> {
  if (!comunicacaoModoSupabase() || !navigator.onLine) return false

  const resultado = await inserirHistoricoNoSupabase(officeId, registro)
  return resultado.ok
}

/** Persiste histórico: Supabase primeiro (online), depois cache local. */
export async function persistirHistoricoComunicacao(
  officeId: string,
  registro: HistoricoContato
): Promise<HistoricoContato> {
  if (comunicacaoModoSupabase() && navigator.onLine) {
    await publicarRegistroComunicacao(officeId, registro)
  }

  const store = listarHistoricoLocal(officeId)
  const idx = store.findIndex((h) => h.id === registro.id)
  const lista = [...store]
  if (idx >= 0) lista[idx] = registro
  else lista.unshift(registro)
  salvarHistoricoOfficeLocal(officeId, lista)
  return registro
}

export async function inicializarComunicacaoSupabase(officeId: string): Promise<void> {
  if (!comunicacaoModoSupabase()) return

  await migrarHistoricoLocalSeNecessario(officeId)
  await carregarHistoricoComunicacaoRemoto(officeId)
}
