import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { getLabelTipoMensagem, type HistoricoContato } from '@/types/comunicacao'

const MSG_NAO_REGISTRADA = 'Mensagem não registrada neste envio.'

interface HistoricoContatoMensagemDialogProps {
  item: HistoricoContato | null
  aberto: boolean
  onFechar: () => void
}

function formatarDataHora(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))
}

export function HistoricoContatoMensagemDialog({
  item,
  aberto,
  onFechar,
}: HistoricoContatoMensagemDialogProps) {
  if (!item) return null

  const texto = item.mensagem_texto?.trim()

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mensagem enviada</DialogTitle>
          <DialogDescription>
            Conteúdo registrado no histórico de comunicação
          </DialogDescription>
        </DialogHeader>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Data</dt>
            <dd className="font-medium">{formatarDataHora(item.data)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Cliente</dt>
            <dd className="font-medium">{item.cliente_nome}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tipo</dt>
            <dd>{getLabelTipoMensagem(item.tipo_mensagem)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">OS</dt>
            <dd>{item.ordem_servico_numero ? `#${item.ordem_servico_numero}` : '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
                Enviado manualmente
              </Badge>
            </dd>
          </div>
          {item.responsavel_nome && (
            <div>
              <dt className="text-muted-foreground">Responsável</dt>
              <dd>{item.responsavel_nome}</dd>
            </div>
          )}
        </dl>

        <div className="mt-2">
          <p className="mb-2 text-sm font-medium text-muted-foreground">Texto da mensagem</p>
          <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm whitespace-pre-wrap break-words">
            {texto || (
              <span className="text-muted-foreground italic">{MSG_NAO_REGISTRADA}</span>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export { MSG_NAO_REGISTRADA }
