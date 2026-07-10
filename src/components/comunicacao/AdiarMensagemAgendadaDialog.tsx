import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatarDataLocalYYYYMMDD } from '@/lib/data-local'
import type { MensagemAgendadaComStatus } from '@/types/mensagem-agendada'

interface AdiarMensagemAgendadaDialogProps {
  mensagem: MensagemAgendadaComStatus | null
  aberto: boolean
  onFechar: () => void
  onConfirmar: (id: string, data: string, hora: string) => void
}

function extrairHoraLocal(iso: string): string {
  const d = new Date(iso)
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${min}`
}

export function AdiarMensagemAgendadaDialog({
  mensagem,
  aberto,
  onFechar,
  onConfirmar,
}: AdiarMensagemAgendadaDialogProps) {
  const [data, setData] = useState('')
  const [hora, setHora] = useState('09:00')

  useEffect(() => {
    if (!mensagem) return
    const amanha = new Date()
    amanha.setDate(amanha.getDate() + 1)
    setData(formatarDataLocalYYYYMMDD(amanha))
    setHora(extrairHoraLocal(mensagem.agendado_para))
  }, [mensagem])

  if (!mensagem) return null

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adiar mensagem</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Reagendar envio para <strong>{mensagem.cliente_nome}</strong>. O status permanece pendente.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="adiar-msg-data">Nova data</Label>
            <Input
              id="adiar-msg-data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="adiar-msg-hora">Horário</Label>
            <Input
              id="adiar-msg-hora"
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (data && hora) {
                onConfirmar(mensagem.id, data, hora)
                onFechar()
              }
            }}
            disabled={!data || !hora}
          >
            Adiar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
