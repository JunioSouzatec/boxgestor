import { useEffect } from 'react'
import { useToast } from '@/context/ToastContext'
import { getCraftPersistenceMode } from '@/lib/supabase'
import { inscreverEventosPersistencia } from '@/services/persistence-status.events'

/** Exibe toasts automáticos para fallback offline/Supabase */
export function PersistenceToastListener() {
  const { toast } = useToast()

  useEffect(() => {
    if (getCraftPersistenceMode() !== 'supabase') return

    return inscreverEventosPersistencia((event) => {
      if (event.type === 'fallback') {
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
