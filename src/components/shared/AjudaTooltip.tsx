import { HelpCircle } from 'lucide-react'

interface AjudaTooltipProps {
  texto: string
  className?: string
}

export function AjudaTooltip({ texto, className }: AjudaTooltipProps) {
  return (
    <span
      title={texto}
      className={className ?? 'inline-flex cursor-help text-muted-foreground hover:text-foreground'}
      aria-label={texto}
      role="img"
    >
      <HelpCircle className="h-4 w-4" />
    </span>
  )
}
