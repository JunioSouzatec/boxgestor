import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { OsDocumentoConteudo } from '@/components/os/OsDocumentoConteudo'
import { formatarFormaPagamentoHistorico } from '@/lib/pagamento-format'
import { formatarData, formatarMoeda } from '@/lib/utils'
import type { OsDocumentoViewModel } from '@/lib/os-documento'
import type { LancamentoFinanceiro } from '@/types'
import { FileDown, Loader2, Receipt, X } from 'lucide-react'

interface OsVisualizacaoDialogProps {
  aberto: boolean
  onFechar: () => void
  dados: OsDocumentoViewModel | null
  pagamentosRecibo?: LancamentoFinanceiro[]
  onExportarPdf?: () => void
  onGerarRecibo?: (pagamentoId: string) => void
  podeExportarPdf?: boolean
  podeGerarRecibo?: boolean
  exportandoPdf?: boolean
  gerandoRecibo?: boolean
}

export function OsVisualizacaoDialog({
  aberto,
  onFechar,
  dados,
  pagamentosRecibo = [],
  onExportarPdf,
  onGerarRecibo,
  podeExportarPdf,
  podeGerarRecibo,
  exportandoPdf,
  gerandoRecibo,
}: OsVisualizacaoDialogProps) {
  const pagamentosPagos = useMemo(
    () => pagamentosRecibo.filter((p) => p.pago),
    [pagamentosRecibo]
  )

  const [pagamentoSelecionadoId, setPagamentoSelecionadoId] = useState<string>('')

  useEffect(() => {
    if (!aberto) return
    setPagamentoSelecionadoId(pagamentosPagos[0]?.id ?? '')
  }, [aberto, pagamentosPagos])

  if (!dados) return null

  const reciboDisponivel = podeGerarRecibo && pagamentosPagos.length > 0

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border bg-background px-6 py-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <DialogTitle>Ordem de Serviço #{dados.os.numero}</DialogTitle>
              <div className="flex flex-wrap gap-2">
                {podeExportarPdf && onExportarPdf && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={onExportarPdf}
                    disabled={exportandoPdf || gerandoRecibo}
                  >
                    {exportandoPdf ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileDown className="h-4 w-4" />
                    )}
                    {exportandoPdf ? 'Gerando PDF...' : 'Exportar OS em PDF'}
                  </Button>
                )}
                {podeGerarRecibo && onGerarRecibo && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => pagamentoSelecionadoId && onGerarRecibo(pagamentoSelecionadoId)}
                    disabled={!reciboDisponivel || gerandoRecibo || exportandoPdf}
                    title={
                      reciboDisponivel
                        ? 'Baixar recibo em PDF'
                        : 'Registre um pagamento recebido para gerar o recibo'
                    }
                  >
                    {gerandoRecibo ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Receipt className="h-4 w-4" />
                    )}
                    {gerandoRecibo ? 'Gerando recibo...' : 'Gerar Recibo'}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={onFechar}>
                  <X className="h-4 w-4" />
                  Fechar
                </Button>
              </div>
            </div>

            {podeGerarRecibo && pagamentosPagos.length > 1 && (
              <div className="grid max-w-md gap-2">
                <Label htmlFor="recibo-pagamento">Pagamento para o recibo</Label>
                <Select value={pagamentoSelecionadoId} onValueChange={setPagamentoSelecionadoId}>
                  <SelectTrigger id="recibo-pagamento">
                    <SelectValue placeholder="Selecione o pagamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {pagamentosPagos.map((pagamento) => (
                      <SelectItem key={pagamento.id} value={pagamento.id}>
                        {formatarData(pagamento.data)} — {formatarMoeda(pagamento.valor)} —{' '}
                        {formatarFormaPagamentoHistorico(pagamento)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {podeGerarRecibo && pagamentosPagos.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum pagamento recebido nesta OS. Registre um pagamento para gerar o recibo.
              </p>
            )}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-100 p-6">
          <div className="mx-auto max-w-3xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <OsDocumentoConteudo dados={dados} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
