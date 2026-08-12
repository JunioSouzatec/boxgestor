import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import type { PreviaClienteOrcamento } from '@/services/orcamento/aprovacao-cliente.service'
import { formatarData } from '@/lib/utils'

interface PreviaClienteOrcamentoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  previa: PreviaClienteOrcamento | null
}

export function PreviaClienteOrcamentoDialog({
  open,
  onOpenChange,
  previa,
}: PreviaClienteOrcamentoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-0 w-[min(100vw,36rem)] max-w-[min(100vw,36rem)] overflow-x-hidden lg:max-w-xl">
        <DialogHeader className="min-w-0 pr-6">
          <DialogTitle>Prévia do cliente</DialogTitle>
          <DialogDescription>
            Visualização do que o cliente veria. Link público real ainda não está ativo.
          </DialogDescription>
        </DialogHeader>

        {!previa ? (
          <p className="text-sm text-muted-foreground">Sem dados para prévia.</p>
        ) : (
          <div className="min-w-0 max-w-full space-y-4 overflow-x-hidden rounded-lg border border-border bg-background p-3 sm:p-4">
            <div className="flex min-w-0 items-center gap-3">
              {previa.oficinaLogoUrl ? (
                <img
                  src={previa.oficinaLogoUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded object-contain"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="break-words text-base font-semibold">{previa.oficinaNome}</p>
                <p className="text-xs text-muted-foreground">Orçamento #{previa.numero}</p>
              </div>
            </div>

            <div className="min-w-0 space-y-1 break-words text-sm">
              <p>
                <span className="text-muted-foreground">Cliente:</span> {previa.clienteNome}
              </p>
              <p>
                <span className="text-muted-foreground">Veículo:</span> {previa.veiculo}
                {previa.placa ? ` · ${previa.placa}` : ''}
              </p>
              {previa.validade ? (
                <p>
                  <span className="text-muted-foreground">Validade:</span>{' '}
                  {formatarData(previa.validade)}
                </p>
              ) : null}
            </div>

            {previa.servicos.length > 0 ? (
              <div className="min-w-0">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Serviços
                </p>
                <ul className="space-y-2 text-sm">
                  {previa.servicos.map((s, i) => (
                    <li
                      key={`${s.nome}-${i}`}
                      className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
                    >
                      <span className="min-w-0 flex-1 break-words">{s.nome}</span>
                      <span className="shrink-0 font-medium tabular-nums sm:text-right">
                        {s.valorLabel}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {previa.pecas.length > 0 ? (
              <div className="min-w-0">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Peças
                </p>
                <ul className="space-y-2 text-sm">
                  {previa.pecas.map((p, i) => (
                    <li
                      key={`${p.linha}-${i}`}
                      className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
                    >
                      <span className="min-w-0 flex-1 break-words">{p.linha}</span>
                      <span className="shrink-0 font-medium tabular-nums sm:text-right">
                        {p.subtotalLabel}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="min-w-0 space-y-1 border-t border-border pt-3 text-sm">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="text-muted-foreground">Desconto</span>
                <span className="shrink-0 tabular-nums">{previa.descontoLabel}</span>
              </div>
              <div className="flex min-w-0 items-center justify-between gap-3 text-base font-semibold">
                <span>Total</span>
                <span className="shrink-0 tabular-nums">{previa.totalLabel}</span>
              </div>
            </div>

            {previa.observacoes ? (
              <p className="min-w-0 break-words text-sm text-foreground/80">
                <span className="font-medium">Observações: </span>
                {previa.observacoes}
              </p>
            ) : null}

            <Badge
              variant="outline"
              className="h-auto max-w-full whitespace-normal break-words text-left font-normal"
            >
              {previa.aviso}
            </Badge>

            <div className="flex min-w-0 flex-col gap-2 opacity-60 sm:flex-row">
              <div className="flex-1 rounded-md bg-primary/20 px-3 py-2 text-center text-sm font-medium text-primary">
                Aprovar orçamento
              </div>
              <div className="flex-1 rounded-md border border-border px-3 py-2 text-center text-sm text-muted-foreground">
                Recusar
              </div>
            </div>
            <p className="break-words text-[11px] text-muted-foreground">
              Botões ilustrativos — ação pública do cliente ainda não está habilitada.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
