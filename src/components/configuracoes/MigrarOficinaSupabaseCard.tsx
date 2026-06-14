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
  const { session, officeId } = useAuth()
  const [migrando, setMigrando] = useState(false)
  const [resultado, setResultado] = useState<Awaited<
    ReturnType<typeof migrarDadosLocaisParaOficinaSupabase>
  > | null>(null)

  const podeMigrar =
    isSupabaseConfigured() &&
    isModoAuthSupabaseAtivo() &&
    Boolean(session?.user?.office_id ?? officeId)

  const handleMigrar = useCallback(async () => {
    const confirmar = window.confirm(
      'Migrar dados locais (demo) para sua oficina no Supabase?\n\n' +
        'Os dados serão enviados para a office_id vinculada ao seu perfil. ' +
        'Nenhuma nova oficina será criada. O backup local será preservado.'
    )
    if (!confirmar) return

    setMigrando(true)
    setResultado(null)
    try {
      const res = await migrarDadosLocaisParaOficinaSupabase(OFFICE_ID)
      setResultado(res)
    } finally {
      setMigrando(false)
    }
  }, [])

  if (!podeMigrar) return null

  const officeExibir = resultado?.officeIdUsado ?? session?.user?.office_id ?? officeId

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/10 p-4">
      <div>
        <p className="text-sm font-medium">Migrar dados locais para minha oficina</p>
        <p className="text-xs text-muted-foreground mt-1">
          Envia clientes, motos e OS do backup local (oficina demo) para a{' '}
          <code className="text-primary">office_id</code> já vinculada ao seu perfil Supabase (
          {officeExibir ? `${officeExibir.slice(0, 8)}…` : '—'}). Não cria nova oficina — usa a
          existente. Backup local permanece intacto.
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
            'rounded-md border p-3 text-sm whitespace-pre-line',
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
