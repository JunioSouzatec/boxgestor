import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { atualizarItemChecklist } from '@/lib/os'
import { cn } from '@/lib/utils'
import type { ChecklistEntrada, ChaveItemChecklist } from '@/types'
import { ITENS_CHECKLIST_ENTRADA } from '@/types'

interface ChecklistEntradaFormProps {
  value: ChecklistEntrada
  onChange: (checklist: ChecklistEntrada) => void
}

export function ChecklistEntradaForm({ value, onChange }: ChecklistEntradaFormProps) {
  function toggleItem(chave: ChaveItemChecklist) {
    const item = value.itens.find((i) => i.chave === chave)
    onChange(atualizarItemChecklist(value, chave, { ok: !item?.ok }))
  }

  function alterarObservacaoItem(chave: ChaveItemChecklist, observacao: string) {
    onChange(atualizarItemChecklist(value, chave, { observacao: observacao || undefined }))
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/10 p-4">
      <div>
        <h4 className="text-sm font-semibold">Checklist de Entrada</h4>
        <p className="text-xs text-muted-foreground">
          Marque os itens verificados na recepção da moto
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {ITENS_CHECKLIST_ENTRADA.map(({ chave, label }) => {
          const item = value.itens.find((i) => i.chave === chave)
          const marcado = item?.ok ?? false

          return (
            <div
              key={chave}
              className={cn(
                'rounded-lg border p-3 transition-colors',
                marcado ? 'border-emerald-800/40 bg-emerald-950/20' : 'border-border'
              )}
            >
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => toggleItem(chave)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <span className="text-sm font-medium">{label}</span>
              </label>
              <Input
                placeholder="Observação (opcional)"
                value={item?.observacao ?? ''}
                onChange={(e) => alterarObservacaoItem(chave, e.target.value)}
                className="mt-2 h-8 text-xs"
              />
            </div>
          )
        })}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="checklist-obs">Observações gerais</Label>
        <Textarea
          id="checklist-obs"
          value={value.observacoes_gerais ?? ''}
          onChange={(e) => onChange({ ...value, observacoes_gerais: e.target.value })}
          placeholder="Avarias, detalhes da entrega, etc."
          rows={2}
        />
      </div>
    </div>
  )
}
