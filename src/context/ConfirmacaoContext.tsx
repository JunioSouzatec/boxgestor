import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
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

export interface OpcoesConfirmacao {
  titulo?: string
  mensagem: string
  confirmarTexto?: string
  cancelarTexto?: string
  /** Exclusões e ações destrutivas */
  destrutivo?: boolean
}

interface ConfirmacaoContextValue {
  confirmar: (opcoes: OpcoesConfirmacao) => Promise<boolean>
}

const ConfirmacaoContext = createContext<ConfirmacaoContextValue | null>(null)

export function ConfirmacaoProvider({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(false)
  const [opcoes, setOpcoes] = useState<OpcoesConfirmacao>({ mensagem: '' })
  const resolverRef = useRef<((valor: boolean) => void) | null>(null)

  const confirmar = useCallback((opts: OpcoesConfirmacao) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
      setOpcoes(opts)
      setAberto(true)
    })
  }, [])

  const fechar = useCallback((valor: boolean) => {
    setAberto(false)
    resolverRef.current?.(valor)
    resolverRef.current = null
  }, [])

  const value = useMemo(() => ({ confirmar }), [confirmar])

  return (
    <ConfirmacaoContext.Provider value={value}>
      {children}
      <Dialog
        open={aberto}
        onOpenChange={(open) => {
          if (!open) fechar(false)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{opcoes.titulo ?? 'Confirmar ação'}</DialogTitle>
            <DialogDescription className="whitespace-pre-line pt-1">
              {opcoes.mensagem}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => fechar(false)}>
              {opcoes.cancelarTexto ?? 'Cancelar'}
            </Button>
            <Button
              type="button"
              variant={opcoes.destrutivo ? 'destructive' : 'default'}
              onClick={() => fechar(true)}
            >
              {opcoes.confirmarTexto ?? 'Confirmar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ConfirmacaoContext.Provider>
  )
}

export function useConfirmacao(): ConfirmacaoContextValue {
  const ctx = useContext(ConfirmacaoContext)
  if (!ctx) {
    throw new Error('useConfirmacao deve ser usado dentro de ConfirmacaoProvider')
  }
  return ctx
}
