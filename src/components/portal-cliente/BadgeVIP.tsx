import { Badge } from '@/components/ui/badge'
import type { NivelVIP } from '@/types/portal-cliente'
import { getLabelNivelVIP } from '@/types/portal-cliente'
import { cn } from '@/lib/utils'

const VIP_STYLES: Record<NivelVIP, string> = {
  bronze: 'border-amber-700/50 bg-amber-900/20 text-amber-600',
  prata: 'border-slate-400/50 bg-slate-400/10 text-slate-300',
  ouro: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400',
  diamante: 'border-cyan-400/50 bg-cyan-400/10 text-cyan-300',
}

interface BadgeVIPProps {
  nivel: NivelVIP
  className?: string
}

export function BadgeVIP({ nivel, className }: BadgeVIPProps) {
  return (
    <Badge variant="outline" className={cn(VIP_STYLES[nivel], className)}>
      VIP {getLabelNivelVIP(nivel)}
    </Badge>
  )
}
