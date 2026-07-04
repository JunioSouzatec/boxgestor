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

export function patchOrcamentoAposConversao(
  osGerada: Pick<OrdemServico, 'id' | 'numero'>
): Pick<OrdemServico, 'status_orcamento' | 'os_gerada_id' | 'os_gerada_numero'> {
  return {
    status_orcamento: 'convertido',
    os_gerada_id: osGerada.id,
    os_gerada_numero: osGerada.numero,
  }
}
