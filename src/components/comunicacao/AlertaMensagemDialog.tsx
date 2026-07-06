import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/context/ToastContext'
import { abrirWhatsAppWeb } from '@/services/comunicacao/whatsapp.service'
import type { AlertaComunicacao } from '@/types/alerta-comunicacao'
import { getLabelTipoAlertaComunicacao } from '@/types/alerta-comunicacao'
import { formatarData, formatarTelefone } from '@/lib/utils'
import { Copy, MessageCircle } from 'lucide-react'

interface AlertaMensagemDialogProps {
  alerta: AlertaComunicacao | null
  aberto: boolean
  onFechar: () => void
  onSalvarMensagem: (id: string, texto: string) => void
  onEnviarWhatsApp: (id: string, texto: string) => void
}

export function AlertaMensagemDialog({
  alerta,
  aberto,
  onFechar,
  onSalvarMensagem,
  onEnviarWhatsApp,
}: AlertaMensagemDialogProps) {
  const { toast } = useToast()
  const [texto, setTexto] = useState('')

  useEffect(() => {
    if (alerta) setTexto(alerta.message_text)
  }, [alerta])

  if (!alerta) return null

  function copiar() {
    void navigator.clipboard.writeText(texto).then(
      () => toast.sucesso('Mensagem copiada.'),
      () => toast.erro('Não foi possível copiar.')
    )
  }

  function enviarWhatsApp() {
    if (!alerta?.telefone?.trim()) {
      toast.erro('Cliente sem telefone cadastrado.')
      return
    }
    try {
      onSalvarMensagem(alerta.id, texto)
      abrirWhatsAppWeb(alerta.telefone, texto)
      onEnviarWhatsApp(alerta.id, texto)
      onFechar()
    } catch (err) {
      toast.erro(err instanceof Error ? err.message : 'Não foi possível abrir o WhatsApp.')
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="max-h-[90dvh] w-[min(95vw,520px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ver mensagem — {alerta.cliente_nome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
            <p className="font-medium">{getLabelTipoAlertaComunicacao(alerta.tipo)}</p>
            <p className="text-muted-foreground">{alerta.motivo}</p>
            {alerta.moto_descricao && (
              <p className="mt-1">
                {alerta.moto_descricao}
                {alerta.placa ? ` · ${alerta.placa}` : ''}
              </p>
            )}
            <p className="mt-1 text-muted-foreground">
              Previsto: {formatarData(alerta.due_date)}
              {alerta.telefone ? ` · ${formatarTelefone(alerta.telefone)}` : ''}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="alerta-mensagem">Mensagem sugerida (edite antes de enviar)</Label>
            <Textarea
              id="alerta-mensagem"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={10}
              className="resize-y text-sm"
            />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={copiar} className="gap-2">
            <Copy className="h-4 w-4" />
            Copiar
          </Button>
          <Button
            type="button"
            onClick={enviarWhatsApp}
            className="gap-2 bg-emerald-600 hover:bg-emerald-500"
            disabled={!texto.trim()}
          >
            <MessageCircle className="h-4 w-4" />
            Abrir WhatsApp
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
