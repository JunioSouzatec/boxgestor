import { Calendar, Clock, Pencil, Trash2, Wrench } from 'lucide-react'
import { StatusAgendamentoBadge } from '@/components/shared/StatusBadges'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { obterNumeroOSAgendamento } from '@/lib/agendamento'
import { formatarData } from '@/lib/utils'
import type { Agendamento, Cliente, Moto, OrdemServico } from '@/types'

interface AgendamentosDiaPanelProps {
  data: string
  agendamentos: Agendamento[]
  clientes: Cliente[]
  motos: Moto[]
  ordens: OrdemServico[]
  onEditar?: (agendamento: Agendamento) => void
  onExcluir?: (agendamento: Agendamento) => void
}

export function AgendamentosDiaPanel({
  data,
  agendamentos,
  clientes,
  motos,
  ordens,
  onEditar,
  onExcluir,
}: AgendamentosDiaPanelProps) {
  const getClienteNome = (id: string) => clientes.find((c) => c.id === id)?.nome ?? '—'
  const getMotoLabel = (id: string) => {
    const m = motos.find((mo) => mo.id === id)
    return m ? `${m.marca} ${m.modelo} (${m.placa})` : '—'
  }

  const doDia = agendamentos
    .filter((a) => a.data === data)
    .sort((a, b) => a.horario.localeCompare(b.horario))

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="h-4 w-4 text-primary" />
          {formatarData(data)}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {doDia.length === 0
            ? 'Nenhum serviço agendado'
            : `${doDia.length} agendamento${doDia.length > 1 ? 's' : ''}`}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {doDia.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
            <Calendar className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Selecione outro dia ou crie um agendamento.</p>
          </div>
        ) : (
          doDia.map((ag) => {
            const numeroOS = obterNumeroOSAgendamento(ag, ordens)

            return (
              <div
                key={ag.id}
                className="rounded-lg border border-border bg-muted/20 p-4 transition-colors hover:border-zinc-600"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <Clock className="h-4 w-4" />
                    {ag.horario}
                  </div>
                  <StatusAgendamentoBadge status={ag.status} />
                </div>

                <div className="mt-3 space-y-1.5 text-sm">
                  <p>
                    <span className="text-muted-foreground">Cliente: </span>
                    {getClienteNome(ag.cliente_id)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Moto: </span>
                    {getMotoLabel(ag.moto_id)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Serviço: </span>
                    {ag.servico}
                  </p>
                  {numeroOS !== null && (
                    <p className="flex items-center gap-1.5">
                      <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">OS: </span>
                      <span className="font-medium text-primary">#{numeroOS}</span>
                    </p>
                  )}
                </div>

                {(onEditar || onExcluir) && (
                  <div className="mt-3 flex justify-end gap-1 border-t border-border pt-3">
                    {onEditar && (
                      <Button variant="ghost" size="sm" onClick={() => onEditar(ag)}>
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </Button>
                    )}
                    {onExcluir && (
                      <Button variant="ghost" size="sm" onClick={() => onExcluir(ag)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        Excluir
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
