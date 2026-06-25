import type { TenantTimestampedEntity } from '@/types/base'

/** Tipos de comissão suportados na v1 */
export type TipoComissaoFuncionario =
  | 'sem_comissao'
  | 'percentual_mao_obra'
  | 'valor_fixo_os'

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
  { value: 'valor_fixo_os', label: 'Valor fixo por OS' },
]

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
  /** 0–100 quando tipo = percentual_mao_obra */
  percentual_comissao?: number
  /** Valor por OS quando tipo = valor_fixo_os */
  valor_fixo_por_os?: number
  observacoes?: string
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
  total_comissao: number
  total_estimado_pagar: number
}

export interface DetalheOsComissao {
  os_id: string
  numero: number
  data_referencia: string
  mao_obra: number
  comissao: number
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
  const fromComissoes = normalizarComissoesConfig(configuracao?.comissoes_config)
  if (configuracao?.permissions) {
    return normalizarComissoesConfig({
      ...fromComissoes,
      mecanico_ve_propria_comissao:
        configuracao.permissions.mecanico.ver_propria_comissao,
    })
  }
  return fromComissoes
}
