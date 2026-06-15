import { useEffect, useRef } from 'react'

/** Evita setState após desmontar e invalida promises antigas. */
export function useAdminMounted() {
  const mountedRef = useRef(true)
  const seqRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      seqRef.current += 1
    }
  }, [])

  function iniciarOperacao(): number {
    seqRef.current += 1
    return seqRef.current
  }

  function operacaoAtiva(seq: number): boolean {
    return mountedRef.current && seq === seqRef.current
  }

  return { mountedRef, seqRef, iniciarOperacao, operacaoAtiva }
}
