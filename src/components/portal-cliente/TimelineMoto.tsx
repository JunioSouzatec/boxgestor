import {
  Bike,
  ClipboardList,
  MessageCircle,
  Bell,
  Shield,
  CheckCircle2,
  LogIn,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatarData } from '@/lib/utils'
import type { EventoTimeline, TipoEventoTimeline } from '@/types/portal-cliente'
import { LABEL_EVENTO_TIMELINE } from '@/types/portal-cliente'
import { cn } from '@/lib/utils'

const ICONES: Record<TipoEventoTimeline, typeof LogIn> = {
  entrada_os: LogIn,
  aprovacao: CheckCircle2,
  servico_executado: ClipboardList,
  entrega: Bike,
  garantia: Shield,
  contato: MessageCircle,
  lembrete: Bell,
}

const CORES: Record<TipoEventoTimeline, string> = {
  entrada_os: 'border-blue-500/40 bg-blue-500/10 text-blue-400',
  aprovacao: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  servico_executado: 'border-primary/40 bg-primary/10 text-primary',
  entrega: 'border-violet-500/40 bg-violet-500/10 text-violet-400',
  garantia: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  contato: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  lembrete: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400',
}

interface TimelineMotoProps {
  eventos: EventoTimeline[]
  titulo?: string
  motoLabel?: string
  vazio?: string
}

export function TimelineMoto({
  eventos,
  titulo = 'Timeline da moto',
  motoLabel,
  vazio = 'Nenhum evento registrado.',
}: TimelineMotoProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{titulo}</CardTitle>
        {motoLabel && <CardDescription>{motoLabel}</CardDescription>}
      </CardHeader>
      <CardContent>
        {eventos.length === 0 ? (
          <p className="text-sm text-muted-foreground">{vazio}</p>
        ) : (
          <div className="relative space-y-0">
            <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" aria-hidden />
            {eventos.map((ev) => {
              const Icone = ICONES[ev.tipo]
              return (
                <div key={ev.id} className="relative flex gap-4 pb-6 last:pb-0">
                  <div
                    className={cn(
                      'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border',
                      CORES[ev.tipo]
                    )}
                  >
                    <Icone className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 pt-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-sm">{ev.titulo}</p>
                      <span className="text-xs text-muted-foreground">
                        {LABEL_EVENTO_TIMELINE[ev.tipo]}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatarData(ev.data.slice(0, 10))}
                      {ev.data.length > 10 && (
                        <span> · {ev.data.slice(11, 16)}</span>
                      )}
                      {ev.moto_label && !motoLabel && (
                        <span className="ml-1">· {ev.moto_label}</span>
                      )}
                    </p>
                    {ev.descricao && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{ev.descricao}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
