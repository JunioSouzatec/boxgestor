import { dataHojeLocal, sugerirDataSaidaAoMudarStatus } from '@/services/os-datas.service'
import { getLabelStatusOS } from '@/types/labels'
import type { StatusOS } from '@/types/enums'

/**
 * Status em que OS real baixa estoque ao salvar.
 * Orçamento não baixa (gate por modo_documento). Cancelada estorna.
 * Inclui status iniciais (ex.: recebida) — critério RC1: salvar OS com peça já baixa.
 */
export const STATUS_BAIXA_ESTOQUE: StatusOS[] = [
  'recebida',
  'em_diagnostico',
  'aguardando_aprovacao',
  'aguardando_peca',
  'em_servico',
  'pronto_para_retirada',
  'finalizada',
  'entregue',
]

/** Status que estornam peças baixadas */
export const STATUS_ANTES_BAIXA_ESTOQUE: StatusOS[] = ['cancelada']

export function statusExigeBaixaEstoque(status: StatusOS): boolean {
  return STATUS_BAIXA_ESTOQUE.includes(status)
}

export function statusReverteBaixaEstoque(status: StatusOS): boolean {
  return STATUS_ANTES_BAIXA_ESTOQUE.includes(status) || status === 'cancelada'
}

export function precisaConfirmarMudancaStatus(anterior: StatusOS, novo: StatusOS): boolean {
  if (anterior === novo) return false
  if (novo === 'em_servico') return true
  if (novo === 'finalizada') return true
  if (novo === 'entregue') return true
  if (novo === 'cancelada') return true
  if (statusExigeBaixaEstoque(anterior) && statusReverteBaixaEstoque(novo)) return true
  return false
}

export function mensagemConfirmacaoStatus(anterior: StatusOS, novo: StatusOS): string {
  if (novo === 'em_servico') {
    return 'Deseja iniciar esta OS?'
  }
  if (novo === 'finalizada') {
    return 'Deseja finalizar esta OS? A data de saída poderá ser preenchida.'
  }
  if (novo === 'entregue') {
    return 'Deseja marcar esta OS como entregue? Isso preencherá a data de saída e finalizará o ciclo da OS.'
  }
  if (novo === 'cancelada') {
    return 'Deseja cancelar esta OS? Pagamentos poderão ser cancelados e peças baixadas serão devolvidas ao estoque.'
  }
  if (statusExigeBaixaEstoque(anterior) && statusReverteBaixaEstoque(novo)) {
    return 'Deseja voltar o status? As peças baixadas/reservadas serão devolvidas ao estoque.'
  }
  const de = getLabelStatusOS(anterior)
  const para = getLabelStatusOS(novo)
  return `Deseja alterar o status de "${de}" para "${para}"?`
}

export function patchAoMudarStatus(
  novoStatus: StatusOS,
  dataSaidaAtual?: string
): { status: StatusOS; data_saida?: string } {
  return {
    status: novoStatus,
    data_saida: sugerirDataSaidaAoMudarStatus(novoStatus, dataSaidaAtual),
  }
}

/** Título curto para confirmação na lista */
export function tituloConfirmacaoStatus(novo: StatusOS): string {
  if (novo === 'cancelada') return 'Cancelar OS'
  if (novo === 'entregue') return 'Marcar como entregue'
  if (novo === 'finalizada') return 'Finalizar OS'
  if (novo === 'em_servico') return 'Iniciar serviço'
  return 'Confirmar mudança de status'
}

export function dataHojeSeNecessario(status: StatusOS, dataAtual?: string): string | undefined {
  if (dataAtual?.trim()) return dataAtual
  if (status === 'finalizada' || status === 'entregue') return dataHojeLocal()
  return dataAtual
}
