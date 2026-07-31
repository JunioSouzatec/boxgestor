/**
 * Detecta nova versão publicada (public/version.json) sem forçar reload.
 * Offline: silencioso. Sem loop / checagem excessiva.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  APP_DEPLOY_VERSION,
} from '@/generated/app-version'

const INTERVALO_MS = 4 * 60 * 1000
const SNOOZE_MS = 10 * 60 * 1000

interface VersionPayload {
  version?: string
  builtAt?: string
  commit?: string | null
}

export function useAppVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null)
  const [snoozedUntil, setSnoozedUntil] = useState(0)
  const checkingRef = useRef(false)
  const currentVersion = APP_DEPLOY_VERSION

  const verificar = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    if (checkingRef.current) return
    checkingRef.current = true
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) return
      const data = (await res.json()) as VersionPayload
      const remota = typeof data.version === 'string' ? data.version.trim() : ''
      if (!remota) return
      setRemoteVersion(remota)
      if (remota !== currentVersion) {
        setUpdateAvailable(true)
      }
    } catch {
      // Offline / falha de rede — não mostrar erro técnico
    } finally {
      checkingRef.current = false
    }
  }, [currentVersion])

  useEffect(() => {
    void verificar()
    const id = window.setInterval(() => {
      void verificar()
    }, INTERVALO_MS)

    const onFocus = () => {
      void verificar()
    }
    const onOnline = () => {
      void verificar()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void verificar()
    }

    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [verificar])

  const visivel = updateAvailable && Date.now() >= snoozedUntil

  const adiar = useCallback(() => {
    setSnoozedUntil(Date.now() + SNOOZE_MS)
  }, [])

  const atualizarAgora = useCallback(() => {
    window.location.reload()
  }, [])

  return {
    visivel,
    updateAvailable,
    currentVersion,
    remoteVersion,
    adiar,
    atualizarAgora,
  }
}
