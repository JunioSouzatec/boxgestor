import type { StatusFinanceiroOS, StatusOS } from '@/types/enums'
import { isPagamentoOsAtivo } from '@/services/pagamentos/payment-active.helpers'
import type { LancamentoFinanceiro } from '@/types/financeiro'
import type { OrdemServico } from '@/types/ordem-servico'
import { calcularValorTotalOS } from '@/types/labels'

export type CamposTotaisOS = Pick<
  OrdemServico,
  'valor_pecas' | 'valor_mao_obra' | 'valor_adicional' | 'desconto'
>

export interface ResumoFinanceiroOS {
  totalMaoDeObra: number
  totalPecasProdutos: number
  totalAdicionaisAprovados: number
  totalDescontos: number
  totalGeral: number
  valorPago: number
  valorPendente: number
  statusFinanceiroSugerido: StatusFinanceiroOS
  statusFinanceiroEfetivo: StatusFinanceiroOS
  statusFinanceiroManual: boolean
  quantidadePagamentos: number
}

/** @deprecated Use ResumoFinanceiroOS — mantido para compatibilidade */
export interface ResumoPagamentoOS {
  valorTotal: number
  valorPago: number
  valorPendente: number
  statusSugerido: StatusFinanceiroOS
  statusEfetivo: StatusFinanceiroOS
  quantidadePagamentos: number
}

export interface OpcoesResumoFinanceiroOS {
  /** Total geral em tempo real (formulário de edição) */
  totalGeral?: number
  /** Sobrescreve campos parciais (ex.: form em edição) */
  camposTotais?: Partial<CamposTotaisOS>
}

export function calcularTotalGeralDeCampos(campos: CamposTotaisOS): number {
  return calcularValorTotalOS(
    campos.valor_pecas ?? 0,
    campos.valor_mao_obra ?? 0,
    campos.desconto ?? 0,
    campos.valor_adicional ?? 0
  )
}

export function extrairCamposTotaisOS(os: CamposTotaisOS): CamposTotaisOS {
  return {
    valor_pecas: os.valor_pecas ?? 0,
    valor_mao_obra: os.valor_mao_obra ?? 0,
    valor_adicional: os.valor_adicional ?? 0,
    desconto: os.desconto ?? 0,
  }
}

export function listarPagamentosOS(
  osId: string,
  lancamentos: LancamentoFinanceiro[]
): LancamentoFinanceiro[] {
  return lancamentos
    .filter(
      (l) =>
        l.ordem_servico_id === osId &&
        isPagamentoOsAtivo(l)
    )
    .sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id))
}

export function calcularValorPagoOS(
  osId: string,
  lancamentos: LancamentoFinanceiro[]
): number {
  return listarPagamentosOS(osId, lancamentos)
    .filter((l) => l.pago)
    .reduce((acc, l) => acc + l.valor, 0)
}

export function validarTotalOsComPagamentos(
  osId: string | undefined,
  camposTotais: CamposTotaisOS,
  lancamentos: LancamentoFinanceiro[]
): { ok: true } | { ok: false; mensagem: string } {
  if (!osId) return { ok: true }

  const totalGeral = calcularTotalGeralDeCampos(camposTotais)
  const valorPago = calcularValorPagoOS(osId, lancamentos)

  if (valorPago > totalGeral + 0.009) {
    return {
      ok: false,
      mensagem:
        'O total da OS ficou menor que o valor já pago. Ajuste o valor da OS ou revise os pagamentos.',
    }
  }

  return { ok: true }
}

export function sugerirStatusFinanceiro(
  totalGeral: number,
  valorPago: number,
  osStatus: StatusOS
): StatusFinanceiroOS {
  if (osStatus === 'cancelada') return 'cancelado'
  if (valorPago <= 0) return 'nao_pago'
  if (valorPago < totalGeral) return 'parcialmente_pago'
  return 'pago'
}

export function calcularResumoFinanceiroOS(
  os: Pick<
    OrdemServico,
    | 'id'
    | 'status'
    | 'status_financeiro'
    | 'valor_pecas'
    | 'valor_mao_obra'
    | 'valor_adicional'
    | 'desconto'
  >,
  lancamentos: LancamentoFinanceiro[],
  opcoes?: OpcoesResumoFinanceiroOS
): ResumoFinanceiroOS {
  const campos: CamposTotaisOS = {
    ...extrairCamposTotaisOS(os),
    ...opcoes?.camposTotais,
  }

  const totalMaoDeObra = campos.valor_mao_obra ?? 0
  const totalPecasProdutos = campos.valor_pecas ?? 0
  const totalAdicionaisAprovados = campos.valor_adicional ?? 0
  const totalDescontos = campos.desconto ?? 0
  const totalGeral = opcoes?.totalGeral ?? calcularTotalGeralDeCampos(campos)

  const pagamentos = os.id ? listarPagamentosOS(os.id, lancamentos) : []
  const valorPago = pagamentos.filter((l) => l.pago).reduce((acc, l) => acc + l.valor, 0)
  const valorPendente = Math.max(0, totalGeral - valorPago)

  const statusFinanceiroSugerido = sugerirStatusFinanceiro(totalGeral, valorPago, os.status)

  let statusFinanceiroEfetivo: StatusFinanceiroOS
  let statusFinanceiroManual = false

  if (os.status === 'cancelada') {
    statusFinanceiroEfetivo = 'cancelado'
  } else {
    statusFinanceiroEfetivo = statusFinanceiroSugerido
    statusFinanceiroManual = Boolean(
      os.status_financeiro && os.status_financeiro !== statusFinanceiroSugerido
    )
  }

  return {
    totalMaoDeObra,
    totalPecasProdutos,
    totalAdicionaisAprovados,
    totalDescontos,
    totalGeral,
    valorPago,
    valorPendente,
    statusFinanceiroSugerido,
    statusFinanceiroEfetivo,
    statusFinanceiroManual,
    quantidadePagamentos: pagamentos.length,
  }
}

export function obterStatusFinanceiroEfetivo(
  os: OrdemServico,
  lancamentos: LancamentoFinanceiro[],
  opcoes?: OpcoesResumoFinanceiroOS
): StatusFinanceiroOS {
  return calcularResumoFinanceiroOS(os, lancamentos, opcoes).statusFinanceiroEfetivo
}

/** Alias de compatibilidade — preferir calcularResumoFinanceiroOS */
export function calcularResumoPagamentoOS(
  os: Pick<
    OrdemServico,
    | 'id'
    | 'status'
    | 'status_financeiro'
    | 'valor_pecas'
    | 'valor_mao_obra'
    | 'valor_adicional'
    | 'desconto'
  >,
  lancamentos: LancamentoFinanceiro[],
  opcoes?: OpcoesResumoFinanceiroOS
): ResumoPagamentoOS {
  const resumo = calcularResumoFinanceiroOS(os, lancamentos, opcoes)
  return {
    valorTotal: resumo.totalGeral,
    valorPago: resumo.valorPago,
    valorPendente: resumo.valorPendente,
    statusSugerido: resumo.statusFinanceiroSugerido,
    statusEfetivo: resumo.statusFinanceiroEfetivo,
    quantidadePagamentos: resumo.quantidadePagamentos,
  }
}
