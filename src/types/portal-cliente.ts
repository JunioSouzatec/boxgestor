import type { Cliente, Garantia, Moto, OrdemServico } from '@/types'
import type { LembreteComStatus } from '@/types/lembrete'

export type NivelVIP = 'bronze' | 'prata' | 'ouro' | 'diamante'

export type TipoEventoTimeline =
  | 'entrada_os'
  | 'aprovacao'
  | 'servico_executado'
  | 'entrega'
  | 'garantia'
  | 'contato'
  | 'lembrete'

export interface EventoTimeline {
  id: string
  tipo: TipoEventoTimeline
  data: string
  titulo: string
  descricao?: string
  moto_id?: string
  moto_label?: string
  ordem_servico_id?: string
  ordem_servico_numero?: number
}

export interface RegistroQuilometragemCliente {
  data: string
  quilometragem: number
  moto_id: string
  moto_label: string
  ordem_servico_numero?: number
}

export interface ResumoFinanceiroCliente {
  total_gasto: number
  quantidade_servicos: number
  ticket_medio: number
  ultimo_atendimento?: string
  proxima_revisao?: string
}

export interface EntradaPontos {
  id: string
  data: string
  descricao: string
  pontos: number
}

export interface FidelizacaoCliente {
  pontos_acumulados: number
  historico: EntradaPontos[]
}

export interface ClientePortalResumo {
  cliente: Cliente
  nivel_vip: NivelVIP
  pontos: number
  total_gasto: number
  quantidade_servicos: number
  ultimo_atendimento?: string
  tem_garantia_ativa: boolean
  tem_lembrete_proximo: boolean
  dias_sem_retorno?: number
}

export interface FichaClienteCompleta {
  cliente: Cliente
  motos: Moto[]
  ordens: OrdemServico[]
  garantias_ativas: Garantia[]
  lembretes_proximos: LembreteComStatus[]
  quilometragens: RegistroQuilometragemCliente[]
  resumo_financeiro: ResumoFinanceiroCliente
  fidelizacao: FidelizacaoCliente
  nivel_vip: NivelVIP
  timeline: EventoTimeline[]
}

export interface ResumoPortalDashboard {
  clientes_vip: ClientePortalResumo[]
  sem_retorno_90_dias: ClientePortalResumo[]
  garantia_ativa: ClientePortalResumo[]
  lembretes_proximos: ClientePortalResumo[]
}

export const NIVEL_VIP: { value: NivelVIP; label: string }[] = [
  { value: 'bronze', label: 'Bronze' },
  { value: 'prata', label: 'Prata' },
  { value: 'ouro', label: 'Ouro' },
  { value: 'diamante', label: 'Diamante' },
]

export function getLabelNivelVIP(nivel: NivelVIP): string {
  return NIVEL_VIP.find((n) => n.value === nivel)?.label ?? nivel
}

export const LABEL_EVENTO_TIMELINE: Record<TipoEventoTimeline, string> = {
  entrada_os: 'Entrada da OS',
  aprovacao: 'Aprovação',
  servico_executado: 'Serviço executado',
  entrega: 'Entrega',
  garantia: 'Garantia',
  contato: 'Contato realizado',
  lembrete: 'Lembrete enviado',
}
