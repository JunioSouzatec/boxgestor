import {
  adminUsaSupabaseRemoto,
  formatarHoraAdmin,
  labelStatusAdmin,
  type AdminStatusOperacao,
} from '@/lib/admin-env'

interface AdminStatusDiagnosticoProps {
  status: AdminStatusOperacao
  ultimaTentativa: Date | null
  rpc?: string
}

/** Texto discreto só para Administrador do Sistema — ajuda a depurar sem abrir o console. */
export function AdminStatusDiagnostico({
  status,
  ultimaTentativa,
  rpc = 'admin_list_offices',
}: AdminStatusDiagnosticoProps) {
  const fonte = adminUsaSupabaseRemoto() ? 'Supabase' : 'local (dev)'

  return (
    <p
      className="mt-3 border-t border-border/50 pt-2 text-[11px] leading-relaxed text-muted-foreground/70"
      aria-live="polite"
    >
      Status Admin: {labelStatusAdmin(status)} · Fonte: {fonte} · RPC: {rpc}
      {ultimaTentativa ? ` · Última tentativa: ${formatarHoraAdmin(ultimaTentativa)}` : ''}
    </p>
  )
}
