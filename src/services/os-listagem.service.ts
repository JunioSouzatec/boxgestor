import type { Cliente, LancamentoFinanceiro, Moto, OrdemServico } from '@/types'
import type { StatusFinanceiroOS, StatusOS } from '@/types/enums'
import { getLabelStatusFinanceiroOS, getLabelStatusOS } from '@/types/labels'
import { calcularResumoFinanceiroOS } from '@/services/os-financeiro.service'

export interface FiltrosOSListagem {
  busca: string
  status?: StatusOS | 'todos'
  statusFinanceiro?: StatusFinanceiroOS | 'todos'
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
  dataAbertura: string
  dataPrevisao?: string
  dataFinalizacao?: string
  valorPendente: number
  totalGeral: number
  statusLabel: string
  statusFinanceiroLabel: string
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
  if (!STATUS_FINALIZADAS.includes(os.status)) return undefined
  return os.atualizado_em?.slice(0, 10) || os.criado_em?.slice(0, 10)
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

  return {
    os,
    clienteNome: cliente?.nome ?? '—',
    clienteTelefone: cliente?.telefone,
    motoLabel: moto ? `${moto.marca} ${moto.modelo}` : '—',
    motoPlaca: moto?.placa,
    resumoServico: obterResumoServicoOS(os),
    dataAbertura: os.criado_em?.slice(0, 10) ?? '—',
    dataPrevisao: os.data_previsao,
    dataFinalizacao: obterDataFinalizacaoOS(os),
    totalGeral: resumo.totalGeral,
    valorPendente: resumo.valorPendente,
    statusLabel: getLabelStatusOS(os.status),
    statusFinanceiroLabel: os.status_financeiro
      ? getLabelStatusFinanceiroOS(os.status_financeiro)
      : '—',
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
    item.dataAbertura,
    item.dataPrevisao ?? '',
    item.dataFinalizacao ?? '',
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
        os.status_financeiro !== filtros.statusFinanceiro
      ) {
        return false
      }

      if (filtros.clienteId && os.cliente_id !== filtros.clienteId) return false
      if (filtros.motoId && os.moto_id !== filtros.motoId) return false

      if (filtros.placa?.trim()) {
        const placa = item.motoPlaca?.toLowerCase() ?? ''
        if (!placa.includes(filtros.placa.trim().toLowerCase())) return false
      }

      if (filtros.dataInicio && item.dataAbertura < filtros.dataInicio) return false
      if (filtros.dataFim && item.dataAbertura > filtros.dataFim) return false

      if (filtros.apenasAbertas && !STATUS_ABERTAS.includes(os.status)) return false
      if (filtros.apenasFinalizadas && !STATUS_FINALIZADAS.includes(os.status)) return false

      if (filtros.pagamentoPendente && item.valorPendente <= 0) return false

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
  dataAbertura: string
  valorPendente: number
}[] {
  return ordens
    .filter((o) => o.cliente_id === clienteId && o.id !== excluirOsId)
    .sort((a, b) => b.numero - a.numero)
    .slice(0, 20)
    .map((os) => {
      const moto = motos.find((m) => m.id === os.moto_id)
      return {
        os,
        motoLabel: moto ? `${moto.marca} ${moto.modelo} (${moto.placa})` : '—',
        resumoServico: obterResumoServicoOS(os),
        dataAbertura: os.criado_em?.slice(0, 10) ?? '—',
        valorPendente: 0,
      }
    })
}
