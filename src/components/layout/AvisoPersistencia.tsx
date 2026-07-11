import { AlertTriangle, X } from 'lucide-react'
import { useBancoStatus } from '@/context/BancoStatusContext'
import { MSG } from '@/lib/mensagens-usuario'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function AvisoPersistencia() {
  const { ultimoAviso, pendenciasAtivas, limparAviso, modoSupabaseExperimental } = useBancoStatus()

  if (!modoSupabaseExperimental || (!ultimoAviso && pendenciasAtivas === 0)) {
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
