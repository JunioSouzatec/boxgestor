import { useState } from 'react'
import { Copy, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RegistrarContatoLembreteDialog } from '@/components/lembretes/RegistrarContatoLembreteDialog'
import { useLembretes } from '@/context/LembretesContext'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { abrirWhatsAppWeb } from '@/services/comunicacao/whatsapp.service'
import { formatarData } from '@/lib/utils'
import type { Cliente, Moto } from '@/types'
import type { LembreteComStatus } from '@/types/lembrete'
import { lembreteStatusEncerrado } from '@/types/lembrete'
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
  const { session } = useAuth()
  const { toast } = useToast()
  const [dialogAberto, setDialogAberto] = useState(false)
  const [dialogRegistrar, setDialogRegistrar] = useState(false)
  const [registrarContato, setRegistrarContato] = useState(true)

  const desabilitado = lembreteStatusEncerrado(lembrete.status)

  async function copiarMensagem() {
    try {
      await navigator.clipboard.writeText(lembrete.mensagem)
      toast.sucesso('Mensagem copiada.')
    } catch {
      toast.erro('Não foi possível copiar a mensagem.')
    }
  }

  function handleAbrirWhatsApp() {
    if (!cliente.telefone?.trim()) {
      window.alert('Cliente sem telefone cadastrado.')
      return
    }
    try {
      abrirWhatsAppWeb(cliente.telefone, lembrete.mensagem)
      if (registrarContato) {
        const responsavel = session?.user?.nome?.trim() || 'Usuário'
        marcarContatado(
          lembrete.id,
          {
            tipo: 'whatsapp_manual',
            servico: lembrete.servico,
            observacao: 'Enviado via WhatsApp Web',
          },
          responsavel
        )
        toast.sucesso('Lembrete registrado como enviado.')
      }
      setDialogAberto(false)
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
          title="WhatsApp / mensagem"
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
          WhatsApp
        </Button>
      )}

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Lembrete — Mensagem para o cliente</DialogTitle>
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
              <Label>Mensagem pronta</Label>
              <Textarea value={lembrete.mensagem} readOnly rows={8} className="resize-none text-sm" />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => void copiarMensagem()}>
                <Copy className="h-4 w-4" />
                Copiar mensagem
              </Button>
              <Button
                size="sm"
                className="gap-2 bg-emerald-600 hover:bg-emerald-500"
                onClick={handleAbrirWhatsApp}
              >
                <MessageCircle className="h-4 w-4" />
                Abrir WhatsApp
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setDialogRegistrar(true)}>
                Registrar como enviado
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="registrar-contato-wa"
                type="checkbox"
                checked={registrarContato}
                onChange={(e) => setRegistrarContato(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <Label htmlFor="registrar-contato-wa" className="cursor-pointer font-normal">
                Registrar automaticamente ao abrir WhatsApp
              </Label>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <RegistrarContatoLembreteDialog
        lembrete={lembrete}
        aberto={dialogRegistrar}
        onFechar={() => {
          setDialogRegistrar(false)
          setDialogAberto(false)
        }}
        mensagemInicial={lembrete.mensagem}
        canalInicial="whatsapp"
        resultadoInicial="enviado"
      />
    </>
  )
}
