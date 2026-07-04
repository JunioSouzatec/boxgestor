import type { Cliente, LancamentoFinanceiro, Moto, OrdemServico } from '@/types'
import type { StatusFinanceiroOS, StatusOS } from '@/types/enums'
import { getLabelStatusFinanceiroOS, getLabelStatusOS, getLabelStatusOrcamento } from '@/types/labels'
import { calcularResumoFinanceiroOS } from '@/services/os-financeiro.service'
import { normalizarPlaca } from '@/lib/placa-normalizar'
import { ehDocumentoOrcamento } from '@/lib/os-modo-documento'
import {
  obterStatusOrcamentoEfetivo,
  passaFiltroTipoDocumento,
  type FiltroTipoDocumentoOS,
} from '@/lib/orcamento-fluxo'
import { obterDataEntradaOS, obterDataSaidaOS } from '@/services/os-datas.service'

/** Rótulos curtos para a tabela de OS (Pago / Parcial / Pendente). */
export function obterLabelFinanceiroListagem(status: StatusFinanceiroOS): string {
  switch (status) {
    case 'pago':
      return 'Pago'
    case 'parcialmente_pago':
      return 'Parcial'
    case 'nao_pago':
    case 'pendente':
      return 'Pendente'
    case 'cancelado':
      return 'Cancelado'
    default:
      return getLabelStatusFinanceiroOS(status)
  }
}

export interface FiltrosOSListagem {
  busca: string
  status?: StatusOS | 'todos'
  statusFinanceiro?: StatusFinanceiroOS | 'todos'
  tipoDocumento?: FiltroTipoDocumentoOS
  clienteId?: string
  motoId?: string
  placa?: string
  dataInicio?: string
  dataFim?: string
  apenasAbertas?: boolean
  apenasFinalizadas?: boolean
  pagamentoPendente?: boolean
}

export interface OSListagemItem {
  os: OrdemServico
  clienteNome: string
  clienteTelefone?: string
  motoLabel: string
  motoPlaca?: string
  resumoServico: string
  dataEntrada: string
  dataPrevisao?: string
  dataSaida?: string
  /** @deprecated use dataEntrada */
  dataAbertura: string
  /** @deprecated use dataSaida */
  dataFinalizacao?: string
  totalGeral: number
  valorPago: number
  valorPendente: number
  statusFinanceiro: StatusFinanceiroOS
  statusLabel: string
  statusFinanceiroLabel: string
  exibirFinanceiro: boolean
}

const STATUS_ABERTAS: StatusOS[] = [
  'recebida',
  'em_diagnostico',
  'aguardando_aprovacao',
  'aguardando_peca',
  'em_servico',
]

const STATUS_FINALIZADAS: StatusOS[] = ['finalizada', 'entregue']

export function obterResumoServicoOS(os: OrdemServico, maxLen = 48): string {
  if (os.servicos_itens?.length) {
    const nomes = os.servicos_itens.map((s) => s.nome).join(', ')
    return nomes.length > maxLen ? `${nomes.slice(0, maxLen)}…` : nomes
  }
  const texto = os.servicos_executados?.trim()
  if (!texto) return '—'
  const linha = texto.split(/[\n,;|]/)[0]?.trim() ?? texto
  return linha.length > maxLen ? `${linha.slice(0, maxLen)}…` : linha
}

export function obterDataFinalizacaoOS(os: OrdemServico): string | undefined {
  return obterDataSaidaOS(os)
}

export function montarItemListagemOS(
  os: OrdemServico,
  clientes: Cliente[],
  motos: Moto[],
  lancamentos: LancamentoFinanceiro[]
): OSListagemItem {
  const cliente = clientes.find((c) => c.id === os.cliente_id)
  const moto = motos.find((m) => m.id === os.moto_id)
  const resumo = calcularResumoFinanceiroOS(os, lancamentos)

  const dataEntrada = obterDataEntradaOS(os)
  const dataSaida = obterDataSaidaOS(os)

  const exibirFinanceiro =
    !ehDocumentoOrcamento(os) &&
    os.status !== 'cancelada' &&
    (resumo.totalGeral > 0 || resumo.quantidadePagamentos > 0 || Boolean(os.status_financeiro))

  return {
    os,
    clienteNome: cliente?.nome ?? '—',
    clienteTelefone: cliente?.telefone,
    motoLabel: moto ? `${moto.marca} ${moto.modelo}` : '—',
    motoPlaca: moto?.placa,
    resumoServico: obterResumoServicoOS(os),
    dataEntrada,
    dataPrevisao: os.data_previsao,
    dataSaida,
    dataAbertura: dataEntrada,
    dataFinalizacao: dataSaida,
    totalGeral: resumo.totalGeral,
    valorPago: resumo.valorPago,
    valorPendente: resumo.valorPendente,
    statusFinanceiro: resumo.statusFinanceiroEfetivo,
    statusLabel: ehDocumentoOrcamento(os)
      ? getLabelStatusOrcamento(obterStatusOrcamentoEfetivo(os)!)
      : getLabelStatusOS(os.status),
    statusFinanceiroLabel: exibirFinanceiro
      ? obterLabelFinanceiroListagem(resumo.statusFinanceiroEfetivo)
      : '—',
    exibirFinanceiro,
  }
}

function textoBuscaOS(
  item: OSListagemItem,
  os: OrdemServico
): string {
  return [
    String(os.numero),
    item.clienteNome,
    item.clienteTelefone ?? '',
    item.motoLabel,
    item.motoPlaca ?? '',
    item.resumoServico,
    os.servicos_executados ?? '',
    os.defeito_relatado ?? '',
    os.status,
    os.status_financeiro ?? '',
    item.dataEntrada,
    item.dataPrevisao ?? '',
    item.dataSaida ?? '',
  ]
    .join(' ')
    .toLowerCase()
}

export function filtrarOrdensServicoListagem(
  ordens: OrdemServico[],
  clientes: Cliente[],
  motos: Moto[],
  lancamentos: LancamentoFinanceiro[],
  filtros: FiltrosOSListagem
): OSListagemItem[] {
  const busca = filtros.busca.trim().toLowerCase()

  return ordens
    .map((os) => montarItemListagemOS(os, clientes, motos, lancamentos))
    .filter((item) => {
      const { os } = item

      if (busca && !textoBuscaOS(item, os).includes(busca)) return false

      if (filtros.status && filtros.status !== 'todos' && os.status !== filtros.status) {
        return false
      }

      if (
        filtros.statusFinanceiro &&
        filtros.statusFinanceiro !== 'todos' &&
        item.statusFinanceiro !== filtros.statusFinanceiro
      ) {
        return false
      }

      if (filtros.clienteId && os.cliente_id !== filtros.clienteId) return false
      if (filtros.motoId && os.moto_id !== filtros.motoId) return false

      if (filtros.placa?.trim()) {
        const placaNorm = normalizarPlaca(filtros.placa)
        const placaItem = normalizarPlaca(item.motoPlaca ?? '')
        if (!placaItem.includes(placaNorm)) return false
      }

      if (filtros.dataInicio && item.dataEntrada < filtros.dataInicio) return false
      if (filtros.dataFim && item.dataEntrada > filtros.dataFim) return false

      if (filtros.apenasAbertas && (!STATUS_ABERTAS.includes(os.status) || ehDocumentoOrcamento(os))) {
        return false
      }
      if (filtros.apenasFinalizadas && !STATUS_FINALIZADAS.includes(os.status)) return false

      if (filtros.pagamentoPendente && item.valorPendente <= 0) return false

      if (!passaFiltroTipoDocumento(os, filtros.tipoDocumento)) return false

      return true
    })
    .sort((a, b) => b.os.numero - a.os.numero)
}

export function listarHistoricoClienteOS(
  clienteId: string,
  ordens: OrdemServico[],
  motos: Moto[],
  excluirOsId?: string
): {
  os: OrdemServico
  motoLabel: string
  resumoServico: string
  dataEntrada: string
  dataSaida?: string
  dataAbertura: string
  valorPendente: number
}[] {
  return ordens
    .filter((o) => o.cliente_id === clienteId && o.id !== excluirOsId)
    .sort((a, b) => b.numero - a.numero)
    .slice(0, 20)
    .map((os) => {
      const moto = motos.find((m) => m.id === os.moto_id)
      const dataEntrada = obterDataEntradaOS(os)
      return {
        os,
        motoLabel: moto ? `${moto.marca} ${moto.modelo} (${moto.placa})` : '—',
        resumoServico: obterResumoServicoOS(os),
        dataEntrada,
        dataSaida: obterDataSaidaOS(os),
        dataAbertura: dataEntrada,
        valorPendente: 0,
      }
    })
}
