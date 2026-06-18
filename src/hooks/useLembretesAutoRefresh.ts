import { useEffect } from 'react'
import { useCraft } from '@/context/CraftContext'
import {
  lembretesModoSupabase,
  refreshRemotoParaCache,
  LEMBRETES_EVENTO_ATUALIZADO,
} from '@/services/lembretes/lembretes-sync.service'

const INTERVALO_MS = 25_000

/** Refresh automático do Supabase enquanto a tela de Lembretes está aberta. */
export function useLembretesAutoRefresh(recarregar: () => void, sincronizarAgora: () => Promise<void>) {
  const { oficinaId } = useCraft()

  useEffect(() => {
    if (!lembretesModoSupabase()) return

    void refreshRemotoParaCache(oficinaId).then((ok) => {
      if (ok) recarregar()
    })

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      void refreshRemotoParaCache(oficinaId).then((ok) => {
        if (ok) recarregar()
      })
    }

    const onEvento = () => recarregar()

    window.addEventListener('focus', onVisibility)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener(LEMBRETES_EVENTO_ATUALIZADO, onEvento)

    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return
      void refreshRemotoParaCache(oficinaId).then((ok) => {
        if (ok) recarregar()
      })
    }, INTERVALO_MS)

    return () => {
      window.removeEventListener('focus', onVisibility)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener(LEMBRETES_EVENTO_ATUALIZADO, onEvento)
      window.clearInterval(timer)
    }
  }, [oficinaId, recarregar, sincronizarAgora])
}
