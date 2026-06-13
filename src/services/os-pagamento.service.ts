import type { FormaPagamento, StatusFinanceiroOS, StatusOS } from '@/types/enums'
import type { LancamentoFinanceiro, LancamentoFinanceiroInput } from '@/types/financeiro'
import type { OrdemServico } from '@/types/ordem-servico'
import { formatarFormaPagamentoHistorico, parcelasCreditoValidas } from '@/lib/pagamento-format'
import { getLabelFormaPagamento } from '@/types/labels'

export interface ResumoPagamentoOS {
  valorTotal: number
  valorPago: number
  valorPendente: number
  statusSugerido: StatusFinanceiroOS
  statusEfetivo: StatusFinanceiroOS
  quantidadePagamentos: number
}

export interface ContaReceberOS {
  os: OrdemServico
  clienteNome: string
  motoLabel: string
  valorTotal: number
  valorPago: number
  valorPendente: number
  vencimento?: string
  statusFinanceiro: StatusFinanceiroOS
  resumoPagamentos?: string
}

export interface PagamentoOSInput {
  valor: number
  forma_pagamento: FormaPagamento
  data: string
  observacao?: string
  pago?: boolean
  vencimento?: string
  parcelas?: number
}

export interface MetricasPagamentoDashboard {
  osPendentesPagamento: number
  valorAReceber: number
  recebidoNoMes: number
  pagamentosParciais: number
}

export function listarPagamentosOS(
  osId: string,
  lancamentos: LancamentoFinanceiro[]
): LancamentoFinanceiro[] {
  return lancamentos
    .filter(
      (l) =>
        l.ordem_servico_id === osId && l.tipo === 'receita' && !l.cancelado
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

export function sugerirStatusFinanceiro(
  valorTotal: number,
  valorPago: number,
  osStatus: StatusOS
): StatusFinanceiroOS {
  if (osStatus === 'cancelada') return 'cancelado'
  if (valorPago <= 0) return 'nao_pago'
  if (valorPago < valorTotal) return 'parcialmente_pago'
  return 'pago'
}

export function obterStatusFinanceiroEfetivo(
  os: OrdemServico,
  lancamentos: LancamentoFinanceiro[]
): StatusFinanceiroOS {
  if (os.status === 'cancelada') return 'cancelado'

  const valorPago = calcularValorPagoOS(os.id, lancamentos)
  const sugerido = sugerirStatusFinanceiro(os.valor_total, valorPago, os.status)

  if (os.status_financeiro) return os.status_financeiro
  return sugerido
}

export function calcularResumoPagamentoOS(
  os: OrdemServico,
  lancamentos: LancamentoFinanceiro[]
): ResumoPagamentoOS {
  const pagamentos = listarPagamentosOS(os.id, lancamentos)
  const valorPago = pagamentos.filter((l) => l.pago).reduce((acc, l) => acc + l.valor, 0)
  const valorPendente = Math.max(0, os.valor_total - valorPago)
  const statusSugerido = sugerirStatusFinanceiro(os.valor_total, valorPago, os.status)
  const statusEfetivo = obterStatusFinanceiroEfetivo(os, lancamentos)

  return {
    valorTotal: os.valor_total,
    valorPago,
    valorPendente,
    statusSugerido,
    statusEfetivo,
    quantidadePagamentos: pagamentos.length,
  }
}

export function buildDescricaoPagamentoOS(
  numero: number,
  forma: FormaPagamento,
  parcelas?: number
): string {
  const label = getLabelFormaPagamento(forma)
  if (forma === 'credito' && parcelas && parcelas > 1) {
    return `Pagamento OS #${numero} — ${label} (${parcelas}x)`
  }
  return `Pagamento OS #${numero} — ${label}`
}

function parcelasDoPagamento(pagamento: PagamentoOSInput): number | undefined {
  if (pagamento.forma_pagamento !== 'credito') return undefined
  return parcelasCreditoValidas(pagamento.parcelas)
}

export function criarInputLancamentoPagamento(
  os: OrdemServico,
  pagamento: PagamentoOSInput,
  usuario?: { id: string; nome: string }
): LancamentoFinanceiroInput {
  const pago = pagamento.pago ?? pagamento.forma_pagamento !== 'fiado'

  const parcelas = parcelasDoPagamento(pagamento)

  return {
    tipo: 'receita',
    descricao: buildDescricaoPagamentoOS(os.numero, pagamento.forma_pagamento, parcelas),
    valor: pagamento.valor,
    forma_pagamento: pagamento.forma_pagamento,
    data: pagamento.data,
    pago,
    parcelas,
    vencimento: pago ? undefined : pagamento.vencimento,
    ordem_servico_id: os.id,
    observacao: pagamento.observacao?.trim() || undefined,
    usuario_id: usuario?.id,
    usuario_nome: usuario?.nome,
    cancelado: false,
  }
}

export function listarContasReceber(
  ordens: OrdemServico[],
  lancamentos: LancamentoFinanceiro[],
  getClienteNome: (id: string) => string,
  getMotoLabel: (id: string) => string
): ContaReceberOS[] {
  return ordens
    .filter((os) => os.status !== 'cancelada')
    .map((os) => {
      const resumo = calcularResumoPagamentoOS(os, lancamentos)
      const pagamentos = listarPagamentosOS(os.id, lancamentos)
      const resumoPagamentos =
        pagamentos.length > 0
          ? pagamentos
              .map((p) => formatarFormaPagamentoHistorico(p))
              .join(' · ')
          : undefined

      return {
        os,
        clienteNome: getClienteNome(os.cliente_id),
        motoLabel: getMotoLabel(os.moto_id),
        valorTotal: resumo.valorTotal,
        valorPago: resumo.valorPago,
        valorPendente: resumo.valorPendente,
        vencimento: os.vencimento_pagamento,
        statusFinanceiro: resumo.statusEfetivo,
        resumoPagamentos,
      }
    })
    .filter((item) => item.valorPendente > 0)
    .sort((a, b) => {
      const vencA = a.vencimento ?? '9999-12-31'
      const vencB = b.vencimento ?? '9999-12-31'
      return vencA.localeCompare(vencB) || b.os.numero - a.os.numero
    })
}

export function calcularMetricasPagamentoDashboard(
  ordens: OrdemServico[],
  lancamentos: LancamentoFinanceiro[],
  mesReferencia: string
): MetricasPagamentoDashboard {
  let osPendentesPagamento = 0
  let valorAReceber = 0
  let pagamentosParciais = 0

  for (const os of ordens) {
    if (os.status === 'cancelada') continue
    const resumo = calcularResumoPagamentoOS(os, lancamentos)
    if (resumo.valorPendente > 0) {
      osPendentesPagamento++
      valorAReceber += resumo.valorPendente
    }
    if (resumo.valorPago > 0 && resumo.valorPendente > 0) {
      pagamentosParciais++
    }
  }

  const recebidoNoMes = lancamentos
    .filter(
      (l) =>
        l.tipo === 'receita' &&
        l.pago &&
        !l.cancelado &&
        l.data.startsWith(mesReferencia) &&
        !!l.ordem_servico_id
    )
    .reduce((acc, l) => acc + l.valor, 0)

  return {
    osPendentesPagamento,
    valorAReceber,
    recebidoNoMes,
    pagamentosParciais,
  }
}

export function lancamentoPagamentoAtualizado(
  os: OrdemServico,
  pagamento: PagamentoOSInput,
  usuario?: { id: string; nome: string }
): Partial<LancamentoFinanceiro> {
  const pago = pagamento.pago ?? pagamento.forma_pagamento !== 'fiado'

  const parcelas = parcelasDoPagamento(pagamento)

  return {
    descricao: buildDescricaoPagamentoOS(os.numero, pagamento.forma_pagamento, parcelas),
    valor: pagamento.valor,
    forma_pagamento: pagamento.forma_pagamento,
    data: pagamento.data,
    pago,
    parcelas,
    vencimento: pago ? undefined : pagamento.vencimento,
    observacao: pagamento.observacao?.trim() || undefined,
    usuario_id: usuario?.id,
    usuario_nome: usuario?.nome,
  }
}

export function patchCancelamentoPagamentosOS(): Partial<LancamentoFinanceiro> {
  return {
    cancelado: true,
    pago: false,
  }
}
