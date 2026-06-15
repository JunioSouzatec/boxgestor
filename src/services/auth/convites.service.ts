import type { PapelUsuario } from '@/types/auth'
import { gerarId } from '@/lib/utils'
import { getAppUrl } from '@/lib/app-url'

export type StatusConvite = 'pendente' | 'aceito' | 'cancelado' | 'expirado'

export interface ConviteUsuario {
  id: string
  token: string
  office_id: string
  nome: string
  email: string
  papel: PapelUsuario
  status: StatusConvite
  criado_em: string
  expira_em: string
  aceito_em?: string
  criado_por?: string
  nome_oficina?: string
}

export interface ConviteInput {
  nome: string
  email: string
  papel: PapelUsuario
}

export const CONVITES_STORAGE_KEY = 'craft_convites_v1'
export const CONVITE_VALIDADE_DIAS = 7

/** Cargos disponíveis em convites (sem Dono). */
export const PAPEIS_CONVITE: PapelUsuario[] = ['gerente', 'recepcao', 'mecanico']

interface ConvitesStore {
  version: 1
  convites: ConviteUsuario[]
}

function loadStore(): ConvitesStore {
  try {
    const raw = localStorage.getItem(CONVITES_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as ConvitesStore
  } catch {
    /* seed */
  }
  return { version: 1, convites: [] }
}

function saveStore(store: ConvitesStore): void {
  localStorage.setItem(CONVITES_STORAGE_KEY, JSON.stringify(store))
}

function gerarTokenConvite(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '')
  }
  return gerarId().replace(/-/g, '') + gerarId().replace(/-/g, '')
}

function expiracaoPadrao(): string {
  const d = new Date()
  d.setDate(d.getDate() + CONVITE_VALIDADE_DIAS)
  return d.toISOString()
}

function normalizarStatus(convite: ConviteUsuario): ConviteUsuario {
  if (convite.status !== 'pendente') return convite
  if (new Date(convite.expira_em) < new Date()) {
    return { ...convite, status: 'expirado' }
  }
  return convite
}

export function gerarLinkConvite(token: string): string {
  return getAppUrl(`/convite/${token}`)
}

export class ConvitesService {
  listarPorOficina(officeId: string): ConviteUsuario[] {
    const store = loadStore()
    return store.convites
      .map(normalizarStatus)
      .filter((c) => c.office_id === officeId)
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
  }

  listarPendentes(officeId: string): ConviteUsuario[] {
    return this.listarPorOficina(officeId).filter((c) => c.status === 'pendente')
  }

  contarPendentes(officeId: string): number {
    return this.listarPendentes(officeId).length
  }

  obterPorToken(token: string): ConviteUsuario | null {
    const store = loadStore()
    const convite = store.convites.find((c) => c.token === token)
    if (!convite) return null
    const normalizado = normalizarStatus(convite)
    if (normalizado.status === 'expirado' && convite.status === 'pendente') {
      const idx = store.convites.findIndex((c) => c.id === convite.id)
      store.convites[idx] = normalizado
      saveStore(store)
    }
    return normalizado
  }

  criarConvite(
    officeId: string,
    input: ConviteInput,
    opcoes?: { criado_por?: string; nome_oficina?: string }
  ): ConviteUsuario {
    const store = loadStore()
    const email = input.email.trim().toLowerCase()

    const duplicado = store.convites.some(
      (c) =>
        c.office_id === officeId &&
        c.email === email &&
        c.status === 'pendente'
    )
    if (duplicado) {
      throw new Error('Já existe um convite pendente para este e-mail.')
    }

    const agora = new Date().toISOString()
    const convite: ConviteUsuario = {
      id: gerarId(),
      token: gerarTokenConvite(),
      office_id: officeId,
      nome: input.nome.trim(),
      email,
      papel: input.papel,
      status: 'pendente',
      criado_em: agora,
      expira_em: expiracaoPadrao(),
      criado_por: opcoes?.criado_por,
      nome_oficina: opcoes?.nome_oficina,
    }

    store.convites.push(convite)
    saveStore(store)
    return convite
  }

  cancelarConvite(officeId: string, conviteId: string): void {
    const store = loadStore()
    const idx = store.convites.findIndex(
      (c) => c.id === conviteId && c.office_id === officeId
    )
    if (idx === -1) throw new Error('Convite não encontrado.')
    if (store.convites[idx].status !== 'pendente') {
      throw new Error('Este convite não pode mais ser cancelado.')
    }
    store.convites[idx] = { ...store.convites[idx], status: 'cancelado' }
    saveStore(store)
  }

  marcarAceito(token: string): ConviteUsuario {
    const store = loadStore()
    const idx = store.convites.findIndex((c) => c.token === token)
    if (idx === -1) throw new Error('Convite inválido.')
    const convite = normalizarStatus(store.convites[idx])
    if (convite.status !== 'pendente') {
      throw new Error('Este convite não está mais disponível.')
    }
    const aceito: ConviteUsuario = {
      ...convite,
      status: 'aceito',
      aceito_em: new Date().toISOString(),
    }
    store.convites[idx] = aceito
    saveStore(store)
    return aceito
  }
}

export const convitesService = new ConvitesService()

async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    return false
  }
}

export async function copiarLinkConvite(token: string): Promise<boolean> {
  return copiarTexto(gerarLinkConvite(token))
}

/** Busca convite — Supabase RPC ou localStorage conforme modo auth. */
export async function obterConvitePorTokenAsync(token: string): Promise<ConviteUsuario | null> {
  const { supabaseConvitesService, usarConvitesSupabase } = await import(
    '@/services/auth/supabase-convites.service'
  )
  if (usarConvitesSupabase()) {
    return supabaseConvitesService.obterPorToken(token)
  }
  return convitesService.obterPorToken(token)
}

/** Lista convites pendentes — Supabase ou localStorage. */
export async function listarConvitesPendentesAsync(
  officeId: string,
  nomeOficina?: string
): Promise<ConviteUsuario[]> {
  const { supabaseConvitesService, usarConvitesSupabase } = await import(
    '@/services/auth/supabase-convites.service'
  )
  if (usarConvitesSupabase()) {
    return supabaseConvitesService.listarPendentes(officeId, nomeOficina)
  }
  return convitesService.listarPendentes(officeId)
}

/** Conta convites pendentes para limite de plano. */
export async function contarConvitesPendentesAsync(officeId: string): Promise<number> {
  const { supabaseConvitesService, usarConvitesSupabase } = await import(
    '@/services/auth/supabase-convites.service'
  )
  if (usarConvitesSupabase()) {
    return supabaseConvitesService.contarPendentes(officeId)
  }
  return convitesService.contarPendentes(officeId)
}
