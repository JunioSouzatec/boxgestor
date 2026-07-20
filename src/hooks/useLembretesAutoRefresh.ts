import { useEffect } from 'react'
import { useCraft } from '@/context/CraftContext'
import {
  lembretesModoSupabase,
  refreshRemotoParaCache,
  LEMBRETES_EVENTO_ATUALIZADO,
} from '@/services/lembretes/lembretes-sync.service'

/** Refresh automático do Supabase enquanto a tela de Lembretes está aberta. */
export function useLembretesAutoRefresh(recarregar: () => void, _sincronizarAgora: () => Promise<void>) {
  const { oficinaId } = useCraft()

  useEffect(() => {
    if (!lembretesModoSupabase()) return

    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      void refreshRemotoParaCache(oficinaId).then((ok) => {
        if (ok) recarregar()
      })
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }

    const onEvento = () => recarregar()

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener(LEMBRETES_EVENTO_ATUALIZADO, onEvento)

    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return
      void refreshRemotoParaCache(oficinaId).then((ok) => {
        if (ok) recarregar()
      })
    }, 60_000)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener(LEMBRETES_EVENTO_ATUALIZADO, onEvento)
      window.clearInterval(timer)
    }
  }, [oficinaId, recarregar])
}
