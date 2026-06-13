import type { FormaPagamento } from '@/types/enums'
import type { LancamentoFinanceiro, LancamentoFinanceiroInput } from '@/types/financeiro'
import type { OrdemServico } from '@/types/ordem-servico'
import { formatarFormaPagamentoHistorico, parcelasCreditoValidas } from '@/lib/pagamento-format'
import { getLabelFormaPagamento } from '@/types/labels'
import {
  calcularResumoFinanceiroOS,
  calcularResumoPagamentoOS,
  calcularValorPagoOS,
  listarPagamentosOS,
  obterStatusFinanceiroEfetivo,
  sugerirStatusFinanceiro,
  type OpcoesResumoFinanceiroOS,
  type ResumoFinanceiroOS,
  type ResumoPagamentoOS,
} from '@/services/os-financeiro.service'
import type { StatusFinanceiroOS } from '@/types/enums'

export type {
  OpcoesResumoFinanceiroOS,
  ResumoFinanceiroOS,
  ResumoPagamentoOS,
}

export {
  calcularResumoFinanceiroOS,
  calcularResumoPagamentoOS,
  calcularValorPagoOS,
  listarPagamentosOS,
  obterStatusFinanceiroEfetivo,
  sugerirStatusFinanceiro,
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
      const resumo = calcularResumoFinanceiroOS(os, lancamentos)
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
        valorTotal: resumo.totalGeral,
        valorPago: resumo.valorPago,
        valorPendente: resumo.valorPendente,
        vencimento: os.vencimento_pagamento,
        statusFinanceiro: resumo.statusFinanceiroEfetivo,
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
    const resumo = calcularResumoFinanceiroOS(os, lancamentos)
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
