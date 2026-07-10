import { getCraftPersistenceMode, isSupabaseConfigured } from '@/lib/supabase'
import { resolverEntidadeMesclada } from '@/lib/entidade-ativa'
import {
  MENSAGENS_AGENDADAS_STORAGE_KEY,
  listarMensagensAgendadas,
} from '@/services/comunicacao/mensagens-agendadas.service'
import {
  carregarMensagensAgendadasDoSupabase,
  persistirMensagensAgendadasNoSupabase,
  persistirMensagemAgendadaNoSupabase,
} from '@/services/comunicacao/supabase-mensagens-agendadas.persistence'
import type { MensagemAgendada } from '@/types/mensagem-agendada'

export const MENSAGENS_AGENDADAS_MIGRACAO_KEY = 'craft_mensagens_agendadas_migrados_supabase_v1'
export const MENSAGENS_AGENDADAS_EVENTO_ATUALIZADO = 'craft:mensagens-agendadas-atualizadas'

interface MigracaoStore {
  version: 1
  offices: Record<string, { migrado_em: string }>
}

function loadStore(): MigracaoStore {
  try {
    const raw = localStorage.getItem(MENSAGENS_AGENDADAS_MIGRACAO_KEY)
    if (raw) return JSON.parse(raw) as MigracaoStore
  } catch {
    /* seed */
  }
  return { version: 1, offices: {} }
}

function saveStore(store: MigracaoStore): void {
  localStorage.setItem(MENSAGENS_AGENDADAS_MIGRACAO_KEY, JSON.stringify(store))
}

export function mensagensAgendadasModoSupabase(): boolean {
  return getCraftPersistenceMode() === 'supabase' && isSupabaseConfigured()
}

function emitirAtualizado(): void {
  window.dispatchEvent(new CustomEvent(MENSAGENS_AGENDADAS_EVENTO_ATUALIZADO))
}

function carregarLocalBruto(officeId: string): MensagemAgendada[] {
  try {
    const raw = localStorage.getItem(MENSAGENS_AGENDADAS_STORAGE_KEY)
    if (!raw) return []
    const store = JSON.parse(raw) as { offices: Record<string, MensagemAgendada[]> }
    return store.offices[officeId] ?? []
  } catch {
    return []
  }
}

function salvarLocalBruto(officeId: string, mensagens: MensagemAgendada[]): void {
  try {
    const raw = localStorage.getItem(MENSAGENS_AGENDADAS_STORAGE_KEY)
    const store = raw
      ? (JSON.parse(raw) as { version: 1; offices: Record<string, MensagemAgendada[]> })
      : { version: 1 as const, offices: {} }
    store.offices[officeId] = mensagens
    localStorage.setItem(MENSAGENS_AGENDADAS_STORAGE_KEY, JSON.stringify(store))
  } catch {
    /* ignore */
  }
}

function mesclarMensagens(local: MensagemAgendada[], remoto: MensagemAgendada[]): MensagemAgendada[] {
  const porId = new Map<string, MensagemAgendada>()
  for (const item of remoto) porId.set(item.id, item)
  for (const item of local) {
    const existente = porId.get(item.id)
    porId.set(item.id, existente ? resolverEntidadeMesclada(item, existente) : item)
  }
  return [...porId.values()].filter((m) => m.status !== 'cancelada')
}

async function migrarSeNecessario(officeId: string): Promise<void> {
  if (!mensagensAgendadasModoSupabase() || !navigator.onLine) return
  const store = loadStore()
  if (store.offices[officeId]) return

  const local = carregarLocalBruto(officeId)
  if (local.length > 0) {
    await persistirMensagensAgendadasNoSupabase(officeId, local)
  }
  store.offices[officeId] = { migrado_em: new Date().toISOString() }
  saveStore(store)
}

export async function inicializarMensagensAgendadasSupabase(officeId: string): Promise<void> {
  if (!mensagensAgendadasModoSupabase()) return
  await migrarSeNecessario(officeId)
  await carregarMensagensAgendadasRemoto(officeId)
}

export async function carregarMensagensAgendadasRemoto(
  officeId: string
): Promise<{ ok: boolean; origem: 'supabase' | 'local' }> {
  const local = carregarLocalBruto(officeId)

  if (!mensagensAgendadasModoSupabase() || !navigator.onLine) {
    return { ok: true, origem: 'local' }
  }

  const remoto = await carregarMensagensAgendadasDoSupabase(officeId)
  if (!remoto.ok || !remoto.dados) {
    return { ok: false, origem: 'local' }
  }

  const mescladas = mesclarMensagens(local, remoto.dados)
  salvarLocalBruto(officeId, mescladas)
  emitirAtualizado()
  return { ok: true, origem: 'supabase' }
}

export async function publicarMensagemAgendada(
  officeId: string,
  msg: MensagemAgendada
): Promise<void> {
  const lista = carregarLocalBruto(officeId)
  const idx = lista.findIndex((m) => m.id === msg.id)
  if (idx >= 0) lista[idx] = msg
  else lista.unshift(msg)
  salvarLocalBruto(officeId, lista)

  if (mensagensAgendadasModoSupabase() && navigator.onLine) {
    await persistirMensagemAgendadaNoSupabase(officeId, msg)
  }
  emitirAtualizado()
}

export async function sincronizarMensagensAgendadasPush(officeId: string): Promise<void> {
  if (!mensagensAgendadasModoSupabase() || !navigator.onLine) return
  const local = carregarLocalBruto(officeId)
  if (local.length === 0) return
  await persistirMensagensAgendadasNoSupabase(officeId, local)
}

export function listarMensagensAgendadasSincronizadas(officeId: string) {
  return listarMensagensAgendadas(officeId)
}
