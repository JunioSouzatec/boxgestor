import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface AutorizacaoValoresContextValue {
  campoAutorizado: string | null
  campoEstaAutorizado: (campoId: string) => boolean
  solicitarAutorizacao: (pinEsperado?: string, campoId?: string) => Promise<boolean>
  consumirAutorizacao: (campoId?: string) => void
  limparAutorizacao: () => void
}

const AutorizacaoValoresContext = createContext<AutorizacaoValoresContextValue | null>(null)

export function AutorizacaoValoresProvider({ children }: { children: ReactNode }) {
  const [dialogAberto, setDialogAberto] = useState(false)
  const [pinEsperado, setPinEsperado] = useState('')
  const [pinDigitado, setPinDigitado] = useState('')
  const [erroPin, setErroPin] = useState<string | null>(null)
  const [campoAutorizado, setCampoAutorizado] = useState<string | null>(null)
  const [campoSolicitado, setCampoSolicitado] = useState<string | null>(null)
  const [resolver, setResolver] = useState<((ok: boolean) => void) | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputUid = useId().replace(/:/g, '')

  const limparAutorizacao = useCallback(() => {
    setCampoAutorizado(null)
    setPinDigitado('')
    setErroPin(null)
  }, [])

  const consumirAutorizacao = useCallback((campoId?: string) => {
    setCampoAutorizado((atual) => {
      if (!atual) return null
      if (!campoId || atual === campoId) return null
      return atual
    })
  }, [])

  const solicitarAutorizacao = useCallback((pin?: string, campoId?: string) => {
    if (!pin?.trim()) return Promise.resolve(false)
    if (!campoId?.trim()) return Promise.resolve(false)
    return new Promise<boolean>((resolve) => {
      setCampoAutorizado(null)
      setPinEsperado(pin)
      setPinDigitado('')
      setErroPin(null)
      setCampoSolicitado(campoId)
      setResolver(() => resolve)
      setDialogAberto(true)
    })
  }, [])

  const fecharComSucesso = useCallback(() => {
    setDialogAberto(false)
    setPinDigitado('')
    setPinEsperado('')
    setErroPin(null)
    setCampoAutorizado(campoSolicitado)
    setCampoSolicitado(null)
    resolver?.(true)
    setResolver(null)
  }, [campoSolicitado, resolver])

  const cancelar = useCallback(() => {
    setDialogAberto(false)
    setPinDigitado('')
    setPinEsperado('')
    setErroPin(null)
    setCampoSolicitado(null)
    resolver?.(false)
    setResolver(null)
  }, [resolver])

  const confirmarPin = useCallback(() => {
    const ok = pinDigitado.trim() === pinEsperado.trim()
    if (!ok) {
      setErroPin('PIN incorreto. Tente novamente.')
      setPinDigitado('')
      window.setTimeout(() => inputRef.current?.focus(), 0)
      return
    }
    fecharComSucesso()
  }, [pinDigitado, pinEsperado, fecharComSucesso])

  const campoEstaAutorizado = useCallback(
    (campoId: string) => campoAutorizado === campoId,
    [campoAutorizado]
  )

  useEffect(() => {
    if (!dialogAberto) return
    const timer = window.setTimeout(() => {
      inputRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [dialogAberto, erroPin])

  const value = useMemo(
    () => ({
      campoAutorizado,
      campoEstaAutorizado,
      solicitarAutorizacao,
      consumirAutorizacao,
      limparAutorizacao,
    }),
    [
      campoAutorizado,
      campoEstaAutorizado,
      solicitarAutorizacao,
      consumirAutorizacao,
      limparAutorizacao,
    ]
  )

  function aoEnviar(event: FormEvent) {
    event.preventDefault()
    confirmarPin()
  }

  return (
    <AutorizacaoValoresContext.Provider value={value}>
      {children}
      <Dialog
        open={dialogAberto}
        onOpenChange={(open) => {
          if (!open) cancelar()
        }}
      >
        <DialogContent
          className="max-w-sm [&>button.absolute]:hidden"
          prioridadeAlta
          data-craft-autorizacao-pin="true"
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            event.preventDefault()
            cancelar()
          }}
        >
          <DialogHeader>
            <DialogTitle>Autorização necessária</DialogTitle>
            <DialogDescription>
              Informe o PIN do dono/admin para alterar valores da OS.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4 pt-1" onSubmit={aoEnviar} autoComplete="off">
            <div className="grid gap-2">
              <Label htmlFor={inputUid}>PIN</Label>
              <Input
                ref={inputRef}
                id={inputUid}
                name={`craft-pin-auth-${inputUid}`}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
                readOnly
                placeholder="Digite o PIN"
                value={pinDigitado}
                aria-invalid={erroPin ? true : undefined}
                aria-describedby={erroPin ? `${inputUid}-erro` : undefined}
                onFocus={(event) => event.currentTarget.removeAttribute('readonly')}
                onChange={(event) => {
                  setPinDigitado(event.target.value)
                  if (erroPin) setErroPin(null)
                }}
              />
              {erroPin && (
                <p id={`${inputUid}-erro`} className="text-sm text-destructive" role="alert">
                  {erroPin}
                </p>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="min-h-11" onClick={cancelar}>
                Cancelar
              </Button>
              <Button type="submit" className="min-h-11">
                Confirmar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AutorizacaoValoresContext.Provider>
  )
}

export function useAutorizacaoValores() {
  const ctx = useContext(AutorizacaoValoresContext)
  if (!ctx) {
    return {
      campoAutorizado: null,
      campoEstaAutorizado: () => false,
      solicitarAutorizacao: async () => false,
      consumirAutorizacao: () => undefined,
      limparAutorizacao: () => undefined,
    }
  }
  return ctx
}
