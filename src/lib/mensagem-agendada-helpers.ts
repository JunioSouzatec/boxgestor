import { calcularTotalGeralDeCampos } from '@/services/os-financeiro.service'
import { getLabelStatusOS, getModeloMensagem } from '@/services/comunicacao/comunicacao.service'
import { resolverModelosMensagemOficina } from '@/services/comunicacao/mensagens-prontas.service'
import { substituirVariaveisMensagem } from '@/lib/substituir-variaveis-mensagem'
import { formatarMoeda, formatarData } from '@/lib/utils'
import { getLabelTipoMensagem, type TipoMensagem, type VariaveisMensagem } from '@/types/comunicacao'
import type { Cliente, Moto, OrdemServico } from '@/types'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { TipoOficina } from '@/types/tipo-oficina'

export function criarVariaveisMensagemVazias(nomeOficina = ''): VariaveisMensagem {
  return {
    nome_cliente: '',
    moto: 'Não informado',
    placa: 'Não informada',
    status_os: 'Não informado',
    nome_oficina: nomeOficina,
    numero_os: 'Não informada',
  }
}

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
    moto: moto ? `${moto.marca} ${moto.modelo}`.trim() : 'Não informado',
    placa: moto?.placa?.trim() || 'Não informada',
    status_os: os ? getLabelStatusOS(os.status) : 'Não informado',
    nome_oficina: configuracao.nome,
    numero_os: os ? String(os.numero) : 'Não informada',
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

/** Retorna o template bruto (com placeholders) do tipo selecionado. */
export function obterTextoModeloMensagem(
  tipo: TipoMensagem,
  configuracao?: ConfiguracaoOficina | null
): string {
  if (tipo === 'personalizada') return ''
  return getModeloMensagem(tipo, configuracao).corpo
}

export function listarTiposMensagemDisponiveis(
  exibirCobranca: boolean,
  configuracao?: ConfiguracaoOficina | null
): { value: TipoMensagem; label: string }[] {
  const modelos = resolverModelosMensagemOficina(configuracao)
  const tipos = modelos
    .filter((t) => exibirCobranca || t.tipo !== 'cobranca_pendencia')
    .map((t) => ({ value: t.tipo, label: t.label }))
  tipos.push({ value: 'personalizada', label: 'Personalizada' })
  return tipos
}

export function getLabelTipoMensagemOficina(
  tipo: TipoMensagem,
  configuracao?: ConfiguracaoOficina | null,
  tipoOficina?: TipoOficina
): string {
  if (tipo === 'personalizada') return 'Personalizada'
  const config = configuracao ?? ({ tipo_oficina: tipoOficina } as ConfiguracaoOficina)
  const modelo = resolverModelosMensagemOficina(config).find((m) => m.tipo === tipo)
  return modelo?.label ?? getLabelTipoMensagem(tipo)
}

export { substituirVariaveisMensagem }
