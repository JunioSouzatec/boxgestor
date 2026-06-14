import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatarData } from '@/lib/utils'
import {
  getLabelPeriodoDashboard,
  type PeriodoDashboardPreset,
} from '@/services/dashboard-metrics.service'

const PRESETS: PeriodoDashboardPreset[] = ['hoje', 'semana', 'mes', 'mes_passado', 'personalizado']

interface DashboardPeriodoFiltroProps {
  preset: PeriodoDashboardPreset
  onPresetChange: (preset: PeriodoDashboardPreset) => void
  dataInicio: string
  dataFim: string
  onDataInicioChange: (v: string) => void
  onDataFimChange: (v: string) => void
  intervaloLabel: string
  intervaloInicio: string
  intervaloFim: string
}

export function DashboardPeriodoFiltro({
  preset,
  onPresetChange,
  dataInicio,
  dataFim,
  onDataInicioChange,
  onDataFimChange,
  intervaloLabel,
  intervaloInicio,
  intervaloFim,
}: DashboardPeriodoFiltroProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p}
            type="button"
            variant={preset === p ? 'default' : 'outline'}
            size="sm"
            onClick={() => onPresetChange(p)}
          >
            {getLabelPeriodoDashboard(p)}
          </Button>
        ))}
        <Badge variant="outline" className="ml-auto self-center">
          {intervaloLabel}: {formatarData(intervaloInicio)} — {formatarData(intervaloFim)}
        </Badge>
      </div>

      {preset === 'personalizado' && (
        <div className="flex flex-wrap items-end gap-4 rounded-md border border-border bg-muted/10 p-3">
          <div className="space-y-1">
            <Label htmlFor="dash-data-inicio">De</Label>
            <Input
              id="dash-data-inicio"
              type="date"
              value={dataInicio}
              onChange={(e) => onDataInicioChange(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dash-data-fim">Até</Label>
            <Input
              id="dash-data-fim"
              type="date"
              value={dataFim}
              onChange={(e) => onDataFimChange(e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
