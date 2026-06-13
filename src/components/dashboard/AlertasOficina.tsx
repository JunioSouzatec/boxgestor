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
  info: 'border-blue-800/30 bg-blue-950/20',
  warning: 'border-amber-800/30 bg-amber-950/20',
  success: 'border-emerald-800/30 bg-emerald-950/20',
}

interface AlertasOficinaProps {
  alertas: AlertaOficina[]
}

export function AlertasOficina({ alertas }: AlertasOficinaProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Alertas da oficina</CardTitle>
      </CardHeader>
      <CardContent>
        {alertas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum alerta no momento.</p>
        ) : (
          <div className="space-y-2">
            {alertas.map((alerta) => {
              const Icone = icones[alerta.tipo]
              return (
                <div
                  key={alerta.id}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-3',
                    severidadeClasses[alerta.severidade]
                  )}
                >
                  <Icone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{alerta.titulo}</p>
                    <p className="text-xs text-muted-foreground">{alerta.descricao}</p>
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
