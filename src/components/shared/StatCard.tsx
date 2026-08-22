import { cn, formatarMoeda } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface StatCardProps {
  titulo: string
  valor: string | number
  icone: LucideIcon
  descricao?: string
  variante?: 'default' | 'success' | 'warning' | 'info'
  formatarComoMoeda?: boolean
  /** Destino de navegação (React Router). */
  to?: string
  /** Alias legado de `to`. */
  href?: string
  ariaLabel?: string
  /** Ação ao clicar (filtro rápido na mesma página). */
  onClick?: () => void
  /** Destaque visual quando o filtro/indicador está ativo. */
  ativo?: boolean
}

/** Ícone colorido sobre card escuro. */
const iconVariantes = {
  default: 'bg-slate-500/15 text-slate-300 ring-slate-500/20',
  success: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20',
  warning: 'bg-amber-500/15 text-amber-400 ring-amber-500/20',
  info: 'bg-sky-500/15 text-sky-400 ring-sky-500/20',
}

export function StatCard({
  titulo,
  valor,
  icone: Icone,
  descricao,
  variante = 'default',
  formatarComoMoeda = false,
  to,
  href,
  ariaLabel,
  onClick,
  ativo = false,
}: StatCardProps) {
  const navigate = useNavigate()
  const destino = to ?? href
  const clicavel = Boolean(destino || onClick)
  const valorExibido =
    formatarComoMoeda && typeof valor === 'number' ? formatarMoeda(valor) : valor

  const classesCard = cn(
    'relative w-full min-w-0 overflow-hidden rounded-xl border border-zinc-700/50 bg-zinc-900/90 p-5 text-left',
    'shadow-[0_1px_3px_rgba(0,0,0,0.35)] transition-[border-color,background-color,box-shadow,transform] duration-200',
    clicavel &&
      'cursor-pointer hover:border-zinc-600/70 hover:bg-zinc-900 active:scale-[0.99]',
    ativo && 'border-sky-500/45 ring-1 ring-sky-500/30'
  )

  const conteudo = (
    <>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-medium text-zinc-400">{titulo}</p>
          <p className="break-words text-2xl font-bold tracking-tight text-zinc-50">
            {valorExibido}
          </p>
          {descricao && (
            <p className="break-words text-xs text-zinc-400">{descricao}</p>
          )}
        </div>
        <div
          className={cn(
            'shrink-0 rounded-xl p-2.5 ring-1',
            iconVariantes[variante]
          )}
        >
          <Icone className="h-5 w-5" aria-hidden />
        </div>
      </div>
    </>
  )

  if (clicavel) {
    return (
      <button
        type="button"
        className={cn(
          classesCard,
          'm-0 font-inherit text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40'
        )}
        aria-label={ariaLabel ?? `Ver ${titulo}`}
        aria-pressed={ativo}
        onClick={() => {
          if (onClick) onClick()
          else if (destino) navigate(destino)
        }}
      >
        {conteudo}
      </button>
    )
  }

  return <div className={classesCard}>{conteudo}</div>
}
