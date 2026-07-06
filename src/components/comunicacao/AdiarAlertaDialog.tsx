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
import type { AlertaComunicacao } from '@/types/alerta-comunicacao'

interface AdiarAlertaDialogProps {
  alerta: AlertaComunicacao | null
  aberto: boolean
  onFechar: () => void
  onConfirmar: (id: string, data: string) => void
}

export function AdiarAlertaDialog({ alerta, aberto, onFechar, onConfirmar }: AdiarAlertaDialogProps) {
  const [data, setData] = useState('')

  useEffect(() => {
    if (alerta) {
      const amanha = new Date()
      amanha.setDate(amanha.getDate() + 1)
      setData(formatarDataLocalYYYYMMDD(amanha))
    }
  }, [alerta])

  if (!alerta) return null

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adiar alerta</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          O alerta de <strong>{alerta.cliente_nome}</strong> ficará oculto até a nova data.
        </p>
        <div className="grid gap-2">
          <Label htmlFor="adiar-data">Mostrar novamente em</Label>
          <Input
            id="adiar-data"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (data) {
                onConfirmar(alerta.id, data)
                onFechar()
              }
            }}
            disabled={!data}
          >
            Adiar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
