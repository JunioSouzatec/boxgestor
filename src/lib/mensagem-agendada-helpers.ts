import { calcularTotalGeralDeCampos } from '@/services/os-financeiro.service'
import { montarMensagem, getLabelStatusOS } from '@/services/comunicacao/comunicacao.service'
import { formatarMoeda, formatarData } from '@/lib/utils'
import { TIPOS_MENSAGEM, type TipoMensagem, type VariaveisMensagem } from '@/types/comunicacao'
import type { Cliente, Moto, OrdemServico } from '@/types'
import type { ConfiguracaoOficina } from '@/types/oficina'

export function montarVariaveisMensagemCliente(input: {
  cliente: Cliente
  configuracao: ConfiguracaoOficina
  moto?: Moto
  os?: OrdemServico
  exibirValoresFinanceiros?: boolean
  dataPrevista?: string
  dataEntrega?: string
}): VariaveisMensagem {
  const { cliente, configuracao, moto, os, exibirValoresFinanceiros, dataPrevista, dataEntrega } =
    input
  return {
    nome_cliente: cliente.nome,
    moto: moto ? `${moto.marca} ${moto.modelo}` : 'seu veículo',
    placa: moto?.placa ?? '—',
    status_os: os ? getLabelStatusOS(os.status) : '—',
    nome_oficina: configuracao.nome,
    numero_os: os ? String(os.numero) : '—',
    valor_os:
      exibirValoresFinanceiros && os
        ? formatarMoeda(calcularTotalGeralDeCampos(os))
        : undefined,
    data_garantia: os?.data_vencimento_garantia
      ? formatarData(os.data_vencimento_garantia)
      : undefined,
    data_entrega: dataEntrega ? formatarData(dataEntrega) : undefined,
    data_prevista: dataPrevista ? formatarData(dataPrevista) : undefined,
  }
}

export function montarTextoMensagemAgendada(
  tipo: TipoMensagem,
  vars: VariaveisMensagem
): string {
  return montarMensagem(tipo, vars)
}

export function listarTiposMensagemDisponiveis(
  exibirCobranca: boolean
): { value: TipoMensagem; label: string }[] {
  return TIPOS_MENSAGEM.filter(
    (t) => exibirCobranca || t.value !== 'cobranca_pendencia'
  )
}
