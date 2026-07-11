import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusOrcamentoBadge } from '@/components/shared/StatusBadges'
import {
  orcamentoEstaConvertido,
  obterStatusOrcamentoEfetivo,
} from '@/lib/orcamento-fluxo'
import { ehDocumentoOrcamento } from '@/lib/os-modo-documento'
import { resolverOsGeradaDoOrcamento } from '@/lib/orcamento-vinculo'
import { rotaVisualizarOs } from '@/lib/rota-os'
import type { OrdemServico } from '@/types'

interface OrcamentoConvertidoListagemProps {
  os: OrdemServico
  ordens: OrdemServico[]
  compact?: boolean
}

export function OrcamentoConvertidoListagemInfo({
  os,
  ordens,
  compact = false,
}: OrcamentoConvertidoListagemProps) {
  if (!orcamentoEstaConvertido(os)) return null

  const osGerada = resolverOsGeradaDoOrcamento(os, ordens)
  const numeroOs = osGerada?.numero ?? os.os_gerada_numero

  return (
    <div className={`space-y-1${compact ? '' : ' mt-1'}`}>
      <StatusOrcamentoBadge status={obterStatusOrcamentoEfetivo(os)!} />
      {numeroOs != null && (
        <p className="text-xs text-muted-foreground">
          Orçamento #{os.numero} convertido em OS #{numeroOs}
        </p>
      )}
    </div>
  )
}

interface BotaoVerOsGeradaProps {
  os: OrdemServico
  ordens: OrdemServico[]
  size?: 'sm' | 'default'
  className?: string
}

export function BotaoVerOsGerada({ os, ordens, size = 'sm', className }: BotaoVerOsGeradaProps) {
  if (!orcamentoEstaConvertido(os)) return null

  const osGerada = resolverOsGeradaDoOrcamento(os, ordens)
  if (!osGerada) return null

  return (
    <Button variant="outline" size={size} asChild className={className}>
      <Link to={rotaVisualizarOs(osGerada)}>
        <ExternalLink className="h-4 w-4" />
        Ver OS gerada
      </Link>
    </Button>
  )
}

interface OsOrigemOrcamentoHintProps {
  os: OrdemServico
  ordens: OrdemServico[]
}

export function OsOrigemOrcamentoHint({ os, ordens }: OsOrigemOrcamentoHintProps) {
  if (ehDocumentoOrcamento(os)) return null
  if (!os.orcamento_origem_id && os.orcamento_origem_numero == null) return null

  const orcamentoOrigem = ordens.find((o) => o.id === os.orcamento_origem_id)
  const numero = orcamentoOrigem?.numero ?? os.orcamento_origem_numero

  if (numero == null) return null

  return (
    <p className="text-xs text-muted-foreground">
      Gerada a partir do orçamento #{numero}
      {orcamentoOrigem && (
        <>
          {' · '}
          <Link
            to={rotaVisualizarOs(orcamentoOrigem)}
            className="underline underline-offset-2 hover:text-foreground"
          >
            Ver orçamento
          </Link>
        </>
      )}
    </p>
  )
}
