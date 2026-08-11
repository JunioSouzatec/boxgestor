/**
 * Pátio A1 — card de OS (somente leitura).
 */
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn, formatarData } from '@/lib/utils'
import { rotaVisualizarOs } from '@/lib/rota-os'
import type { BadgePatio, CardPatioOS } from '@/services/patio/patio.service'

const BADGE_CLASS: Record<BadgePatio['variante'], string> = {
  danger: 'border-red-400/70 bg-red-950 text-red-100',
  warning: 'border-amber-400/70 bg-amber-950 text-amber-100',
  info: 'border-sky-400/70 bg-sky-950 text-sky-100',
  success: 'border-emerald-400/70 bg-emerald-950 text-emerald-100',
  muted: 'border-border bg-muted text-muted-foreground',
}

interface PatioOsCardProps {
  card: CardPatioOS
}

export function PatioOsCard({ card }: PatioOsCardProps) {
  const to = rotaVisualizarOs({ id: card.id })

  return (
    <Card
      className={cn(
        'min-w-0 max-w-full border-border/80 bg-card/80 transition-colors hover:border-primary/40',
        card.atrasada && 'border-red-500/40'
      )}
    >
      <CardContent className="min-w-0 space-y-2 overflow-hidden p-3">
        <Link
          to={to}
          className="block min-w-0 space-y-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <div className="flex min-w-0 items-start justify-between gap-2">
            <p className="min-w-0 break-words text-sm font-bold text-foreground">
              OS #{card.numero}
            </p>
            <Badge variant="outline" className="max-w-[45%] shrink-0 truncate text-[10px]">
              {card.statusLabel}
            </Badge>
          </div>
          <div className="min-w-0 space-y-0.5 text-xs text-foreground/85">
            <p className="break-words font-medium">{card.clienteNome}</p>
            <p className="break-words">{card.veiculoLabel}</p>
            {card.placa ? (
              <p className="break-all font-mono text-foreground/70">{card.placa}</p>
            ) : null}
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-1 text-[11px] text-foreground/75">
            <p className="min-w-0 break-words">
              Entrada:{' '}
              <span className="text-foreground">
                {card.dataEntrada ? formatarData(card.dataEntrada) : '—'}
              </span>
            </p>
            <p className="min-w-0 break-words">
              Previsão:{' '}
              <span className="text-foreground">
                {card.dataPrevisao ? formatarData(card.dataPrevisao) : '—'}
              </span>
            </p>
            <p className="min-w-0 break-words">
              Total: <span className="text-foreground">{card.valorTotalLabel}</span>
            </p>
            <p className="min-w-0 break-words">
              Saldo:{' '}
              <span
                className={cn(
                  'text-foreground',
                  card.pagamentoPendente && 'font-semibold text-amber-700 dark:text-amber-300'
                )}
              >
                {card.pagamentoPendente ? card.valorPendenteLabel : '—'}
              </span>
            </p>
          </div>
          {card.responsavel ? (
            <p className="break-words text-[11px] text-foreground/70">Resp.: {card.responsavel}</p>
          ) : null}
          {card.badges.length > 0 ? (
            <div className="flex min-w-0 flex-wrap gap-1">
              {card.badges.map((b) => (
                <Badge
                  key={b.id}
                  variant="outline"
                  className={cn('max-w-full whitespace-normal text-[10px] font-semibold', BADGE_CLASS[b.variante])}
                >
                  {b.label}
                </Badge>
              ))}
            </div>
          ) : null}
        </Link>
        <Button asChild size="sm" variant="outline" className="w-full" onClick={(e) => e.stopPropagation()}>
          <Link to={to}>Abrir OS</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
