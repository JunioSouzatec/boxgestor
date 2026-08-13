import { Badge } from '@/components/ui/badge'
import { StatusOrcamentoBadge } from '@/components/shared/StatusBadges'
import { StatusOSRapido } from '@/components/shared/StatusOSRapido'
import { ehDocumentoOrcamento } from '@/lib/os-modo-documento'
import {
  labelStatusOrcamentoParaListagem,
  tipoAprovacaoDeMeta,
} from '@/lib/orcamento-aprovacao-estado'
import { obterStatusOrcamentoEfetivo } from '@/lib/orcamento-fluxo'
import type { OrdemServico, StatusOS } from '@/types'
import { listarStatusOSSelecionaveis } from '@/types'

interface ListagemStatusDocumentoProps {
  os: OrdemServico
  onAlterarStatusOS?: (status: StatusOS) => void
  /** Premium (recurso os_bloqueio_saldo) libera "Pronto para retirada" na troca rápida. */
  premium?: boolean
}

export function ListagemStatusDocumento({
  os,
  onAlterarStatusOS,
  premium = false,
}: ListagemStatusDocumentoProps) {
  if (ehDocumentoOrcamento(os)) {
    const tipo = tipoAprovacaoDeMeta(os.aprovacao_cliente)
    if (tipo === 'partial') {
      return (
        <Badge
          variant="outline"
          className="border-teal-400/60 bg-teal-950 text-teal-100"
          title={labelStatusOrcamentoParaListagem(os)}
        >
          Aprovado parcialmente
        </Badge>
      )
    }
    const status = obterStatusOrcamentoEfetivo(os)
    if (!status) return null
    return <StatusOrcamentoBadge status={status} />
  }

  if (!onAlterarStatusOS) {
    return null
  }

  return (
    <StatusOSRapido
      status={os.status}
      onAlterarStatus={onAlterarStatusOS}
      opcoesStatus={listarStatusOSSelecionaveis({ premium, statusAtual: os.status })}
    />
  )
}
