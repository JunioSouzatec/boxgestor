import {
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  MessageCircle,
  Timer,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { AlertaComunicacao } from '@/types/alerta-comunicacao'
import {
  getLabelPrioridadeAlerta,
  getLabelStatusAlertaComunicacao,
  getLabelTipoAlertaComunicacao,
} from '@/types/alerta-comunicacao'
import { formatarData } from '@/lib/utils'
import { cn } from '@/lib/utils'

const PRIORIDADE_STYLES: Record<string, string> = {
  vencido: 'border-destructive/40 bg-destructive/5 text-destructive',
  hoje: 'border-amber-500/40 bg-amber-500/5 text-amber-500',
  proximos_dias: 'border-primary/30 bg-primary/5 text-primary',
}

const STATUS_STYLES: Record<string, string> = {
  pendente: 'border-border text-muted-foreground',
  enviado: 'border-emerald-500/40 text-emerald-400',
  resolvido: 'border-border text-muted-foreground',
  adiado: 'border-sky-500/40 text-sky-400',
}

interface AlertaComunicacaoCardProps {
  alerta: AlertaComunicacao
  onVerMensagem: (alerta: AlertaComunicacao) => void
  onWhatsApp: (alerta: AlertaComunicacao) => void
  onCopiar: (alerta: AlertaComunicacao) => void
  onAdiar: (alerta: AlertaComunicacao) => void
  onResolver: (alerta: AlertaComunicacao) => void
}

export function AlertaComunicacaoCard({
  alerta,
  onVerMensagem,
  onWhatsApp,
  onCopiar,
  onAdiar,
  onResolver,
}: AlertaComunicacaoCardProps) {
  const acoesAtivas = alerta.status === 'pendente'

  return (
    <Card className="overflow-hidden border-border bg-card/50">
      <CardContent className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn('text-xs', PRIORIDADE_STYLES[alerta.prioridade])}
              >
                {getLabelPrioridadeAlerta(alerta.prioridade)}
              </Badge>
              <Badge variant="outline" className={cn('text-xs', STATUS_STYLES[alerta.status])}>
                {getLabelStatusAlertaComunicacao(alerta.status)}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {getLabelTipoAlertaComunicacao(alerta.tipo)}
              </Badge>
            </div>

            <div>
              <p className="font-semibold">{alerta.cliente_nome}</p>
              {alerta.moto_descricao && (
                <p className="text-sm text-muted-foreground">
                  {alerta.moto_descricao}
                  {alerta.placa ? ` · ${alerta.placa}` : ''}
                </p>
              )}
            </div>

            <p className="text-sm">{alerta.motivo}</p>

            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {formatarData(alerta.due_date)}
              </span>
              {alerta.ordem_servico_numero && (
                <span>OS #{alerta.ordem_servico_numero}</span>
              )}
              {alerta.status === 'adiado' && alerta.adiado_ate && (
                <span className="inline-flex items-center gap-1">
                  <Timer className="h-3.5 w-3.5" />
                  Adiado até {formatarData(alerta.adiado_ate)}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 sm:max-w-[280px] sm:justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onVerMensagem(alerta)}
              className="gap-1.5"
            >
              <Eye className="h-4 w-4" />
              <span className="hidden sm:inline">Ver mensagem</span>
            </Button>
            {acoesAtivas && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onWhatsApp(alerta)}
                  title="Abrir WhatsApp"
                >
                  <MessageCircle className="h-4 w-4 text-emerald-400" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onCopiar(alerta)}
                  title="Copiar mensagem"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onAdiar(alerta)}
                  title="Adiar"
                >
                  <Clock className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onResolver(alerta)}
                  title="Marcar como resolvido"
                >
                  <CheckCircle2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface AlertasResumoCardsProps {
  vencidos: number
  hoje: number
  proximos: number
  pendentes: number
}

export function AlertasResumoCards({ vencidos, hoje, proximos, pendentes }: AlertasResumoCardsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <p className="flex items-center gap-2 text-2xl font-bold text-destructive">
          <Bell className="h-5 w-5" />
          {vencidos}
        </p>
        <p className="text-sm text-muted-foreground">Vencidos</p>
      </div>
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="text-2xl font-bold text-amber-500">{hoje}</p>
        <p className="text-sm text-muted-foreground">Para hoje</p>
      </div>
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <p className="text-2xl font-bold">{proximos}</p>
        <p className="text-sm text-muted-foreground">Próximos 7 dias</p>
      </div>
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
        <p className="text-2xl font-bold text-primary">{pendentes}</p>
        <p className="text-sm text-muted-foreground">Pendentes no total</p>
      </div>
    </div>
  )
}
