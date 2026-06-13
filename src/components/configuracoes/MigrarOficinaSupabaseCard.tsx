import { useCallback, useState } from 'react'
import { CloudUpload, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { isModoAuthSupabaseAtivo } from '@/lib/craft-auth'
import { isSupabaseConfigured } from '@/lib/supabase'
import { migrarDadosLocaisParaOficinaSupabase } from '@/services/migration/migrar-oficina-supabase.service'
import { OFFICE_ID } from '@/types/base'
import { cn } from '@/lib/utils'

export function MigrarOficinaSupabaseCard() {
  const { session } = useAuth()
  const [migrando, setMigrando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; mensagem: string } | null>(null)

  const podeMigrar =
    isSupabaseConfigured() &&
    isModoAuthSupabaseAtivo() &&
    session?.user.office_id

  const handleMigrar = useCallback(async () => {
    if (!session?.user.office_id) return

    const confirmar = window.confirm(
      'Migrar dados locais (demo) para sua oficina no Supabase?\n\n' +
        'Os dados locais serão enviados para a office_id da sua conta. ' +
        'O backup local será preservado.'
    )
    if (!confirmar) return

    setMigrando(true)
    setResultado(null)
    try {
      const res = await migrarDadosLocaisParaOficinaSupabase(
        session.user.office_id,
        OFFICE_ID
      )
      setResultado(res)
    } finally {
      setMigrando(false)
    }
  }, [session?.user.office_id])

  if (!podeMigrar) return null

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/10 p-4">
      <div>
        <p className="text-sm font-medium">Migrar dados locais para minha oficina</p>
        <p className="text-xs text-muted-foreground mt-1">
          Envia clientes, motos e OS do backup local (oficina demo) para a{' '}
          <code className="text-primary">office_id</code> da sua conta Supabase Auth.
          Evita duplicidade via IDs determinísticos. Backup local permanece intacto.
        </p>
      </div>

      <Button
        type="button"
        variant="outline"
        className="gap-2"
        disabled={migrando}
        onClick={handleMigrar}
      >
        {migrando ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Migrando…
          </>
        ) : (
          <>
            <CloudUpload className="h-4 w-4" />
            Migrar dados locais para minha oficina no Supabase
          </>
        )}
      </Button>

      {resultado && (
        <div
          className={cn(
            'rounded-md border p-3 text-sm',
            resultado.ok
              ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-100/90'
              : 'border-amber-500/30 bg-amber-500/5 text-amber-100/90'
          )}
        >
          {resultado.mensagem}
        </div>
      )}
    </div>
  )
}
