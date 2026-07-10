import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

interface AutorizacaoValoresContextValue {
  autorizado: boolean
  solicitarAutorizacao: (pinEsperado?: string) => Promise<boolean>
  limparAutorizacao: () => void
}

const AutorizacaoValoresContext = createContext<AutorizacaoValoresContextValue | null>(null)

export function AutorizacaoValoresProvider({ children }: { children: ReactNode }) {
  const [autorizado, setAutorizado] = useState(false)
  const [dialogAberto, setDialogAberto] = useState(false)
  const [pinEsperado, setPinEsperado] = useState('')
  const [resolver, setResolver] = useState<((ok: boolean) => void) | null>(null)

  const solicitarAutorizacao = useCallback((pin?: string) => {
    if (autorizado) return Promise.resolve(true)
    if (!pin?.trim()) return Promise.resolve(false)
    return new Promise<boolean>((resolve) => {
      setPinEsperado(pin)
      setResolver(() => resolve)
      setDialogAberto(true)
    })
  }, [autorizado])

  const confirmarPin = useCallback(
    (digitado: string) => {
      const ok = digitado.trim() === pinEsperado.trim()
      if (ok) setAutorizado(true)
      setDialogAberto(false)
      resolver?.(ok)
      setResolver(null)
    },
    [pinEsperado, resolver]
  )

  const cancelar = useCallback(() => {
    setDialogAberto(false)
    resolver?.(false)
    setResolver(null)
  }, [resolver])

  const value = useMemo(
    () => ({
      autorizado,
      solicitarAutorizacao,
      limparAutorizacao: () => setAutorizado(false),
    }),
    [autorizado, solicitarAutorizacao]
  )

  return (
    <AutorizacaoValoresContext.Provider value={value}>
      {children}
      {dialogAberto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-lg">
            <h3 className="text-lg font-semibold">Autorização necessária</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Informe o PIN do dono/admin para alterar valores da OS.
            </p>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                confirmarPin(String(fd.get('pin') ?? ''))
              }}
            >
              <input
                name="pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="PIN"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border border-border px-3 py-1.5 text-sm"
                  onClick={cancelar}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
                >
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AutorizacaoValoresContext.Provider>
  )
}

export function useAutorizacaoValores() {
  const ctx = useContext(AutorizacaoValoresContext)
  if (!ctx) {
    return {
      autorizado: false,
      solicitarAutorizacao: async () => false,
      limparAutorizacao: () => undefined,
    }
  }
  return ctx
}
