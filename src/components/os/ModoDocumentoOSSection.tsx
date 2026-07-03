import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import type { ModoDocumentoOS } from '@/lib/os-modo-documento'
import { getDataLocalHoje } from '@/lib/data-local'

interface ModoDocumentoOSSectionProps {
  modo: ModoDocumentoOS
  onChange: (modo: ModoDocumentoOS) => void
  desabilitado?: boolean
}

export function ModoDocumentoOSSection({
  modo,
  onChange,
  desabilitado = false,
}: ModoDocumentoOSSectionProps) {
  return (
    <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">Tipo de documento</h4>
          <p className="text-xs text-muted-foreground">
            Orçamento não entra no fluxo operacional nem no faturamento até ser convertido em OS.
          </p>
        </div>
        {modo === 'orcamento' && (
          <Badge variant="secondary" className="shrink-0">
            Orçamento
          </Badge>
        )}
      </div>
      <div className="grid gap-2 max-w-xs">
        <Label htmlFor="modo-documento-os">Registrar como</Label>
        <Select
          value={modo}
          onValueChange={(v) => onChange(v as ModoDocumentoOS)}
          disabled={desabilitado}
        >
          <SelectTrigger id="modo-documento-os">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="os">Ordem de Serviço</SelectItem>
            <SelectItem value="orcamento">Orçamento</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

export function aplicarModoDocumentoNoForm<T extends {
  modo_documento?: ModoDocumentoOS
  status: import('@/types/enums').StatusOS
  status_orcamento?: import('@/types/enums').StatusOrcamento
  data_orcamento?: string
}>(form: T, modo: ModoDocumentoOS): T {
  if (modo === 'orcamento') {
    return {
      ...form,
      modo_documento: 'orcamento',
      status: 'aguardando_aprovacao',
      status_orcamento: 'aguardando_aprovacao',
      data_orcamento: form.data_orcamento ?? getDataLocalHoje(),
    }
  }
  return {
    ...form,
    modo_documento: 'os',
    status: form.status === 'aguardando_aprovacao' ? 'recebida' : form.status,
    status_orcamento: undefined,
    data_orcamento: undefined,
  }
}
