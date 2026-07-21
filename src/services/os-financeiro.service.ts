import type { StatusFinanceiroOS, StatusOS } from '@/types/enums'
import { isPagamentoOsAtivo } from '@/services/pagamentos/payment-active.helpers'
import {
  listarPagamentosOsEstrito,
  type OsVinculoPagamento,
} from '@/lib/pagamentos-os-vinculo'
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
  os: OsVinculoPagamento | string,
  lancamentos: LancamentoFinanceiro[]
): LancamentoFinanceiro[] {
  if (typeof os === 'string') {
    const osId = os.trim()
    return lancamentos
      .filter(
        (l) =>
          isPagamentoOsAtivo(l) &&
          Boolean(l.ordem_servico_id?.trim()) &&
          l.ordem_servico_id!.trim() === osId
      )
      .sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id))
  }

  if (os.numero == null || !Number.isFinite(os.numero)) {
    const osId = os.id?.trim()
    return lancamentos
      .filter(
        (l) =>
          isPagamentoOsAtivo(l) &&
          Boolean(l.ordem_servico_id?.trim()) &&
          l.ordem_servico_id!.trim() === osId
      )
      .sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id))
  }

  return listarPagamentosOsEstrito(os, lancamentos)
}

export function calcularValorPagoOS(
  os: OsVinculoPagamento | string,
  lancamentos: LancamentoFinanceiro[]
): number {
  return listarPagamentosOS(os, lancamentos)
    .filter((l) => l.pago)
    .reduce((acc, l) => acc + l.valor, 0)
}

export function validarTotalOsComPagamentos(
  os: OsVinculoPagamento | string | undefined,
  camposTotais: CamposTotaisOS,
  lancamentos: LancamentoFinanceiro[]
): { ok: true } | { ok: false; mensagem: string } {
  if (!os) return { ok: true }

  const totalGeral = calcularTotalGeralDeCampos(camposTotais)
  const valorPago = calcularValorPagoOS(os, lancamentos)

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
  > &
    Partial<Pick<OrdemServico, 'numero' | 'oficina_id' | 'office_id'>>,
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

  const pagamentos = os.id && os.numero != null
    ? listarPagamentosOsEstrito(
        {
          id: os.id,
          numero: os.numero,
          oficina_id: os.oficina_id,
          office_id: os.office_id,
        },
        lancamentos
      )
    : os.id
      ? listarPagamentosOS(os.id, lancamentos)
      : []
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

/**
 * RC2 Fase 3B.2 — condição financeira de exibição (não é status operacional).
 * "Aguardando pagamento" = OS não cancelada, não totalmente paga e com saldo
 * pendente. Baseado no mesmo cálculo de calcularResumoFinanceiroOS (pagamentos
 * cancelados/'fiado' não abatem, pois valorPago só conta lançamentos pagos).
 */
export function osAguardandoPagamento(
  statusFinanceiro: StatusFinanceiroOS,
  valorPendente: number
): boolean {
  return (
    statusFinanceiro !== 'pago' &&
    statusFinanceiro !== 'cancelado' &&
    valorPendente > 0.009
  )
}

/** Rótulo profissional da condição financeira: "Aguardando pagamento" / "Pago" / "Cancelado". */
export function obterLabelCondicaoFinanceiraOS(
  statusFinanceiro: StatusFinanceiroOS,
  valorPendente: number
): string {
  if (statusFinanceiro === 'cancelado') return 'Cancelado'
  if (osAguardandoPagamento(statusFinanceiro, valorPendente)) return 'Aguardando pagamento'
  return 'Pago'
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
  > &
    Partial<Pick<OrdemServico, 'numero' | 'oficina_id' | 'office_id'>>,
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
