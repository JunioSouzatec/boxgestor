import { cn, formatarMoeda } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

interface StatCardProps {
  titulo: string
  valor: string | number
  icone: LucideIcon
  descricao?: string
  variante?: 'default' | 'success' | 'warning' | 'info'
  formatarComoMoeda?: boolean
  href?: string
}

const variantes = {
  default: 'from-zinc-800/80 to-zinc-900/80 border-zinc-700/50',
  success: 'from-emerald-950/50 to-zinc-900/80 border-emerald-800/30',
  warning: 'from-amber-950/50 to-zinc-900/80 border-amber-800/30',
  info: 'from-blue-950/50 to-zinc-900/80 border-blue-800/30',
}

const iconVariantes = {
  default: 'bg-primary/15 text-primary',
  success: 'bg-emerald-500/15 text-emerald-400',
  warning: 'bg-amber-500/15 text-amber-400',
  info: 'bg-blue-500/15 text-blue-400',
}

export function StatCard({
  titulo,
  valor,
  icone: Icone,
  descricao,
  variante = 'default',
  formatarComoMoeda = false,
  href,
}: StatCardProps) {
  const valorExibido =
    formatarComoMoeda && typeof valor === 'number' ? formatarMoeda(valor) : valor

  const conteudo = (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border bg-gradient-to-br p-5 transition-all hover:border-zinc-600/50',
        variantes[variante],
        href && 'cursor-pointer hover:border-primary/40'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{titulo}</p>
          <p className="text-2xl font-bold tracking-tight">{valorExibido}</p>
          {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
        </div>
        <div className={cn('rounded-lg p-2.5', iconVariantes[variante])}>
          <Icone className="h-5 w-5" />
        </div>
      </div>
    </div>
  )

  if (href) {
    return (
      <Link to={href} className="block no-underline text-inherit">
        {conteudo}
      </Link>
    )
  }

  return conteudo
}
