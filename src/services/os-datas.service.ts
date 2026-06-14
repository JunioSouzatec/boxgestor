import type { OrdemServico } from '@/types/ordem-servico'
import type { StatusOS } from '@/types/enums'

const STATUS_COM_SAIDA: StatusOS[] = ['finalizada', 'entregue']

export function dataHojeLocal(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Data de entrada — campo explícito ou fallback para criação da OS */
export function obterDataEntradaOS(os: Pick<OrdemServico, 'data_entrada' | 'criado_em'>): string {
  return os.data_entrada ?? os.criado_em?.slice(0, 10) ?? dataHojeLocal()
}

/** Data de saída — só quando informada ou inferida de OS finalizada/entregue antiga */
export function obterDataSaidaOS(
  os: Pick<OrdemServico, 'data_saida' | 'status' | 'atualizado_em' | 'criado_em'>
): string | undefined {
  if (os.data_saida?.trim()) return os.data_saida.trim()
  if (STATUS_COM_SAIDA.includes(os.status)) {
    return os.atualizado_em?.slice(0, 10) ?? os.criado_em?.slice(0, 10)
  }
  return undefined
}

/** Preenche data de saída ao mudar status para finalizada/entregue, se ainda vazia */
export function sugerirDataSaidaAoMudarStatus(
  novoStatus: StatusOS,
  dataSaidaAtual?: string
): string | undefined {
  if (!STATUS_COM_SAIDA.includes(novoStatus)) return dataSaidaAtual
  if (dataSaidaAtual?.trim()) return dataSaidaAtual
  return dataHojeLocal()
}

export function normalizarDatasOS<T extends Pick<OrdemServico, 'data_entrada' | 'data_previsao' | 'data_saida' | 'criado_em'>>(
  os: T
): T {
  return {
    ...os,
    data_entrada: os.data_entrada ?? os.criado_em?.slice(0, 10),
    data_previsao: os.data_previsao?.trim() || undefined,
    data_saida: os.data_saida?.trim() || undefined,
  }
}
