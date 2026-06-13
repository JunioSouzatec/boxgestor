import { Shield } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useBancoStatus } from '@/context/BancoStatusContext'
import { cn } from '@/lib/utils'

interface IndicadorSistemaProps {
  className?: string
  mostrarOfficeId?: boolean
}

export function IndicadorSistema({ className, mostrarOfficeId = false }: IndicadorSistemaProps) {
  const { session, modoAuthLabel } = useAuth()
  const { modoPersistenciaLabel } = useBancoStatus()

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 text-xs text-muted-foreground',
        className
      )}
    >
      <span
        className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/20 px-2 py-0.5"
        title={modoAuthLabel}
      >
        <Shield className="h-3 w-3" />
        {modoAuthLabel}
      </span>
      <span className="rounded-full border border-border bg-muted/20 px-2 py-0.5">
        {modoPersistenciaLabel}
      </span>
      {mostrarOfficeId && session?.user?.office_id && (
        <span
          className="rounded-full border border-border bg-muted/20 px-2 py-0.5 font-mono text-[10px]"
          title="Office ID da sessão atual"
        >
          Office: {session.user.office_id.slice(0, 8)}…
        </span>
      )}
    </div>
  )
}
