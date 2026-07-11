import { ehDocumentoOrcamento } from '@/lib/os-modo-documento'
import type { OrdemServico } from '@/types/ordem-servico'

export { orcamentoEstaConvertido } from '@/lib/orcamento-fluxo'

export function osCriadaDeOrcamento(
  os: Pick<OrdemServico, 'modo_documento' | 'orcamento_origem_id' | 'orcamento_origem_numero'>
): boolean {
  if (ehDocumentoOrcamento(os)) return false
  return Boolean(os.orcamento_origem_id?.trim() || os.orcamento_origem_numero != null)
}

export function resolverOsGeradaDoOrcamento(
  orcamento: OrdemServico,
  ordens: OrdemServico[]
): OrdemServico | undefined {
  if (orcamento.os_gerada_id) {
    const porId = ordens.find((o) => o.id === orcamento.os_gerada_id)
    if (porId) return porId
  }
  if (orcamento.os_gerada_numero != null) {
    return ordens.find(
      (o) =>
        o.modo_documento !== 'orcamento' &&
        o.numero === orcamento.os_gerada_numero &&
        (orcamento.os_gerada_id ? o.id === orcamento.os_gerada_id : true)
    )
  }
  return undefined
}

export function resolverOrcamentoOrigemDaOs(
  os: OrdemServico,
  ordens: OrdemServico[]
): OrdemServico | undefined {
  if (os.orcamento_origem_id) {
    const porId = ordens.find((o) => o.id === os.orcamento_origem_id)
    if (porId) return porId
  }
  if (os.orcamento_origem_numero != null) {
    return ordens.find(
      (o) =>
        o.modo_documento === 'orcamento' &&
        o.numero === os.orcamento_origem_numero
    )
  }
  return undefined
}

export function tituloEventoConversaoOrcamento(
  numeroOrcamento: number,
  numeroOs: number
): string {
  return `Orçamento #${numeroOrcamento} convertido em OS #${numeroOs}`
}

export function tituloEventoOsDeOrcamento(numeroOs: number, numeroOrcamento: number): string {
  return `OS #${numeroOs} gerada a partir do orçamento #${numeroOrcamento}`
}

export function patchOrcamentoAposConversao(
  _orcamento: Pick<OrdemServico, 'numero'>,
  osGerada: Pick<OrdemServico, 'id' | 'numero'>,
  opcoes?: { responsavel?: string; convertidoEm?: string }
): Pick<
  OrdemServico,
  | 'status_orcamento'
  | 'os_gerada_id'
  | 'os_gerada_numero'
  | 'orcamento_convertido_em'
  | 'orcamento_convertido_por'
> {
  return {
    status_orcamento: 'convertido',
    os_gerada_id: osGerada.id,
    os_gerada_numero: osGerada.numero,
    orcamento_convertido_em: opcoes?.convertidoEm ?? new Date().toISOString(),
    orcamento_convertido_por: opcoes?.responsavel?.trim() || undefined,
  }
}
