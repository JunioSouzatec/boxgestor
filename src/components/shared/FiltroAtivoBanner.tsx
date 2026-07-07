import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface FiltroAtivoBannerProps {
  mensagem: string
  onLimpar: () => void
  className?: string
}

/** Banner exibido quando um filtro rápido (card/indicador) está ativo. */
export function FiltroAtivoBanner({ mensagem, onLimpar, className }: FiltroAtivoBannerProps) {
  return (
    <div
      className={cn(
        'mb-4 flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <p>{mensagem}</p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 shrink-0 gap-1.5 self-start text-amber-100 hover:bg-amber-500/20 hover:text-amber-50 sm:self-auto"
        onClick={onLimpar}
      >
        <X className="h-4 w-4" />
        Limpar filtro
      </Button>
    </div>
  )
}
