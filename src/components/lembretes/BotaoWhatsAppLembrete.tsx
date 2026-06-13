import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useLembretes } from '@/context/LembretesContext'
import { abrirWhatsAppWeb } from '@/services/comunicacao/whatsapp.service'
import { formatarData } from '@/lib/utils'
import type { Cliente, Moto } from '@/types'
import type { LembreteComStatus } from '@/types/lembrete'
import { cn } from '@/lib/utils'

interface BotaoWhatsAppLembreteProps {
  lembrete: LembreteComStatus
  cliente: Cliente
  moto: Moto
  variant?: 'icon' | 'sm'
  className?: string
}

export function BotaoWhatsAppLembrete({
  lembrete,
  cliente,
  moto,
  variant = 'sm',
  className,
}: BotaoWhatsAppLembreteProps) {
  const { marcarContatado } = useLembretes()
  const [dialogAberto, setDialogAberto] = useState(false)
  const [registrarContato, setRegistrarContato] = useState(true)
  const [observacao, setObservacao] = useState('')

  const desabilitado = lembrete.status === 'contatado' || lembrete.status === 'cancelado'

  function handleEnviar() {
    if (!cliente.telefone?.trim()) {
      window.alert('Cliente sem telefone cadastrado.')
      return
    }
    try {
      abrirWhatsAppWeb(cliente.telefone, lembrete.mensagem)
      if (registrarContato) {
        marcarContatado(lembrete.id, {
          tipo: 'whatsapp_manual',
          servico: lembrete.servico,
          observacao: observacao.trim() || undefined,
        })
      }
      setDialogAberto(false)
      setObservacao('')
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Não foi possível abrir o WhatsApp.')
    }
  }

  if (desabilitado) return null

  return (
    <>
      {variant === 'icon' ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDialogAberto(true)}
          title="Enviar WhatsApp"
          className={cn('text-emerald-400 hover:text-emerald-300', className)}
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDialogAberto(true)}
          className={cn('gap-2 text-emerald-400 border-emerald-500/30', className)}
        >
          <MessageCircle className="h-4 w-4" />
          Enviar WhatsApp
        </Button>
      )}

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Lembrete — Enviar WhatsApp</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
              <p className="font-medium">{cliente.nome}</p>
              <p className="text-muted-foreground">{cliente.telefone}</p>
              <p className="mt-1 text-muted-foreground">
                {moto.marca} {moto.modelo} · {moto.placa}
              </p>
              <p className="mt-1 text-muted-foreground">
                {lembrete.servico} · previsto {formatarData(lembrete.data_prevista)}
              </p>
            </div>

            <div className="grid gap-2">
              <Label>Mensagem</Label>
              <Textarea value={lembrete.mensagem} readOnly rows={8} className="resize-none text-sm" />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="registrar-contato"
                type="checkbox"
                checked={registrarContato}
                onChange={(e) => setRegistrarContato(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <Label htmlFor="registrar-contato" className="cursor-pointer font-normal">
                Registrar como contatado após abrir WhatsApp
              </Label>
            </div>

            {registrarContato && (
              <div className="grid gap-2">
                <Label>Observação (opcional)</Label>
                <Textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  rows={2}
                  placeholder="Ex.: Cliente vai agendar na próxima semana"
                />
              </div>
            )}

            <Button
              onClick={handleEnviar}
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-500"
            >
              <MessageCircle className="h-4 w-4" />
              Abrir WhatsApp Web
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
