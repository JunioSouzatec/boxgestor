import { Database } from 'lucide-react'
import { useBancoStatus, type StatusBancoExibicao } from '@/context/BancoStatusContext'
import { cn } from '@/lib/utils'

const ESTILOS: Record<
  StatusBancoExibicao,
  { border: string; bg: string; text: string }
> = {
  local: {
    border: 'border-primary/30',
    bg: 'bg-primary/10',
    text: 'text-primary',
  },
  supabase: {
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
  },
  supabase_fallback: {
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
  },
  offline_sync: {
    border: 'border-orange-500/30',
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
  },
}

interface IndicadorBancoProps {
  className?: string
}

export function IndicadorBanco({ className }: IndicadorBancoProps) {
  const { status, statusLabel } = useBancoStatus()
  const estilo = ESTILOS[status]

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        estilo.border,
        estilo.bg,
        estilo.text,
        className
      )}
      title={statusLabel}
    >
      <Database className="h-3.5 w-3.5 shrink-0" />
      <span className="hidden sm:inline">{statusLabel}</span>
    </div>
  )
}
