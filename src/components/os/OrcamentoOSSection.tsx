import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
  dataOrcamento?: string
  statusOrcamento?: StatusOrcamento
  observacoesOrcamento?: string
  onChange: (dados: {
    data_orcamento?: string
    status_orcamento?: StatusOrcamento
    observacoes_orcamento?: string
  }) => void
}

export function OrcamentoOSSection({
  dataOrcamento,
  statusOrcamento,
  observacoesOrcamento,
  onChange,
}: OrcamentoOSSectionProps) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/10 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">Aprovação de Orçamento</h4>
          <p className="text-xs text-muted-foreground">
            Controle de aprovação — o total financeiro é calculado nos valores reais abaixo
          </p>
        </div>
        {statusOrcamento && <StatusOrcamentoBadge status={statusOrcamento} />}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="data-orcamento">Data do orçamento</Label>
          <Input
            id="data-orcamento"
            type="date"
            value={dataOrcamento ?? ''}
            onChange={(e) =>
              onChange({
                data_orcamento: e.target.value || undefined,
                status_orcamento: statusOrcamento,
                observacoes_orcamento: observacoesOrcamento,
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
                data_orcamento: dataOrcamento,
                status_orcamento: v as StatusOrcamento,
                observacoes_orcamento: observacoesOrcamento,
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
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="obs-orcamento">Observações do orçamento</Label>
          <Textarea
            id="obs-orcamento"
            rows={2}
            value={observacoesOrcamento ?? ''}
            placeholder="Ex.: aguardando retorno do cliente por WhatsApp"
            onChange={(e) =>
              onChange({
                data_orcamento: dataOrcamento,
                status_orcamento: statusOrcamento,
                observacoes_orcamento: e.target.value || undefined,
              })
            }
          />
        </div>
      </div>
    </div>
  )
}
