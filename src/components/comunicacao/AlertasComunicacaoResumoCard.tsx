import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAssinatura } from '@/context/AssinaturaContext'
import { useComunicacao } from '@/context/ComunicacaoContext'
import { cn } from '@/lib/utils'

export function AlertasComunicacaoResumoCard() {
  const { temRecurso } = useAssinatura()
  const { resumoAlertas } = useComunicacao()
  const { pendentes, vencidos, hoje } = resumoAlertas
  const urgente = vencidos > 0 || hoje > 0

  if (!temRecurso('comunicacao')) return null

  return (
    <Card
      className={cn(
        'transition-colors',
        urgente ? 'border-destructive/40' : 'border-border'
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle
                className={cn('h-5 w-5', urgente ? 'text-destructive' : 'text-amber-500')}
              />
              Alertas de comunicação
            </CardTitle>
            <CardDescription>
              {pendentes > 0
                ? `${pendentes} alerta${pendentes !== 1 ? 's' : ''} pendente${pendentes !== 1 ? 's' : ''}`
                : 'Nenhum alerta pendente no momento.'}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild className="shrink-0">
            <Link to="/comunicacao?aba=alertas">
              Ver alertas
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Link
          to="/comunicacao?aba=alertas"
          className="grid grid-cols-3 gap-3 rounded-lg border border-border p-3 transition-colors hover:border-primary/40 hover:bg-muted/20"
        >
          <div className="text-center">
            <p className="text-2xl font-bold tabular-nums">{pendentes}</p>
            <p className="text-xs text-muted-foreground">Pendentes</p>
          </div>
          <div className="text-center">
            <p
              className={cn(
                'text-2xl font-bold tabular-nums',
                vencidos > 0 && 'text-destructive'
              )}
            >
              {vencidos}
            </p>
            <p className="text-xs text-muted-foreground">Vencidos</p>
          </div>
          <div className="text-center">
            <p
              className={cn(
                'text-2xl font-bold tabular-nums',
                hoje > 0 && 'text-amber-500'
              )}
            >
              {hoje}
            </p>
            <p className="text-xs text-muted-foreground">Hoje</p>
          </div>
        </Link>
      </CardContent>
    </Card>
  )
}
