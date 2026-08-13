import { AlertTriangle, Package, Shield, ClipboardCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { AlertaOficina } from '@/lib/analytics'

const icones = {
  orcamento: ClipboardCheck,
  peca: AlertTriangle,
  garantia: Shield,
  estoque: Package,
}

const severidadeClasses = {
  info: 'border-sky-500/30 bg-sky-950/35',
  warning: 'border-amber-500/30 bg-amber-950/35',
  success: 'border-emerald-500/30 bg-emerald-950/35',
}

const iconeSeveridade = {
  info: 'bg-sky-500/15 text-sky-400',
  warning: 'bg-amber-500/15 text-amber-400',
  success: 'bg-emerald-500/15 text-emerald-400',
}

interface AlertasOficinaProps {
  alertas: AlertaOficina[]
}

export function AlertasOficina({ alertas }: AlertasOficinaProps) {
  return (
    <Card className="border-zinc-700/50 bg-zinc-900/90 shadow-[0_1px_3px_rgba(0,0,0,0.35)]">
      <CardHeader>
        <CardTitle className="text-base text-zinc-50">Alertas da oficina</CardTitle>
      </CardHeader>
      <CardContent>
        {alertas.length === 0 ? (
          <p className="text-sm text-zinc-400">Nenhum alerta no momento.</p>
        ) : (
          <div className="space-y-2">
            {alertas.map((alerta) => {
              const Icone = icones[alerta.tipo]
              return (
                <div
                  key={alerta.id}
                  className={cn(
                    'flex min-w-0 items-start gap-3 rounded-xl border p-3',
                    severidadeClasses[alerta.severidade]
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 shrink-0 rounded-lg p-1.5',
                      iconeSeveridade[alerta.severidade]
                    )}
                  >
                    <Icone className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-zinc-50">
                      {alerta.titulo}
                    </p>
                    <p className="break-words text-xs text-zinc-400">{alerta.descricao}</p>
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
