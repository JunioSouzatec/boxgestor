import type { ReactNode } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { GarantiaOSSection } from '@/components/os/GarantiaOSSection'
import { MensagemCampoErro } from '@/components/shared/MensagemCampoErro'
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
import { RecursoPlanoGate } from '@/components/plano/RecursoPlanoGate'
import {
  CLASSE_CAMPO_INVALIDO,
  type ResultadoValidacaoOS,
  campoTemErro,
  obterMensagemErroCampo,
} from '@/lib/os-form-validation'
import { cn } from '@/lib/utils'
import type { OrdemServico, StatusOS } from '@/types'
import { STATUS_OS } from '@/types'

interface FechamentoOSSectionProps {
  form: Pick<
    OrdemServico,
    | 'status'
    | 'data_saida'
    | 'dias_garantia'
    | 'data_vencimento_garantia'
    | 'observacoes_garantia'
  >
  dataBaseGarantia?: string
  errosValidacao?: ResultadoValidacaoOS | null
  onMudarStatus: (status: StatusOS) => void
  onChange: (
    patch: Partial<
      Pick<
        OrdemServico,
        | 'data_saida'
        | 'dias_garantia'
        | 'data_vencimento_garantia'
        | 'observacoes_garantia'
      >
    >
  ) => void
  acoes?: ReactNode
}

export function FechamentoOSSection({
  form,
  dataBaseGarantia,
  errosValidacao,
  onMudarStatus,
  onChange,
  acoes,
}: FechamentoOSSectionProps) {
  return (
    <div className="space-y-4 rounded-lg border border-primary/25 bg-primary/5 p-4 sm:col-span-2">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-primary" />
        <h3 className="text-base font-medium">Fechamento da OS</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Defina o status final, data de saída, garantia e observações ao concluir o atendimento.
      </p>

      <div id="os-fechamento-status" className="grid gap-2">
        <Label>Status da OS *</Label>
        <Select value={form.status} onValueChange={(v) => onMudarStatus(v as StatusOS)}>
          <SelectTrigger
            id="os-campo-status"
            aria-invalid={campoTemErro(errosValidacao ?? null, 'status')}
            className={cn(
              campoTemErro(errosValidacao ?? null, 'status') && CLASSE_CAMPO_INVALIDO
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <MensagemCampoErro mensagem={obterMensagemErroCampo(errosValidacao ?? null, 'status')} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="os-fechamento-saida">Data de saída</Label>
        <Input
          id="os-fechamento-saida"
          type="date"
          value={form.data_saida ?? ''}
          onChange={(e) => onChange({ data_saida: e.target.value || undefined })}
        />
        <p className="text-xs text-muted-foreground">
          Preenchida automaticamente ao finalizar ou entregar, se estiver vazia.
        </p>
      </div>

      <RecursoPlanoGate recurso="garantia">
        <GarantiaOSSection
          status={form.status}
          diasGarantia={form.dias_garantia}
          dataVencimento={form.data_vencimento_garantia}
          dataBase={dataBaseGarantia}
          onChange={(gar) => onChange(gar)}
        />
      </RecursoPlanoGate>

      <div className="grid gap-2">
        <Label htmlFor="os-obs-finais">Observações finais</Label>
        <Textarea
          id="os-obs-finais"
          rows={3}
          value={form.observacoes_garantia ?? ''}
          onChange={(e) =>
            onChange({ observacoes_garantia: e.target.value.trim() || undefined })
          }
          placeholder="Observações sobre entrega, garantia ou fechamento (opcional)"
        />
      </div>

      {acoes && <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">{acoes}</div>}
    </div>
  )
}
