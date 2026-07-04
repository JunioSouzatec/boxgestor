import { ehDocumentoOrcamento } from '@/lib/os-modo-documento'
import { obterStatusOrcamentoEfetivo } from '@/lib/orcamento-fluxo'
import { placaCorrespondeBusca, placasIguais } from '@/lib/placa-normalizar'
import { obterDataEntradaOS } from '@/services/os-datas.service'
import { calcularTotalGeralDeCampos } from '@/services/os-financeiro.service'
import { obterHistoricoMoto } from '@/services/ordem-servico.service'
import { obterResumoServicoOS } from '@/services/os-listagem.service'
import type { Cliente, Moto, OrdemServico } from '@/types'
import { getLabelStatusOrcamento, getLabelStatusOS } from '@/types/labels'

export interface HistoricoOsPlacaResumo {
  os: OrdemServico
  dataEntrada: string
  resumoServico: string
  statusLabel: string
  totalGeral: number
}

export interface ResultadoBuscaPlaca {
  moto: Moto
  cliente: Cliente | undefined
  quantidadeOs: number
  dataUltimaOs?: string
  ultimaOs?: OrdemServico
  historicoRecente: HistoricoOsPlacaResumo[]
}

function labelStatusDocumento(os: OrdemServico): string {
  if (ehDocumentoOrcamento(os)) {
    const st = obterStatusOrcamentoEfetivo(os)
    return st ? getLabelStatusOrcamento(st) : 'Orçamento'
  }
  return getLabelStatusOS(os.status)
}

function montarHistoricoRecente(
  motoId: string,
  ordens: OrdemServico[],
  limite: number
): HistoricoOsPlacaResumo[] {
  return obterHistoricoMoto(motoId, ordens)
    .slice(0, limite)
    .map((os) => ({
      os,
      dataEntrada: obterDataEntradaOS(os),
      resumoServico: obterResumoServicoOS(os),
      statusLabel: labelStatusDocumento(os),
      totalGeral: calcularTotalGeralDeCampos(os),
    }))
}

export function buscarVeiculosPorPlaca(
  placaDigitada: string,
  motos: Moto[],
  clientes: Cliente[],
  ordens: OrdemServico[],
  opcoes?: { excluirMotoId?: string; limiteHistorico?: number }
): ResultadoBuscaPlaca[] {
  const limiteHistorico = opcoes?.limiteHistorico ?? 5

  return motos
    .filter(
      (m) =>
        m.id !== opcoes?.excluirMotoId && placaCorrespondeBusca(m.placa, placaDigitada)
    )
    .map((moto) => {
      const historico = obterHistoricoMoto(moto.id, ordens)
      const ultimaOs = historico[0]
      const cliente = clientes.find((c) => c.id === moto.cliente_id)

      return {
        moto,
        cliente,
        quantidadeOs: historico.length,
        dataUltimaOs: ultimaOs ? obterDataEntradaOS(ultimaOs) : undefined,
        ultimaOs,
        historicoRecente: montarHistoricoRecente(moto.id, ordens, limiteHistorico),
      }
    })
    .sort((a, b) => {
      const dataA = a.dataUltimaOs ?? ''
      const dataB = b.dataUltimaOs ?? ''
      if (dataA !== dataB) return dataB.localeCompare(dataA)
      return a.moto.placa.localeCompare(b.moto.placa)
    })
}

export function encontrarVeiculoPorPlacaExata(
  placa: string,
  motos: Moto[],
  excluirMotoId?: string
): Moto | undefined {
  return motos.find(
    (m) => m.id !== excluirMotoId && placasIguais(m.placa, placa)
  )
}
