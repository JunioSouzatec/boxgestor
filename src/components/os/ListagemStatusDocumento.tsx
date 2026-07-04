import { StatusOrcamentoBadge } from '@/components/shared/StatusBadges'
import { StatusOSRapido } from '@/components/shared/StatusOSRapido'
import { ehDocumentoOrcamento } from '@/lib/os-modo-documento'
import { obterStatusOrcamentoEfetivo } from '@/lib/orcamento-fluxo'
import type { OrdemServico, StatusOS } from '@/types'

interface ListagemStatusDocumentoProps {
  os: OrdemServico
  onAlterarStatusOS?: (status: StatusOS) => void
}

export function ListagemStatusDocumento({ os, onAlterarStatusOS }: ListagemStatusDocumentoProps) {
  if (ehDocumentoOrcamento(os)) {
    const status = obterStatusOrcamentoEfetivo(os)
    if (!status) return null
    return <StatusOrcamentoBadge status={status} />
  }

  if (!onAlterarStatusOS) {
    return null
  }

  return <StatusOSRapido status={os.status} onAlterarStatus={onAlterarStatusOS} />
}
