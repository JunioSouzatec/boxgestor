import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { AlertCircle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToastVariant = 'sucesso' | 'erro' | 'atencao' | 'info'

export interface ToastItem {
  id: string
  variant: ToastVariant
  mensagem: string
  duracaoMs?: number
}

interface ToastContextValue {
  toast: {
    sucesso: (mensagem: string, duracaoMs?: number) => void
    erro: (mensagem: string, duracaoMs?: number) => void
    atencao: (mensagem: string, duracaoMs?: number) => void
    info: (mensagem: string, duracaoMs?: number) => void
  }
}

const ToastContext = createContext<ToastContextValue | null>(null)

const VARIANT_STYLES: Record<
  ToastVariant,
  { container: string; icon: typeof CheckCircle2; iconClass: string }
> = {
  sucesso: {
    container: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-50',
    icon: CheckCircle2,
    iconClass: 'text-emerald-400',
  },
  erro: {
    container: 'border-red-500/40 bg-red-500/10 text-red-50',
    icon: XCircle,
    iconClass: 'text-red-400',
  },
  atencao: {
    container: 'border-amber-500/40 bg-amber-500/10 text-amber-50',
    icon: AlertCircle,
    iconClass: 'text-amber-400',
  },
  info: {
    container: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-50',
    icon: Info,
    iconClass: 'text-cyan-400',
  },
}

const DURACAO_PADRAO: Record<ToastVariant, number> = {
  sucesso: 4000,
  erro: 7000,
  atencao: 6000,
  info: 5000,
}

let contadorToast = 0

function ToastViewport({
  toasts,
  onRemover,
}: {
  toasts: ToastItem[]
  onRemover: (id: string) => void
}) {
  if (toasts.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 p-4 sm:bottom-6 sm:right-6"
      aria-live="polite"
      aria-label="Notificações"
    >
      {toasts.map((t) => {
        const estilo = VARIANT_STYLES[t.variant]
        const Icone = estilo.icon
        return (
          <div
            key={t.id}
            role="alert"
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm animate-in slide-in-from-right-full duration-300',
              estilo.container
            )}
          >
            <Icone className={cn('h-5 w-5 shrink-0 mt-0.5', estilo.iconClass)} aria-hidden />
            <p className="flex-1 text-sm leading-snug">{t.mensagem}</p>
            <button
              type="button"
              onClick={() => onRemover(t.id)}
              className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
              aria-label="Fechar notificação"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const remover = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const adicionar = useCallback(
    (variant: ToastVariant, mensagem: string, duracaoMs?: number) => {
      const id = `toast-${++contadorToast}`
      const duracao = duracaoMs ?? DURACAO_PADRAO[variant]
      setToasts((prev) => [...prev.slice(-4), { id, variant, mensagem, duracaoMs: duracao }])
      window.setTimeout(() => remover(id), duracao)
    },
    [remover]
  )

  const toast = useMemo(
    () => ({
      sucesso: (mensagem: string, duracaoMs?: number) =>
        adicionar('sucesso', mensagem, duracaoMs),
      erro: (mensagem: string, duracaoMs?: number) => adicionar('erro', mensagem, duracaoMs),
      atencao: (mensagem: string, duracaoMs?: number) => adicionar('atencao', mensagem, duracaoMs),
      info: (mensagem: string, duracaoMs?: number) => adicionar('info', mensagem, duracaoMs),
    }),
    [adicionar]
  )

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onRemover={remover} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast deve ser usado dentro de ToastProvider')
  }
  return ctx
}
