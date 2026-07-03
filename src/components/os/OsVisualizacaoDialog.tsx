import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { OsDocumentoConteudo } from '@/components/os/OsDocumentoConteudo'
import { BotaoEnviarWhatsAppOs } from '@/components/os/BotaoEnviarWhatsAppOs'
import { ComunicacaoRelacionadaOsSection } from '@/components/lembretes/ComunicacaoRelacionadaOsSection'
import { formatarFormaPagamentoHistorico } from '@/lib/pagamento-format'
import { formatarData, formatarMoeda } from '@/lib/utils'
import type { OsDocumentoViewModel } from '@/lib/os-documento'
import type { Cliente, LancamentoFinanceiro, Moto, OrdemServico } from '@/types'
import { FileDown, Loader2, Maximize2, Pencil, Receipt, X } from 'lucide-react'

interface OsVisualizacaoDialogProps {
  aberto: boolean
  onFechar: () => void
  dados: OsDocumentoViewModel | null
  ordemServicoId?: string
  pagamentosRecibo?: LancamentoFinanceiro[]
  onExportarPdf?: () => void
  onGerarRecibo?: (pagamentoId: string) => void
  onEditar?: () => void
  onConverterOrcamento?: () => void
  onAbrirTelaCheia?: () => void
  exibirFinanceiro?: boolean
  podeExportarPdf?: boolean
  podeGerarRecibo?: boolean
  exportandoPdf?: boolean
  gerandoRecibo?: boolean
  os?: OrdemServico
  cliente?: Cliente
  moto?: Moto
}

export function OsVisualizacaoDialog({
  aberto,
  onFechar,
  dados,
  ordemServicoId,
  pagamentosRecibo = [],
  onExportarPdf,
  onGerarRecibo,
  onEditar,
  onConverterOrcamento,
  onAbrirTelaCheia,
  exibirFinanceiro = true,
  podeExportarPdf,
  podeGerarRecibo,
  exportandoPdf,
  gerandoRecibo,
  os,
  cliente,
  moto,
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

  const ehOrcamento = dados.os.ehOrcamento
  const reciboDisponivel = !ehOrcamento && podeGerarRecibo && pagamentosPagos.length > 0

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="flex max-h-[96dvh] w-[98vw] max-w-6xl flex-col overflow-hidden p-0 sm:max-h-[94vh]">
        <DialogHeader className="shrink-0 border-b border-border bg-background px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <DialogTitle className="text-lg sm:text-xl">{dados.os.rotuloNumero}</DialogTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={ehOrcamento ? 'secondary' : 'outline'}>
                    {dados.os.tituloDocumento}
                  </Badge>
                  <span className="text-sm text-muted-foreground">Status: {dados.os.status}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {onAbrirTelaCheia && ordemServicoId && (
                  <Button variant="secondary" size="sm" onClick={onAbrirTelaCheia}>
                    <Maximize2 className="h-4 w-4" />
                    Ver em tela cheia
                  </Button>
                )}
                {onEditar && (
                  <Button variant="outline" size="sm" onClick={onEditar}>
                    <Pencil className="h-4 w-4" />
                    Editar
                  </Button>
                )}
                {ehOrcamento && onConverterOrcamento && (
                  <Button variant="default" size="sm" onClick={onConverterOrcamento}>
                    Converter em OS
                  </Button>
                )}
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
                    {exportandoPdf ? 'Gerando PDF...' : ehOrcamento ? 'Baixar orçamento' : 'Baixar PDF'}
                  </Button>
                )}
                {os && cliente && moto && (
                  <BotaoEnviarWhatsAppOs
                    os={os}
                    cliente={cliente}
                    moto={moto}
                    variant="default"
                    exibirValores={exibirFinanceiro}
                  />
                )}
                {reciboDisponivel && onGerarRecibo && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => pagamentoSelecionadoId && onGerarRecibo(pagamentoSelecionadoId)}
                    disabled={!reciboDisponivel || gerandoRecibo || exportandoPdf}
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

            {reciboDisponivel && pagamentosPagos.length > 1 && (
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

            {podeGerarRecibo && !ehOrcamento && pagamentosPagos.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum pagamento recebido nesta OS. Registre um pagamento para gerar o recibo.
              </p>
            )}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-100 p-3 sm:p-6">
          <div className="mx-auto max-w-5xl space-y-4">
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-8">
              <OsDocumentoConteudo dados={dados} exibirFinanceiro={exibirFinanceiro} />
            </div>
            {ordemServicoId && (
              <ComunicacaoRelacionadaOsSection ordemServicoId={ordemServicoId} />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
