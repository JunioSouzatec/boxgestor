import { obterLogoOficinaDocumento } from '@/lib/oficina-logo'
import {
  montarLinhasContatoOficina,
  montarLinhasEnderecoOficina,
} from '@/lib/oficina-format'
import { formatarData, formatarMoeda } from '@/lib/utils'
import {
  formatarDetalhePagamento,
  formatarPagamentoAVista,
} from '@/lib/pagamento-format'
import {
  calcularResumoFinanceiroOS,
  listarPagamentosOS,
} from '@/services/os-financeiro.service'
import type { Cliente, LancamentoFinanceiro, Moto, Oficina, OrdemServico } from '@/types'

function resumirServicos(os: OrdemServico): string {
  const partes: string[] = []
  if (os.defeito_relatado?.trim()) {
    partes.push(os.defeito_relatado.trim())
  }
  if (os.servicos_executados?.trim()) {
    partes.push(os.servicos_executados.trim())
  }
  if (!partes.length && os.diagnostico?.trim()) {
    partes.push(os.diagnostico.trim())
  }
  const texto = partes.join(' — ')
  return texto.length > 280 ? `${texto.slice(0, 277)}...` : texto
}

export type TipoReciboOS = 'parcial' | 'quitacao'

export interface ReciboHistoricoPagamento {
  data: string
  forma: string
  valor: string
  detalhe?: string
  observacao?: string
}

export interface ReciboDocumentoViewModel {
  titulo: string
  tipoRecibo: TipoReciboOS
  statusFinanceiroLabel: string
  textoRodape: string
  oficina: {
    nome: string
    nomeFantasia?: string
    cnpj?: string
    enderecoLinhas: string[]
    contatoLinhas: string[]
    logoUrl?: string
  }
  os: {
    numero: number
  }
  cliente: {
    nome: string
  }
  moto: {
    marca: string
    modelo: string
    placa: string
  }
  financeiro: {
    valorTotalOs: string
    valorPagoNesteRecibo: string
    totalJaPago: string
    saldoRestante: string
  }
  pagamentoAtual: {
    forma: string
    parcelamento?: string
    pagamentoAvista?: string
    data: string
    observacao?: string
  }
  historicoPagamentos: ReciboHistoricoPagamento[]
  totais: {
    servicos: string
    pecas: string
    adicional: string
    desconto: string
    temAdicional: boolean
  }
  servicosResumo: string
  assinaturas: {
    clienteNome: string
    oficinaNome: string
  }
}

const TEXTO_RODAPE_PARCIAL =
  'Recebemos o valor descrito acima referente a pagamento parcial da Ordem de Serviço. O saldo restante permanece em aberto até sua quitação.'

const TEXTO_RODAPE_QUITACAO =
  'Recebemos o valor total referente à Ordem de Serviço, não restando saldo pendente até a presente data.'

function montarHistoricoRecibo(
  pagamentos: LancamentoFinanceiro[]
): ReciboHistoricoPagamento[] {
  return [...pagamentos]
    .filter((p) => p.pago)
    .sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id))
    .map((p) => {
      const detalhe = formatarDetalhePagamento(p)
      let detalheExtra: string | undefined

      if (p.forma_pagamento === 'credito') {
        detalheExtra = detalhe.parcelamento ?? formatarPagamentoAVista()
      }

      return {
        data: formatarData(p.data),
        forma: detalhe.forma,
        valor: formatarMoeda(p.valor),
        detalhe: detalheExtra,
        observacao: p.observacao?.trim() || undefined,
      }
    })
}

function determinarTipoRecibo(totalJaPago: number, totalOs: number): TipoReciboOS {
  return totalJaPago >= totalOs && totalOs > 0 ? 'quitacao' : 'parcial'
}

export function buildReciboDocumentoViewModel(
  os: OrdemServico,
  pagamento: LancamentoFinanceiro,
  cliente: Cliente,
  moto: Moto,
  oficina: Oficina,
  lancamentos: LancamentoFinanceiro[] = []
): ReciboDocumentoViewModel {
  const detalheAtual = formatarDetalhePagamento(pagamento)
  const resumo = calcularResumoFinanceiroOS(os, lancamentos)
  const historico = listarPagamentosOS(os.id, lancamentos)
  const tipoRecibo = determinarTipoRecibo(resumo.valorPago, resumo.totalGeral)
  const titulo =
    tipoRecibo === 'quitacao' ? 'Recibo de Quitação' : 'Recibo de Pagamento Parcial'
  const statusFinanceiroLabel =
    tipoRecibo === 'quitacao' ? 'Quitado' : 'Pagamento parcial'

  const pagamentoAvista =
    pagamento.forma_pagamento === 'credito' && !detalheAtual.parcelamento
      ? formatarPagamentoAVista()
      : undefined

  return {
    titulo,
    tipoRecibo,
    statusFinanceiroLabel,
    textoRodape: tipoRecibo === 'quitacao' ? TEXTO_RODAPE_QUITACAO : TEXTO_RODAPE_PARCIAL,
    oficina: {
      nome: oficina.nome,
      nomeFantasia: oficina.nome_fantasia?.trim() || undefined,
      cnpj: oficina.cnpj?.trim() || undefined,
      enderecoLinhas: montarLinhasEnderecoOficina(oficina),
      contatoLinhas: montarLinhasContatoOficina(oficina),
      logoUrl: obterLogoOficinaDocumento(oficina),
    },
    os: {
      numero: os.numero,
    },
    cliente: {
      nome: cliente.nome,
    },
    moto: {
      marca: moto.marca,
      modelo: moto.modelo,
      placa: moto.placa,
    },
    financeiro: {
      valorTotalOs: formatarMoeda(resumo.totalGeral),
      valorPagoNesteRecibo: formatarMoeda(pagamento.valor),
      totalJaPago: formatarMoeda(resumo.valorPago),
      saldoRestante: formatarMoeda(resumo.valorPendente),
    },
    pagamentoAtual: {
      forma: detalheAtual.forma,
      parcelamento: detalheAtual.parcelamento,
      pagamentoAvista,
      data: formatarData(pagamento.data),
      observacao: pagamento.observacao?.trim() || undefined,
    },
    historicoPagamentos: montarHistoricoRecibo(historico),
    totais: {
      servicos: formatarMoeda(resumo.totalMaoDeObra),
      pecas: formatarMoeda(resumo.totalPecasProdutos),
      adicional: formatarMoeda(resumo.totalAdicionaisAprovados),
      desconto: formatarMoeda(resumo.totalDescontos),
      temAdicional: resumo.totalAdicionaisAprovados > 0,
    },
    servicosResumo: resumirServicos(os),
    assinaturas: {
      clienteNome: cliente.nome,
      oficinaNome: oficina.nome_fantasia?.trim() || oficina.nome,
    },
  }
}

/** Linha resumida para exibição no histórico (data — forma — valor — detalhe) */
export function formatarLinhaHistoricoRecibo(item: ReciboHistoricoPagamento): string {
  const partes = [item.data, item.forma, item.valor]
  if (item.detalhe) partes.push(item.detalhe)
  else if (item.observacao) partes.push(item.observacao)
  return partes.join(' — ')
}
