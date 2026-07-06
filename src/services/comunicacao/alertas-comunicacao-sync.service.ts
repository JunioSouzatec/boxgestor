import { getCraftPersistenceMode, isSupabaseConfigured } from '@/lib/supabase'
import {
  listarAlertasLocal,
  mesclarAlertas,
  salvarAlertasOfficeLocal,
} from '@/services/comunicacao/alertas-comunicacao.storage'
import {
  carregarAlertasDoSupabase,
  migrarAlertasLocalParaSupabase,
  persistirAlertaNoSupabase,
} from '@/services/comunicacao/supabase-alertas-comunicacao.persistence'
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

export async function refreshAlertasDoSupabase(officeId: string): Promise<boolean> {
  if (!alertasComunicacaoModoSupabase() || !navigator.onLine) return false

  const local = listarAlertasLocal(officeId)
  const remoto = await carregarAlertasDoSupabase(officeId)

  if (!remoto.ok || !remoto.dados) return false

  salvarAlertasOfficeLocal(officeId, mesclarAlertas(local, remoto.dados))
  emitirAlertasAtualizados()
  return true
}

export async function publicarAlertaComunicacao(
  officeId: string,
  alerta: AlertaComunicacao
): Promise<boolean> {
  if (!alertasComunicacaoModoSupabase() || !navigator.onLine) return false

  const resultado = await persistirAlertaNoSupabase(officeId, alerta)
  return resultado.ok
}

export async function inicializarAlertasComunicacaoSupabase(officeId: string): Promise<void> {
  if (!alertasComunicacaoModoSupabase()) return

  await migrarAlertasLocalSeNecessario(officeId)
  await refreshAlertasDoSupabase(officeId)
}
