import { AlertTriangle, Loader2, X } from 'lucide-react'
import { useBancoStatus } from '@/context/BancoStatusContext'
import { useCraft } from '@/context/CraftContext'
import { MSG } from '@/lib/mensagens-usuario'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function AvisoPersistencia() {
  const { ultimoAviso, pendenciasAtivas, limparAviso, modoSupabaseExperimental } = useBancoStatus()
  const { sincronizandoEmBackground } = useCraft()
  const sincronizando = sincronizandoEmBackground

  if (!modoSupabaseExperimental) return null

  if (sincronizando && !ultimoAviso) {
    return (
      <div
        className={cn(
          'border-b px-4 py-2 text-sm sm:px-6',
          'border-sky-500/30 bg-sky-500/10 text-sky-100/90'
        )}
        role="status"
      >
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-400" />
          <p className="flex-1">Sincronizando com o servidor...</p>
        </div>
      </div>
    )
  }

  if (!ultimoAviso && pendenciasAtivas === 0) {
    return null
  }

  const mensagem =
    ultimoAviso ??
    (pendenciasAtivas > 0
      ? `${MSG.atencaoSync} (${pendenciasAtivas} pendência${pendenciasAtivas !== 1 ? 's' : ''})`
      : null)

  if (!mensagem) return null

  return (
    <div
      className={cn(
        'border-b px-4 py-2 text-sm sm:px-6',
        'border-amber-500/30 bg-amber-500/10 text-amber-100/90'
      )}
      role="status"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p className="flex-1">{mensagem}</p>
        {ultimoAviso && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-amber-200/80 hover:text-amber-100"
            onClick={limparAviso}
            aria-label="Fechar aviso"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
