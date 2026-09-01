/**
 * RC2 Comissão A1 — carrega perfil mínimo do mecânico via RPC
 * (sem salário; sem SELECT amplo em employee_commission_profiles).
 */
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { normalizarTipoComissao, type PerfilComissaoFuncionario } from '@/types/comissoes'

export interface MeuPerfilComissaoMinimoRpc {
  ok?: boolean
  perfil_configurado?: boolean
  error?: string
  local_id?: string
  usuario_id?: string
  office_id?: string
  nome?: string
  cargo?: string
  comissao_ativa?: boolean
  tipo_comissao?: string
  percentual_comissao?: number | null
  percentual_pecas?: number | null
  valor_fixo_por_os?: number | null
}

export type ResultadoMeuPerfilComissaoMinimo =
  | { ok: true; perfil: PerfilComissaoFuncionario }
  | { ok: true; perfil: null; motivo: 'nao_vinculado' | 'desabilitado' | 'indisponivel' }
  | { ok: false; erro: string }

function mapearPerfilMinimo(
  row: MeuPerfilComissaoMinimoRpc,
  officeIdLocal: string
): PerfilComissaoFuncionario | null {
  const localId = row.local_id?.trim()
  if (!localId) return null

  return {
    id: localId,
    oficina_id: officeIdLocal,
    office_id: officeIdLocal,
    usuario_id: row.usuario_id ?? undefined,
    nome: row.nome?.trim() || 'Funcionário',
    cargo: row.cargo?.trim() ?? '',
    // Nunca expor salário: força 0 mesmo se a RPC mudar no futuro.
    salario_fixo_mensal: 0,
    comissao_ativa: row.comissao_ativa === true,
    tipo_comissao: normalizarTipoComissao(row.tipo_comissao),
    percentual_comissao:
      row.percentual_comissao != null ? Number(row.percentual_comissao) : undefined,
    percentual_comissao_pecas:
      row.percentual_pecas != null ? Number(row.percentual_pecas) : undefined,
    valor_fixo_por_os:
      row.valor_fixo_por_os != null ? Number(row.valor_fixo_por_os) : undefined,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

/**
 * Busca o perfil mínimo do mecânico logado via SECURITY DEFINER.
 * Não depende do cache craft_tenants_v1 / perfis_comissao do dono.
 */
export async function carregarMeuPerfilComissaoMinimo(
  officeIdLocal: string
): Promise<ResultadoMeuPerfilComissaoMinimo> {
  if (!isSupabaseConfigured()) {
    return { ok: true, perfil: null, motivo: 'indisponivel' }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return { ok: true, perfil: null, motivo: 'indisponivel' }
  }

  const { data, error } = await supabase.rpc('get_my_commission_profile_minimal')

  if (error) {
    const msg = (error.message ?? '').toLowerCase()
    // Migration ainda não aplicada / função ausente → não quebra a tela.
    if (
      msg.includes('does not exist') ||
      msg.includes('function') ||
      msg.includes('schema cache') ||
      msg.includes('could not find')
    ) {
      return { ok: true, perfil: null, motivo: 'indisponivel' }
    }
    return { ok: false, erro: error.message }
  }

  const row = (data ?? {}) as MeuPerfilComissaoMinimoRpc

  if (row.ok === false) {
    if (row.error === 'commission_view_disabled') {
      return { ok: true, perfil: null, motivo: 'desabilitado' }
    }
    if (row.error === 'not_mechanic' || row.error === 'not_authenticated') {
      return { ok: true, perfil: null, motivo: 'indisponivel' }
    }
    return { ok: true, perfil: null, motivo: 'nao_vinculado' }
  }

  if (row.perfil_configurado === false) {
    return { ok: true, perfil: null, motivo: 'nao_vinculado' }
  }

  const perfil = mapearPerfilMinimo(row, officeIdLocal)
  if (!perfil) {
    return { ok: true, perfil: null, motivo: 'nao_vinculado' }
  }

  return { ok: true, perfil }
}
