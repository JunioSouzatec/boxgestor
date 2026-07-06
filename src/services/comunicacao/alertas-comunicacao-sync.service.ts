import { getCraftPersistenceMode, isSupabaseConfigured } from '@/lib/supabase'
import {
  listarAlertasLocal,
  mesclarAlertas,
  salvarAlertasOfficeLocal,
} from '@/services/comunicacao/alertas-comunicacao.storage'
import { logSyncComunicacaoDev } from '@/services/comunicacao/comunicacao-sync-debug'
import {
  carregarAlertasDoSupabase,
  migrarAlertasLocalParaSupabase,
  persistirAlertaNoSupabase,
} from '@/services/comunicacao/supabase-alertas-comunicacao.persistence'
import { normalizarAlertasAposCarga } from '@/services/comunicacao/alertas-comunicacao.service'
import type { AlertaComunicacao } from '@/types/alerta-comunicacao'

export const ALERTAS_COMUNICACAO_MIGRACAO_KEY = 'craft_comunicacao_alertas_migrados_supabase_v1'
export const ALERTAS_COMUNICACAO_EVENTO_ATUALIZADO = 'craft:alertas-comunicacao-atualizados'

interface MigracaoAlertasStore {
  version: 1
  offices: Record<string, { migrado_em: string }>
}

export function alertasComunicacaoModoSupabase(): boolean {
  return getCraftPersistenceMode() === 'supabase' && isSupabaseConfigured()
}

function emitirAlertasAtualizados(): void {
  window.dispatchEvent(new CustomEvent(ALERTAS_COMUNICACAO_EVENTO_ATUALIZADO))
}

function carregarMigracao(): MigracaoAlertasStore {
  try {
    const raw = localStorage.getItem(ALERTAS_COMUNICACAO_MIGRACAO_KEY)
    if (raw) return JSON.parse(raw) as MigracaoAlertasStore
  } catch {
    /* seed */
  }
  return { version: 1, offices: {} }
}

function salvarMigracao(store: MigracaoAlertasStore): void {
  localStorage.setItem(ALERTAS_COMUNICACAO_MIGRACAO_KEY, JSON.stringify(store))
}

function officeAlertasJaMigrado(officeId: string): boolean {
  return Boolean(carregarMigracao().offices[officeId])
}

function marcarOfficeAlertasMigrado(officeId: string): void {
  const store = carregarMigracao()
  store.offices[officeId] = { migrado_em: new Date().toISOString() }
  salvarMigracao(store)
}

async function migrarAlertasLocalSeNecessario(officeId: string): Promise<boolean> {
  if (!alertasComunicacaoModoSupabase() || !navigator.onLine) return false
  if (officeAlertasJaMigrado(officeId)) return true

  const local = listarAlertasLocal(officeId)
  if (local.length === 0) {
    marcarOfficeAlertasMigrado(officeId)
    return true
  }

  const resultado = await migrarAlertasLocalParaSupabase(officeId, local)
  if (!resultado.ok) return false

  marcarOfficeAlertasMigrado(officeId)
  return true
}

function salvarCacheAlertas(
  officeId: string,
  itens: AlertaComunicacao[],
  info: Parameters<typeof logSyncComunicacaoDev>[1]
): void {
  salvarAlertasOfficeLocal(officeId, itens)
  logSyncComunicacaoDev('alertas', info)
}

/** Carrega alertas: Supabase primeiro (online), localStorage como fallback. */
export async function carregarAlertasComunicacaoRemoto(
  officeId: string
): Promise<{ ok: boolean; origem: 'supabase' | 'local' }> {
  const local = listarAlertasLocal(officeId)

  if (!alertasComunicacaoModoSupabase() || !navigator.onLine) {
    logSyncComunicacaoDev('alertas', {
      local: local.length,
      aposMerge: local.length,
      origem: 'local',
    })
    return { ok: true, origem: 'local' }
  }

  const remoto = await carregarAlertasDoSupabase(officeId)

  if (!remoto.ok || !remoto.dados) {
    logSyncComunicacaoDev('alertas', {
      local: local.length,
      aposMerge: local.length,
      origem: 'local',
    })
    return { ok: false, origem: 'local' }
  }

  const mesclados = mesclarAlertas(local, remoto.dados, { prioridadeRemota: true })
  const normalizados = normalizarAlertasAposCarga(mesclados)
  salvarCacheAlertas(officeId, normalizados, {
    supabase: remoto.dados.length,
    local: local.length,
    aposMerge: normalizados.length,
    origem: 'supabase',
    updatedAtExemplo: normalizados[0]?.updated_at,
  })
  emitirAlertasAtualizados()
  return { ok: true, origem: 'supabase' }
}

export async function refreshAlertasDoSupabase(officeId: string): Promise<boolean> {
  const resultado = await carregarAlertasComunicacaoRemoto(officeId)
  return resultado.ok && resultado.origem === 'supabase'
}

export async function publicarAlertaComunicacao(
  officeId: string,
  alerta: AlertaComunicacao
): Promise<boolean> {
  if (!alertasComunicacaoModoSupabase() || !navigator.onLine) return false

  const resultado = await persistirAlertaNoSupabase(officeId, alerta)
  return resultado.ok
}

/** Persiste alerta: Supabase primeiro (online), depois cache local confirmado. */
export async function persistirAlertaComunicacao(
  officeId: string,
  alerta: AlertaComunicacao
): Promise<AlertaComunicacao> {
  if (alertasComunicacaoModoSupabase() && navigator.onLine) {
    const ok = await publicarAlertaComunicacao(officeId, alerta)
    if (!ok) {
      salvarAlertaNoCacheLocal(officeId, alerta)
      return alerta
    }
  }

  salvarAlertaNoCacheLocal(officeId, alerta)
  return alerta
}

function salvarAlertaNoCacheLocal(officeId: string, alerta: AlertaComunicacao): void {
  const lista = listarAlertasLocal(officeId)
  const idx = lista.findIndex((a) => a.local_id === alerta.local_id)
  if (idx >= 0) lista[idx] = alerta
  else lista.unshift(alerta)
  salvarAlertasOfficeLocal(officeId, lista)
}

export async function inicializarAlertasComunicacaoSupabase(officeId: string): Promise<void> {
  if (!alertasComunicacaoModoSupabase()) return

  await migrarAlertasLocalSeNecessario(officeId)
  await carregarAlertasComunicacaoRemoto(officeId)
}
