import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PaginacaoListaProps {
  pagina: number
  totalPaginas: number
  total: number
  tamanhoPagina: number
  onPaginaChange: (pagina: number) => void
}

export function PaginacaoLista({
  pagina,
  totalPaginas,
  total,
  tamanhoPagina,
  onPaginaChange,
}: PaginacaoListaProps) {
  if (total === 0) return null

  const inicio = (pagina - 1) * tamanhoPagina + 1
  const fim = Math.min(pagina * tamanhoPagina, total)
  const temPaginacao = total > tamanhoPagina

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
      <p className="text-xs text-muted-foreground">
        {temPaginacao
          ? `Exibindo ${inicio}–${fim} de ${total}`
          : `Exibindo todas as ${total} ordem${total !== 1 ? 'ns' : ''}`}
      </p>
      {temPaginacao && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={pagina <= 1}
            onClick={() => onPaginaChange(pagina - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>
          <span className="px-2 text-xs text-muted-foreground">
            Página {pagina} de {totalPaginas}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pagina >= totalPaginas}
            onClick={() => onPaginaChange(pagina + 1)}
          >
            Próxima
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
