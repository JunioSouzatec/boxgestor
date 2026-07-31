/**
 * Tooltip leve para gráficos SVG/CSS do Gestor Inteligente.
 * Hover no desktop; toque no celular. Sem biblioteca externa.
 */
import { cn } from '@/lib/utils'

export interface ChartTooltipState {
  visible: boolean
  text: string
  x: number
  y: number
}

export const CHART_TOOLTIP_HIDDEN: ChartTooltipState = {
  visible: false,
  text: '',
  x: 0,
  y: 0,
}

export function ChartTooltip({
  state,
  className,
}: {
  state: ChartTooltipState
  className?: string
}) {
  if (!state.visible || !state.text.trim()) return null

  return (
    <div
      role="tooltip"
      className={cn(
        'pointer-events-none absolute z-20 max-w-[min(240px,calc(100%-1rem))] rounded-lg border border-border bg-zinc-950/95 px-2.5 py-1.5 text-xs font-medium text-zinc-50 shadow-lg backdrop-blur',
        className
      )}
      style={{
        left: `clamp(8px, ${state.x}px, calc(100% - 8px))`,
        top: Math.max(8, state.y),
        transform: 'translate(-50%, calc(-100% - 10px))',
      }}
    >
      {state.text}
    </div>
  )
}

/** Converte posição do ponteiro relativa ao container. */
export function posicaoTooltipRelativa(
  container: HTMLElement | null,
  clientX: number,
  clientY: number
): { x: number; y: number } {
  if (!container) return { x: clientX, y: clientY }
  const rect = container.getBoundingClientRect()
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  }
}
