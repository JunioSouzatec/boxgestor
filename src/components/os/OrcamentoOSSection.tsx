import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/shared/MoneyInput'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StatusOrcamentoBadge } from '@/components/shared/StatusBadges'
import type { StatusOrcamento } from '@/types'
import { STATUS_ORCAMENTO } from '@/types'

interface OrcamentoOSSectionProps {
  valorEstimado?: number
  dataOrcamento?: string
  statusOrcamento?: StatusOrcamento
  onChange: (dados: {
    valor_estimado?: number
    data_orcamento?: string
    status_orcamento?: StatusOrcamento
  }) => void
}

export function OrcamentoOSSection({
  valorEstimado,
  dataOrcamento,
  statusOrcamento,
  onChange,
}: OrcamentoOSSectionProps) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/10 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">Aprovação de Orçamento</h4>
          <p className="text-xs text-muted-foreground">Valores e status do orçamento enviado</p>
        </div>
        {statusOrcamento && <StatusOrcamentoBadge status={statusOrcamento} />}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="valor-estimado">Valor estimado</Label>
          <MoneyInput
            id="valor-estimado"
            value={valorEstimado ?? 0}
            onChange={(valor_estimado) =>
              onChange({
                valor_estimado: valor_estimado || undefined,
                data_orcamento: dataOrcamento,
                status_orcamento: statusOrcamento,
              })
            }
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="data-orcamento">Data do orçamento</Label>
          <Input
            id="data-orcamento"
            type="date"
            value={dataOrcamento ?? ''}
            onChange={(e) =>
              onChange({
                valor_estimado: valorEstimado,
                data_orcamento: e.target.value || undefined,
                status_orcamento: statusOrcamento,
              })
            }
          />
        </div>
        <div className="grid gap-2">
          <Label>Status do orçamento</Label>
          <Select
            value={statusOrcamento ?? ''}
            onValueChange={(v) =>
              onChange({
                valor_estimado: valorEstimado,
                data_orcamento: dataOrcamento,
                status_orcamento: v as StatusOrcamento,
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_ORCAMENTO.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
