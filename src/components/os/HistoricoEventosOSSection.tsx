import { formatarData, formatarMoeda } from '@/lib/utils'
import { deduplicarHistoricoEventos } from '@/services/os-historico.service'
import type { EventoHistoricoOS } from '@/types/os-historico'

interface HistoricoEventosOSSectionProps {
  eventos?: EventoHistoricoOS[]
  compact?: boolean
}

export function HistoricoEventosOSSection({
  eventos = [],
  compact = false,
}: HistoricoEventosOSSectionProps) {
  if (eventos.length === 0) return null

  const ordenados = deduplicarHistoricoEventos(eventos).sort((a, b) =>
    b.data_hora.localeCompare(a.data_hora, undefined, { numeric: true })
  )

  return (
    <div className={`rounded-lg border border-border bg-muted/10 ${compact ? 'p-3' : 'p-4'} space-y-3`}>
      <h4 className="text-sm font-semibold">Histórico da OS</h4>
      <ul className="space-y-2">
        {ordenados.map((evento) => (
          <li key={evento.id} className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-sm">
            <p className="font-medium">{evento.titulo}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatarData(evento.data_hora.slice(0, 10))}
              {evento.data_hora.length > 10
                ? ` ${evento.data_hora.slice(11, 16)}`
                : ''}
              {evento.usuario_nome ? ` · ${evento.usuario_nome}` : ''}
              {evento.autorizado_pin ? ' · via PIN' : ''}
            </p>
            {evento.campo &&
              evento.valor_anterior != null &&
              evento.valor_novo != null &&
              evento.valor_anterior !== evento.valor_novo && (
                <p className="text-xs text-muted-foreground mt-1">
                  {evento.campo}: {formatarMoeda(evento.valor_anterior)} →{' '}
                  {formatarMoeda(evento.valor_novo)}
                </p>
              )}
            {evento.detalhe && (
              <p className="text-xs text-muted-foreground mt-1">{evento.detalhe}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
