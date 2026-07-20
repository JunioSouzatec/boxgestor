import { useEffect, useState } from 'react'

/** true abaixo do breakpoint lg (1024px) — formulários densos no mobile. */
export function useViewportMobile(breakpointPx = 1024): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${breakpointPx - 1}px)`).matches : false
  )

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`)
    const atualizar = () => setMobile(mq.matches)
    atualizar()
    mq.addEventListener('change', atualizar)
    return () => mq.removeEventListener('change', atualizar)
  }, [breakpointPx])

  return mobile
}
