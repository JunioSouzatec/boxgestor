import { Badge } from '@/components/ui/badge'
import { StatusOrcamentoBadge, StatusOSBadge } from '@/components/shared/StatusBadges'
import {
  obterStatusOrcamentoEfetivo,
  orcamentoEstaConvertido,
} from '@/lib/orcamento-fluxo'
import { ehDocumentoOrcamento } from '@/lib/os-modo-documento'
import {
  OrcamentoConvertidoListagemInfo,
  OsOrigemOrcamentoHint,
} from '@/components/os/OrcamentoConvertidoListagem'
import type { OrdemServico } from '@/types'

interface ClienteDocumentoStatusCellProps {
  os: OrdemServico
  ordens: OrdemServico[]
}

export function ClienteDocumentoNumeroCell({ os }: { os: OrdemServico }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="font-medium">#{os.numero}</span>
      {ehDocumentoOrcamento(os) && (
        <Badge variant="secondary" className="text-[10px]">
          Orçamento
        </Badge>
      )}
    </div>
  )
}

export function ClienteDocumentoStatusCell({ os, ordens }: ClienteDocumentoStatusCellProps) {
  if (ehDocumentoOrcamento(os)) {
    if (orcamentoEstaConvertido(os)) {
      return <OrcamentoConvertidoListagemInfo os={os} ordens={ordens} />
    }
    const statusOrcamento = obterStatusOrcamentoEfetivo(os)
    if (statusOrcamento) {
      return <StatusOrcamentoBadge status={statusOrcamento} />
    }
    return <StatusOSBadge status={os.status} />
  }

  return (
    <div className="space-y-1">
      <StatusOSBadge status={os.status} />
      <OsOrigemOrcamentoHint os={os} ordens={ordens} />
    </div>
  )
}
