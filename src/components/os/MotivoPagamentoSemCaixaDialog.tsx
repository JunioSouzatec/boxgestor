import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface MotivoPagamentoSemCaixaDialogProps {
  aberto: boolean
  onConfirmar: (motivo: string) => void
  onCancelar: () => void
  salvando?: boolean
}

export function MotivoPagamentoSemCaixaDialog({
  aberto,
  onConfirmar,
  onCancelar,
  salvando = false,
}: MotivoPagamentoSemCaixaDialogProps) {
  const [motivo, setMotivo] = useState('')

  useEffect(() => {
    if (aberto) setMotivo('')
  }, [aberto])

  return (
    <Dialog
      open={aberto}
      onOpenChange={(open) => {
        if (!open) onCancelar()
      }}
    >
      <DialogContent className="max-w-md" prioridadeAlta>
        <DialogHeader>
          <DialogTitle>Registrar pagamento sem caixa aberto</DialogTitle>
          <DialogDescription>
            Informe o motivo da autorização. O pagamento será registrado e a autorização
            ficará na auditoria do caixa.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="motivo-sem-caixa">Motivo *</Label>
          <Textarea
            id="motivo-sem-caixa"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ex.: atendimento urgente fora do expediente"
            disabled={salvando}
          />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onCancelar} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            disabled={salvando || !motivo.trim()}
            onClick={() => onConfirmar(motivo.trim())}
          >
            Autorizar e registrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
