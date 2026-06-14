import { isModoAuthSupabaseAtivo } from '@/lib/craft-auth'
import { requireSupabaseClient } from '@/lib/supabase'
import type { PapelUsuario } from '@/types/auth'
import {
  CONVITE_VALIDADE_DIAS,
  type ConviteInput,
  type ConviteUsuario,
  type StatusConvite,
} from '@/services/auth/convites.service'
import { gerarId } from '@/lib/utils'

interface InviteRpcRow {
  id: string
  token: string
  office_id: string
  nome: string
  email: string
  papel: string
  status: string
  criado_em: string
  expira_em: string
  aceito_em?: string | null
  criado_por?: string | null
  nome_oficina?: string | null
}

interface InviteTableRow {
  id: string
  token: string
  office_id: string
  nome: string
  email: string
  papel: string
  status: string
  criado_em: string
  expira_em: string
  aceito_em?: string | null
  criado_por?: string | null
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

function rowParaConvite(row: InviteRpcRow | InviteTableRow, nomeOficina?: string): ConviteUsuario {
  return {
    id: row.id,
    token: row.token,
    office_id: row.office_id,
    nome: row.nome,
    email: row.email,
    papel: row.papel as PapelUsuario,
    status: row.status as StatusConvite,
    criado_em: row.criado_em,
    expira_em: row.expira_em,
    aceito_em: row.aceito_em ?? undefined,
    criado_por: row.criado_por ?? undefined,
    nome_oficina:
      'nome_oficina' in row && row.nome_oficina
        ? row.nome_oficina
        : nomeOficina,
  }
}

function traduzirErroConvite(mensagem: string): string {
  const m = mensagem.toLowerCase()
  if (m.includes('duplicate') || m.includes('unique') || m.includes('pendente')) {
    return 'Já existe um convite pendente para este e-mail.'
  }
  if (m.includes('permission') || m.includes('policy') || m.includes('rls')) {
    return 'Não foi possível salvar o convite. Verifique suas permissões.'
  }
  if (import.meta.env.DEV) console.warn('[Craft Convites]', mensagem)
  return 'Não foi possível concluir a operação do convite.'
}

export class SupabaseConvitesService {
  async obterPorToken(token: string): Promise<ConviteUsuario | null> {
    const supabase = requireSupabaseClient()
    const { data, error } = await supabase.rpc('get_invite_by_token', {
      p_token: token,
    } as never)

    if (error) {
      if (import.meta.env.DEV) console.error('[Craft Convites] get_invite_by_token:', error)
      return null
    }

    const rows = (data ?? []) as InviteRpcRow[]
    const row = rows[0]
    if (!row) return null
    return rowParaConvite(row)
  }

  async listarPendentes(officeId: string, nomeOficina?: string): Promise<ConviteUsuario[]> {
    const supabase = requireSupabaseClient()
    const { data, error } = await supabase
      .from('user_invites')
      .select('*')
      .eq('office_id', officeId)
      .eq('status', 'pendente')
      .order('criado_em', { ascending: false })

    if (error) {
      if (import.meta.env.DEV) console.error('[Craft Convites] listar:', error)
      return []
    }

    const agora = Date.now()
    return ((data ?? []) as InviteTableRow[])
      .map((row) => {
        if (new Date(row.expira_em).getTime() < agora) {
          return { ...rowParaConvite(row, nomeOficina), status: 'expirado' as StatusConvite }
        }
        return rowParaConvite(row, nomeOficina)
      })
      .filter((c) => c.status === 'pendente')
  }

  async contarPendentes(officeId: string): Promise<number> {
    const lista = await this.listarPendentes(officeId)
    return lista.length
  }

  async criarConvite(
    officeId: string,
    input: ConviteInput,
    opcoes?: { criado_por?: string; nome_oficina?: string }
  ): Promise<ConviteUsuario> {
    const supabase = requireSupabaseClient()
    const email = input.email.trim().toLowerCase()
    const token = gerarTokenConvite()
    const expira_em = expiracaoPadrao()

    const { data, error } = await supabase
      .from('user_invites')
      .insert({
        office_id: officeId,
        token,
        nome: input.nome.trim(),
        email,
        papel: input.papel,
        status: 'pendente',
        expira_em,
        criado_por: opcoes?.criado_por ?? null,
      } as never)
      .select('*')
      .single()

    if (error) {
      throw new Error(traduzirErroConvite(error.message))
    }

    return rowParaConvite(data as InviteTableRow, opcoes?.nome_oficina)
  }

  async cancelarConvite(officeId: string, conviteId: string): Promise<void> {
    const supabase = requireSupabaseClient()
    const { data, error: fetchError } = await supabase
      .from('user_invites')
      .select('id, status')
      .eq('id', conviteId)
      .eq('office_id', officeId)
      .maybeSingle()

    if (fetchError || !data) {
      throw new Error('Convite não encontrado.')
    }

    const row = data as { id: string; status: string }
    if (row.status !== 'pendente') {
      throw new Error('Este convite não pode mais ser cancelado.')
    }

    const { error } = await supabase
      .from('user_invites')
      .update({ status: 'cancelado' } as never)
      .eq('id', conviteId)
      .eq('office_id', officeId)

    if (error) {
      throw new Error(traduzirErroConvite(error.message))
    }
  }
}

export const supabaseConvitesService = new SupabaseConvitesService()

export function usarConvitesSupabase(): boolean {
  return isModoAuthSupabaseAtivo()
}
