import { Shield } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useBancoStatus } from '@/context/BancoStatusContext'
import { cn } from '@/lib/utils'
import { getLabelPapel } from '@/types/auth'

interface IndicadorSistemaProps {
  className?: string
  mostrarOfficeId?: boolean
  nomeOficina?: string
}

export function IndicadorSistema({
  className,
  mostrarOfficeId = false,
  nomeOficina,
}: IndicadorSistemaProps) {
  const { session, modoAuthLabel, officeId } = useAuth()
  const { modoPersistenciaLabel, statusLabel, pagamentosPendentes, emFallbackLocal } =
    useBancoStatus()

  const bancoLabel =
    pagamentosPendentes > 0 && !emFallbackLocal
      ? statusLabel
      : emFallbackLocal
        ? 'Banco: Supabase com fallback local'
        : modoPersistenciaLabel

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
      <span
        className="rounded-full border border-border bg-muted/20 px-2 py-0.5"
        title={statusLabel}
      >
        {bancoLabel}
      </span>
      {nomeOficina && (
        <span
          className="max-w-[140px] truncate rounded-full border border-border bg-muted/20 px-2 py-0.5"
          title={`Oficina: ${nomeOficina}`}
        >
          {nomeOficina}
        </span>
      )}
      {session?.user?.papel && (
        <span className="rounded-full border border-border bg-muted/20 px-2 py-0.5">
          {getLabelPapel(session.user.papel)}
        </span>
      )}
      {mostrarOfficeId && (officeId ?? session?.user?.office_id) && (
        <span
          className="rounded-full border border-border bg-muted/20 px-2 py-0.5 font-mono text-[10px]"
          title="Office ID da sessão atual"
        >
          Office: {(officeId ?? session?.user?.office_id ?? '').slice(0, 8)}…
        </span>
      )}
    </div>
  )
}
