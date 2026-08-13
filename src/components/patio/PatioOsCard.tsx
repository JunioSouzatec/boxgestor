/**
 * Pátio A1 — card de OS (somente leitura).
 */
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn, formatarData } from '@/lib/utils'
import { rotaVisualizarOs } from '@/lib/rota-os'
import type { BadgePatio, CardPatioOS } from '@/services/patio/patio.service'

const BADGE_CLASS: Record<BadgePatio['variante'], string> = {
  danger: 'border-red-500/35 bg-red-950/50 text-red-300',
  warning: 'border-amber-500/35 bg-amber-950/50 text-amber-300',
  info: 'border-sky-500/35 bg-sky-950/50 text-sky-300',
  success: 'border-emerald-500/35 bg-emerald-950/50 text-emerald-300',
  muted: 'border-zinc-600/50 bg-zinc-800/60 text-zinc-300',
}

function textoVisivel(v?: string | null): string | null {
  const t = (v ?? '').trim()
  return t ? t : null
}

interface PatioOsCardProps {
  card: CardPatioOS
}

export function PatioOsCard({ card }: PatioOsCardProps) {
  const to = rotaVisualizarOs({ id: card.id })
  const cliente = textoVisivel(card.clienteNome) ?? 'Cliente não informado'
  const veiculo = textoVisivel(card.veiculoLabel)
  const placa = textoVisivel(card.placa)
  const responsavel = textoVisivel(card.responsavel)
  const status = textoVisivel(card.statusLabel)
  const total = textoVisivel(card.valorTotalLabel)
  const temMeta =
    Boolean(card.dataEntrada) ||
    Boolean(card.dataPrevisao) ||
    Boolean(total) ||
    card.pagamentoPendente

  return (
    <Card
      className={cn(
        'min-w-0 max-w-full border border-zinc-700/50 bg-zinc-900/90',
        'shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-all hover:border-sky-500/35',
        card.atrasada && 'border-l-[3px] border-l-red-400'
      )}
    >
      <CardContent className="min-w-0 space-y-2.5 overflow-hidden p-3">
        <Link
          to={to}
          className="block min-w-0 space-y-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
        >
          <div className="flex min-w-0 items-start justify-between gap-2">
            <p className="min-w-0 break-words text-sm font-bold text-zinc-50">
              OS #{card.numero}
            </p>
            {status ? (
              <Badge
                variant="outline"
                className="max-w-[45%] shrink-0 truncate border-zinc-600/50 bg-zinc-800/70 text-[10px] text-zinc-200"
              >
                {status}
              </Badge>
            ) : null}
          </div>

          <div className="min-w-0 space-y-0.5 text-xs">
            <p className="break-words font-medium text-zinc-100">{cliente}</p>
            {veiculo ? <p className="break-words text-zinc-300">{veiculo}</p> : null}
            {placa ? (
              <p className="break-all font-mono text-zinc-400">{placa}</p>
            ) : null}
          </div>

          {temMeta ? (
            <div className="grid min-w-0 grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-zinc-400">
              {card.dataEntrada ? (
                <p className="min-w-0 break-words">
                  Entrada:{' '}
                  <span className="text-zinc-200">{formatarData(card.dataEntrada)}</span>
                </p>
              ) : null}
              {card.dataPrevisao ? (
                <p className="min-w-0 break-words">
                  Previsão:{' '}
                  <span className="text-zinc-200">{formatarData(card.dataPrevisao)}</span>
                </p>
              ) : null}
              {total ? (
                <p className="min-w-0 break-words">
                  Total: <span className="text-zinc-200">{total}</span>
                </p>
              ) : null}
              {card.pagamentoPendente && textoVisivel(card.valorPendenteLabel) ? (
                <p className="min-w-0 break-words">
                  Saldo:{' '}
                  <span className="font-semibold text-amber-300">{card.valorPendenteLabel}</span>
                </p>
              ) : null}
            </div>
          ) : null}

          {responsavel ? (
            <p className="break-words text-[11px] text-zinc-400">Resp.: {responsavel}</p>
          ) : null}

          {card.badges.length > 0 ? (
            <div className="flex min-w-0 flex-wrap gap-1">
              {card.badges.map((b) => (
                <Badge
                  key={b.id}
                  variant="outline"
                  className={cn(
                    'max-w-full whitespace-normal text-[10px] font-semibold',
                    BADGE_CLASS[b.variante]
                  )}
                >
                  {b.label}
                </Badge>
              ))}
            </div>
          ) : null}
        </Link>

        <Link
          to={to}
          className={cn(
            'flex h-8 w-full items-center justify-center rounded-md border border-zinc-700/50',
            'bg-zinc-800/70 text-xs font-medium text-zinc-100',
            'hover:border-sky-500/40 hover:bg-sky-950/40 hover:text-sky-200'
          )}
        >
          Abrir OS
        </Link>
      </CardContent>
    </Card>
  )
}
