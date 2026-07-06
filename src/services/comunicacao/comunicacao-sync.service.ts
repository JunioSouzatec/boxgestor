import { getCraftPersistenceMode, isSupabaseConfigured } from '@/lib/supabase'
import {
  listarHistoricoLocal,
  mesclarHistoricoContatos,
  salvarHistoricoOfficeLocal,
} from '@/services/comunicacao/comunicacao.storage'
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

function salvarCacheMesclado(officeId: string, itens: HistoricoContato[]): void {
  salvarHistoricoOfficeLocal(officeId, itens)
}

/** Baixa histórico do Supabase e mescla com cache local (sem apagar registros locais). */
export async function refreshHistoricoDoSupabase(officeId: string): Promise<boolean> {
  if (!comunicacaoModoSupabase() || !navigator.onLine) return false

  const local = listarHistoricoLocal(officeId)
  const remoto = await carregarHistoricoDoSupabase(officeId)

  if (!remoto.ok || !remoto.dados) return false

  salvarCacheMesclado(officeId, mesclarHistoricoContatos(local, remoto.dados))
  emitirComunicacaoAtualizada()
  return true
}

/** Envia registros locais ainda não migrados (uma vez por oficina). */
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

/** Persiste um novo registro no Supabase (após salvar no cache local). */
export async function publicarRegistroComunicacao(
  officeId: string,
  registro: HistoricoContato
): Promise<boolean> {
  if (!comunicacaoModoSupabase() || !navigator.onLine) return false

  const resultado = await inserirHistoricoNoSupabase(officeId, registro)
  return resultado.ok
}

/** Carga inicial: migra legado local → Supabase, depois puxa histórico remoto. */
export async function inicializarComunicacaoSupabase(officeId: string): Promise<void> {
  if (!comunicacaoModoSupabase()) return

  await migrarHistoricoLocalSeNecessario(officeId)
  await refreshHistoricoDoSupabase(officeId)
}
