import { useEffect } from 'react'
import { useToast } from '@/context/ToastContext'
import { logDetalheTecnicoDev, mensagemAvisoPersistencia } from '@/lib/mensagens-usuario'
import { getCraftPersistenceMode } from '@/lib/supabase'
import { inscreverEventosPersistencia } from '@/services/persistence-status.events'

/**
 * Toasts automáticos para fallback offline/Supabase.
 * Sucesso de pagamento/OS fica a cargo das telas — evita toasts duplicados.
 */
export function PersistenceToastListener() {
  const { toast } = useToast()

  useEffect(() => {
    if (getCraftPersistenceMode() !== 'supabase') return

    return inscreverEventosPersistencia((event) => {
      if (event.type === 'pagamento_ok' || event.type === 'supabase_ok') {
        return
      }

      if (event.type === 'pagamentos_pendentes') {
        logDetalheTecnicoDev('sync pendente', event)
        return
      }

      if (event.type === 'fallback' || event.type === 'offline') {
        logDetalheTecnicoDev(event.type, event)
        toast.atencao(
          mensagemAvisoPersistencia(
            event.type,
            event.mensagem,
            event.type === 'fallback' ? event.escopo : undefined
          )
        )
      }
    })
  }, [toast])

  return null
}
