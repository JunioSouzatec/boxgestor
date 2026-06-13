import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { OsDocumentoConteudo } from '@/components/os/OsDocumentoConteudo'
import type { OsDocumentoViewModel } from '@/lib/os-documento'
import { FileDown, Loader2 } from 'lucide-react'

interface OsVisualizacaoDialogProps {
  aberto: boolean
  onFechar: () => void
  dados: OsDocumentoViewModel | null
  onExportarPdf?: () => void
  podeExportarPdf?: boolean
  exportandoPdf?: boolean
}

export function OsVisualizacaoDialog({
  aberto,
  onFechar,
  dados,
  onExportarPdf,
  podeExportarPdf,
  exportandoPdf,
}: OsVisualizacaoDialogProps) {
  if (!dados) return null

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto bg-zinc-100 p-0">
        <DialogHeader className="sticky top-0 z-10 border-b border-border bg-background px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <DialogTitle>Ordem de Serviço #{dados.os.numero}</DialogTitle>
            {podeExportarPdf && onExportarPdf && (
              <Button
                variant="outline"
                size="sm"
                onClick={onExportarPdf}
                disabled={exportandoPdf}
              >
                {exportandoPdf ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4" />
                )}
                {exportandoPdf ? 'Gerando PDF...' : 'Exportar PDF'}
              </Button>
            )}
          </div>
        </DialogHeader>
        <div className="p-6">
          <OsDocumentoConteudo dados={dados} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
