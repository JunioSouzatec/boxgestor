import { useState } from 'react'
import { AlertTriangle, Loader2, RefreshCw, X } from 'lucide-react'
import { useBancoStatus } from '@/context/BancoStatusContext'
import { useCraft } from '@/context/CraftContext'
import { useToast } from '@/context/ToastContext'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { MSG } from '@/lib/mensagens-usuario'
import { forcarSincronizacaoComServidor } from '@/services/comunicacao/forcar-sincronizacao.service'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function AvisoPersistencia() {
  const {
    ultimoAviso,
    pendenciasAtivas,
    limparAviso,
    modoSupabaseExperimental,
  } = useBancoStatus()
  const { sincronizandoEmBackground, oficinaId, aplicarDatabase } = useCraft()
  const { toast } = useToast()
  const online = useOnlineStatus()
  const [sincronizandoManual, setSincronizandoManual] = useState(false)
  const sincronizando = sincronizandoEmBackground || sincronizandoManual

  if (!modoSupabaseExperimental) return null

  async function sincronizarAgora() {
    if (!online) {
      toast.atencao(MSG.acaoPrecisaInternet)
      return
    }
    setSincronizandoManual(true)
    try {
      const resultado = await forcarSincronizacaoComServidor(oficinaId)
      if (resultado.database) {
        aplicarDatabase(resultado.database)
      }
      if (!resultado.ok) {
        toast.erro(resultado.mensagem ?? 'Não foi possível sincronizar.')
        return
      }
      if ((resultado.pendentesRestantes ?? 0) > 0) {
        toast.atencao(resultado.mensagem ?? MSG.atencaoSync)
        return
      }
      toast.sucesso(resultado.mensagem ?? 'Dados sincronizados com o servidor.')
      limparAviso()
    } catch (e) {
      toast.erro(e instanceof Error ? e.message : 'Não foi possível sincronizar.')
    } finally {
      setSincronizandoManual(false)
    }
  }

  if (sincronizando && !ultimoAviso && pendenciasAtivas === 0) {
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
    (pendenciasAtivas > 0 ? MSG.pendenciasAguardandoSync(pendenciasAtivas) : null)

  if (!mensagem) return null

  return (
    <div
      className={cn(
        'border-b px-4 py-2 text-sm sm:px-6',
        'border-amber-500/30 bg-amber-500/10 text-amber-100/90'
      )}
      role="status"
    >
      <div className="flex flex-wrap items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p className="min-w-0 flex-1">{mensagem}</p>
        {pendenciasAtivas > 0 && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 shrink-0 gap-1.5"
            onClick={() => void sincronizarAgora()}
            disabled={sincronizando || !online}
          >
            {sincronizando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Sincronizar agora
          </Button>
        )}
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
