import { useCallback, useState } from 'react'
import { CloudUpload, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import { useToast } from '@/context/ToastContext'
import { isModoAuthSupabaseAtivo } from '@/lib/craft-auth'
import { isSupabaseConfigured } from '@/lib/supabase'
import { migrarDadosLocaisParaOficinaSupabase } from '@/services/migration/migrar-oficina-supabase.service'
import { OFFICE_ID } from '@/types/base'
import { cn } from '@/lib/utils'

export function MigrarOficinaSupabaseCard() {
  const { session, officeId } = useAuth()
  const { confirmar } = useConfirmacao()
  const { toast } = useToast()
  const [migrando, setMigrando] = useState(false)
  const [resultado, setResultado] = useState<Awaited<
    ReturnType<typeof migrarDadosLocaisParaOficinaSupabase>
  > | null>(null)

  const podeMigrar =
    isSupabaseConfigured() &&
    isModoAuthSupabaseAtivo() &&
    Boolean(session?.user?.office_id ?? officeId)

  const handleMigrar = useCallback(async () => {
    const confirmarOk = await confirmar({
      titulo: 'Migrar dados locais',
      mensagem:
        'Deseja migrar os dados locais para a oficina logada no Supabase?\n\n' +
        'Serão enviados clientes, motos e OS — os dados da oficina (nome, telefone, logo) NÃO serão alterados.\n' +
        'Nenhuma nova oficina será criada. O backup local será preservado.',
      confirmarTexto: 'Migrar dados',
    })
    if (!confirmarOk) return

    setMigrando(true)
    setResultado(null)
    try {
      const res = await migrarDadosLocaisParaOficinaSupabase(OFFICE_ID)
      setResultado(res)
      const c = res.contagem
      if (res.ok) {
        toast.sucesso(
          `Migração concluída: ${c?.customers ?? 0} clientes, ${c?.motorcycles ?? 0} motos e ${c?.service_orders ?? 0} OS enviados.`
        )
      } else if (c && (c.customers + c.motorcycles + c.service_orders > 0)) {
        toast.atencao(
          `Migração concluída parcialmente: ${c.customers + c.motorcycles + c.service_orders} enviados, ${res.erros?.length ?? 0} erro(s).`
        )
      } else {
        toast.erro(res.mensagem || 'Não foi possível concluir a migração.')
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Craft] Erro na migração:', err)
      toast.erro('Não foi possível migrar os dados. Tente novamente.')
    } finally {
      setMigrando(false)
    }
  }, [confirmar, toast])

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
