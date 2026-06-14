import { CalendarDays } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface DatasCicloOSSectionProps {
  dataEntrada: string
  dataPrevisao?: string
  dataSaida?: string
  onChange: (patch: {
    data_entrada?: string
    data_previsao?: string
    data_saida?: string
  }) => void
}

export function DatasCicloOSSection({
  dataEntrada,
  dataPrevisao,
  dataSaida,
  onChange,
}: DatasCicloOSSectionProps) {
  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4 sm:col-span-2">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-primary" />
        <Label className="text-base font-medium">Datas da moto na oficina</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Registre quando a moto entrou, a previsão de entrega e quando saiu.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1">
          <Label htmlFor="os-data-entrada">Data de entrada</Label>
          <Input
            id="os-data-entrada"
            type="date"
            value={dataEntrada}
            onChange={(e) => onChange({ data_entrada: e.target.value })}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="os-data-previsao">Previsão de entrega</Label>
          <Input
            id="os-data-previsao"
            type="date"
            value={dataPrevisao ?? ''}
            onChange={(e) =>
              onChange({ data_previsao: e.target.value || undefined })
            }
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="os-data-saida">Data de saída</Label>
          <Input
            id="os-data-saida"
            type="date"
            value={dataSaida ?? ''}
            onChange={(e) => onChange({ data_saida: e.target.value || undefined })}
          />
        </div>
      </div>
    </div>
  )
}
