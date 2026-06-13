import { Shield } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { calcularVencimentoGarantia, garantiaAtiva } from '@/lib/os'
import { formatarData } from '@/lib/utils'
import type { OrdemServico } from '@/types'

interface GarantiaOSSectionProps {
  status: OrdemServico['status']
  diasGarantia?: number
  dataVencimento?: string
  dataBase?: string
  onChange: (dados: { dias_garantia?: number; data_vencimento_garantia?: string }) => void
}

export function GarantiaOSSection({
  status,
  diasGarantia,
  dataVencimento,
  dataBase,
  onChange,
}: GarantiaOSSectionProps) {
  const podeDefinir = status === 'finalizada' || status === 'entregue'

  if (!podeDefinir) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        <Shield className="mb-2 h-4 w-4" />
        Garantia disponível ao finalizar ou entregar a OS.
      </div>
    )
  }

  const osParcial = {
    status,
    data_vencimento_garantia: dataVencimento,
  } as OrdemServico

  function alterarDias(dias: number) {
    const vencimento =
      dias > 0 && dataBase ? calcularVencimentoGarantia(dataBase, dias) : undefined
    onChange({ dias_garantia: dias || undefined, data_vencimento_garantia: vencimento })
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/10 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">Controle de Garantia</h4>
          <p className="text-xs text-muted-foreground">Defina o período de garantia do serviço</p>
        </div>
        {dataVencimento && garantiaAtiva(osParcial) && (
          <Badge variant="success" className="gap-1">
            <Shield className="h-3 w-3" />
            Em garantia
          </Badge>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="dias-garantia">Dias de garantia</Label>
          <Input
            id="dias-garantia"
            type="number"
            min={0}
            value={diasGarantia ?? ''}
            onChange={(e) => alterarDias(Number(e.target.value))}
            placeholder="Ex: 90"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="venc-garantia">Vencimento da garantia</Label>
          <Input
            id="venc-garantia"
            type="date"
            value={dataVencimento ?? ''}
            onChange={(e) =>
              onChange({
                dias_garantia: diasGarantia,
                data_vencimento_garantia: e.target.value || undefined,
              })
            }
          />
        </div>
      </div>
      {dataVencimento && (
        <p className="text-xs text-muted-foreground">
          Garantia válida até {formatarData(dataVencimento)}
        </p>
      )}
    </div>
  )
}
