import type { TenantTimestampedEntity } from '@/types/base'
import { getPermissoesEquipeSeguras } from '@/types/permissoes-equipe'

/** Tipos de comissão suportados */
export type TipoComissaoFuncionario =
  | 'sem_comissao'
  | 'percentual_mao_obra'
  | 'percentual_pecas'
  | 'percentual_mao_obra_pecas'
  | 'valor_fixo_os'

/** Status de pagamento da comissão — preparado para o futuro (sem pagamento nesta etapa). */
export type StatusPagamentoComissao = 'pendente' | 'pago'

/** Critério para OS elegível ao cálculo de comissão */
export type CriterioOsComissao =
  | 'entregue_finalizada'
  | 'pagamento_recebido'
  | 'entregue_ou_pago'

export interface ComissoesConfigOficina {
  /**
   * Por padrão, a comissão fica oculta para o mecânico para evitar influência no valor da OS
   * e manter controle financeiro com o dono.
   */
  mecanico_ve_propria_comissao: boolean
  criterio_os: CriterioOsComissao
}

export const COMISSOES_CONFIG_PADRAO: ComissoesConfigOficina = {
  mecanico_ve_propria_comissao: false,
  criterio_os: 'entregue_ou_pago',
}

export const TIPOS_COMISSAO: { value: TipoComissaoFuncionario; label: string }[] = [
  { value: 'sem_comissao', label: 'Sem comissão' },
  { value: 'percentual_mao_obra', label: 'Percentual sobre mão de obra' },
  { value: 'percentual_pecas', label: 'Percentual sobre peças' },
  { value: 'percentual_mao_obra_pecas', label: 'Percentual sobre mão de obra + peças' },
  { value: 'valor_fixo_os', label: 'Valor fixo por OS' },
]

/** true quando o tipo usa percentual sobre mão de obra. */
export function tipoUsaMaoObra(tipo: TipoComissaoFuncionario): boolean {
  return tipo === 'percentual_mao_obra' || tipo === 'percentual_mao_obra_pecas'
}

/** true quando o tipo usa percentual sobre peças. */
export function tipoUsaPecas(tipo: TipoComissaoFuncionario): boolean {
  return tipo === 'percentual_pecas' || tipo === 'percentual_mao_obra_pecas'
}

/** Normaliza valor de tipo vindo do banco para um TipoComissaoFuncionario válido. */
export function normalizarTipoComissao(valor: unknown): TipoComissaoFuncionario {
  switch (valor) {
    case 'percentual_mao_obra':
    case 'percentual_pecas':
    case 'percentual_mao_obra_pecas':
    case 'valor_fixo_os':
    case 'sem_comissao':
      return valor
    // Compatibilidade com valor legado gravado em alguns bancos.
    case 'valor_fixo_por_os':
      return 'valor_fixo_os'
    default:
      return 'sem_comissao'
  }
}

export const CRITERIOS_OS_COMISSAO: { value: CriterioOsComissao; label: string }[] = [
  { value: 'entregue_ou_pago', label: 'Entregue/finalizada ou pagamento recebido' },
  { value: 'entregue_finalizada', label: 'Somente OS entregue ou finalizada' },
  { value: 'pagamento_recebido', label: 'Somente OS com pagamento recebido' },
]

export interface PerfilComissaoFuncionario extends TenantTimestampedEntity {
  /** Vínculo opcional com usuário logado (AuthUser.id) */
  usuario_id?: string
  nome: string
  cargo: string
  salario_fixo_mensal: number
  comissao_ativa: boolean
  tipo_comissao: TipoComissaoFuncionario
  /** 0–100 — percentual sobre mão de obra (tipos percentual_mao_obra e percentual_mao_obra_pecas) */
  percentual_comissao?: number
  /** 0–100 — percentual sobre peças (tipos percentual_pecas e percentual_mao_obra_pecas) */
  percentual_comissao_pecas?: number
  /** Valor por OS quando tipo = valor_fixo_os */
  valor_fixo_por_os?: number
  observacoes?: string
}

/**
 * Snapshot imutável da regra de comissão aplicada a uma OS.
 * Congela o percentual/tipo no momento da atribuição do responsável, para que
 * mudanças futuras na configuração do funcionário NÃO recalculem OS antigas.
 */
export interface ComissaoRegraSnapshotOS {
  perfil_id?: string
  responsavel_id?: string
  responsavel_nome?: string
  tipo_comissao: TipoComissaoFuncionario
  /** Percentual de mão de obra congelado (quando aplicável) */
  percentual_mao_obra?: number
  /** Percentual de peças congelado (quando aplicável) */
  percentual_pecas?: number
  /** Valor fixo por OS congelado (quando aplicável) */
  valor_fixo_os?: number
  /** Base de mão de obra considerada */
  valor_mao_obra: number
  /** Base de peças considerada */
  valor_pecas: number
  /** Valor base usado no cálculo (MO, peças ou MO+peças) */
  valor_base: number
  /** Comissão calculada com a regra congelada */
  valor_comissao: number
  /** ISO — quando a regra foi congelada */
  capturado_em: string
}

export type PerfilComissaoFuncionarioInput = Omit<
  PerfilComissaoFuncionario,
  'id' | 'oficina_id' | 'office_id' | 'created_at' | 'updated_at'
>

export interface ResumoComissaoMensalFuncionario {
  perfil_id: string
  usuario_id?: string
  nome: string
  cargo: string
  salario_fixo: number
  quantidade_os: number
  total_mao_obra: number
  total_pecas: number
  total_comissao: number
  total_estimado_pagar: number
  /** Preparado para o financeiro futuro — sem pagamento nesta etapa. */
  status_pagamento: StatusPagamentoComissao
}

export interface DetalheOsComissao {
  os_id: string
  numero: number
  data_referencia: string
  mao_obra: number
  pecas: number
  base: number
  comissao: number
  tipo_comissao?: TipoComissaoFuncionario
  /** Percentual principal aplicado (MO ou peças) — apenas informativo */
  percentual_aplicado?: number
  /** true quando o valor veio do snapshot congelado na OS */
  usou_snapshot: boolean
}

/**
 * Estrutura preparada para futura comissão por OS/serviço.
 * Não há pagamento de comissão nesta etapa — só o vínculo responsável + base + %.
 */
export interface LinhaComissaoOSPreparada {
  os_id: string
  servico_item_id?: string
  servico_nome?: string
  responsavel_id?: string
  responsavel_nome?: string
  tipo_comissao?: TipoComissaoFuncionario
  valor_mao_obra: number
  valor_pecas?: number
  percentual_mao_obra?: number
  percentual_pecas?: number
  valor_comissao_estimado?: number
}

export function normalizarComissoesConfig(
  raw?: Partial<ComissoesConfigOficina> | null
): ComissoesConfigOficina {
  return {
    mecanico_ve_propria_comissao: raw?.mecanico_ve_propria_comissao === true,
    criterio_os: raw?.criterio_os ?? COMISSOES_CONFIG_PADRAO.criterio_os,
  }
}

export function obterComissoesConfig(
  configuracao?: {
    comissoes_config?: ComissoesConfigOficina
    permissions?: import('@/types/permissoes-equipe').PermissoesEquipeConfig
  } | null
): ComissoesConfigOficina {
  try {
    const fromComissoes = normalizarComissoesConfig(configuracao?.comissoes_config)
    const perm = getPermissoesEquipeSeguras(configuracao)
    return normalizarComissoesConfig({
      ...fromComissoes,
      mecanico_ve_propria_comissao: perm.mecanico.ver_propria_comissao,
    })
  } catch {
    return normalizarComissoesConfig(configuracao?.comissoes_config)
  }
}
