import { useEffect } from 'react'
import { useToast } from '@/context/ToastContext'
import { getCraftPersistenceMode } from '@/lib/supabase'
import { inscreverEventosPersistencia } from '@/services/persistence-status.events'
import {
  MENSAGEM_FALLBACK_PAGAMENTO,
  MENSAGEM_SUCESSO_PAGAMENTO,
} from '@/services/supabase-sync/supabase-payments.persistence'

/** Exibe toasts automáticos para fallback offline/Supabase */
export function PersistenceToastListener() {
  const { toast } = useToast()

  useEffect(() => {
    if (getCraftPersistenceMode() !== 'supabase') return

    return inscreverEventosPersistencia((event) => {
      if (event.type === 'pagamento_ok') {
        toast.sucesso(event.mensagem || MENSAGEM_SUCESSO_PAGAMENTO)
      }
      if (event.type === 'pagamentos_pendentes') {
        toast.atencao(event.mensagem || MENSAGEM_FALLBACK_PAGAMENTO)
      }
      if (event.type === 'fallback') {
        if (event.escopo === 'pagamento' || event.escopo === 'os') {
          toast.atencao(event.mensagem)
          return
        }
        toast.atencao(
          event.mensagem.includes('local')
            ? event.mensagem
            : 'Não foi possível salvar no Supabase. Os dados foram salvos localmente e serão sincronizados depois.'
        )
      }
      if (event.type === 'offline') {
        toast.atencao(
          event.mensagem.includes('internet') || event.mensagem.includes('Offline')
            ? event.mensagem
            : 'Erro de conexão. Salvamos localmente por segurança.'
        )
      }
    })
  }, [toast])

  return null
}
