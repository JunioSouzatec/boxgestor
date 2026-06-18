import { Cloud, CloudOff, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLembretes } from '@/context/LembretesContext'
import { cn } from '@/lib/utils'

function formatarSync(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function LembretesSyncStatus({ className }: { className?: string }) {
  const { syncInfo, sincronizarAgora } = useLembretes()
  const supabase = syncInfo.fonte === 'supabase'

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground',
        className
      )}
    >
      {syncInfo.sincronizando ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : supabase ? (
        <Cloud className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <CloudOff className="h-3.5 w-3.5 text-amber-500" />
      )}
      <span>
        Fonte: <strong>{supabase ? 'Supabase' : 'Local (cache)'}</strong>
      </span>
      <span>· Última sync: {formatarSync(syncInfo.ultima_sincronizacao)}</span>
      {syncInfo.pendentes > 0 && (
        <span className="text-amber-600 dark:text-amber-400">
          · {syncInfo.pendentes} pendente(s)
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto h-7 gap-1 px-2 text-xs"
        disabled={syncInfo.sincronizando}
        onClick={() => void sincronizarAgora()}
      >
        <RefreshCw className={cn('h-3 w-3', syncInfo.sincronizando && 'animate-spin')} />
        Sincronizar
      </Button>
    </div>
  )
}
