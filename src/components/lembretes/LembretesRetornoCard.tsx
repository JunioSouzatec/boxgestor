import { Link } from 'react-router-dom'
import { Bell, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useLembretes } from '@/context/LembretesContext'
import { useOficinaData } from '@/context/CraftContext'
import { formatarData } from '@/lib/utils'

export function LembretesRetornoCard() {
  const { resumo } = useLembretes()
  const { clientes } = useOficinaData()

  const getClienteNome = (id: string) => clientes.find((c) => c.id === id)?.nome ?? '—'

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-5 w-5 text-primary" />
              Lembretes de Retorno
            </CardTitle>
            <CardDescription>Revisões e retornos programados</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild className="shrink-0">
            <Link to="/lembretes">
              Ver todos
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-2xl font-bold text-destructive">{resumo.vencidos.length}</p>
            <p className="text-xs text-muted-foreground">Vencidos</p>
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-2xl font-bold text-amber-400">{resumo.proximos7Dias.length}</p>
            <p className="text-xs text-muted-foreground">Próximos 7 dias</p>
          </div>
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <p className="text-2xl font-bold text-emerald-400">{resumo.contatarHoje.length}</p>
            <p className="text-xs text-muted-foreground">Contatar hoje</p>
          </div>
        </div>

        {resumo.contatarHoje.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Prioridade hoje
            </p>
            {resumo.contatarHoje.slice(0, 4).map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm"
              >
                <div className="min-w-0 truncate">
                  <span className="font-medium">{getClienteNome(l.cliente_id)}</span>
                  <span className="text-muted-foreground"> · {l.servico}</span>
                </div>
                <Badge
                  variant="outline"
                  className={
                    l.status === 'vencido'
                      ? 'border-destructive/40 text-destructive shrink-0'
                      : 'border-amber-500/40 text-amber-400 shrink-0'
                  }
                >
                  {l.status === 'vencido' ? 'Vencido' : formatarData(l.data_prevista)}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {resumo.totalPendentes === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            Nenhum lembrete pendente. Finalize uma OS para criar lembretes automáticos.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
