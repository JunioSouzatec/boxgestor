import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { obterIdentidadeApp } from '@/lib/app-versao'
import {
  obterPwaUpdateUiSnapshot,
  subscribePwaUpdateUi,
} from '@/lib/pwa-update-estado'
import {
  solicitarAtualizacaoApp,
  verificarAtualizacaoPwa,
} from '@/lib/pwa-update'
import { supabaseUrl } from '@/lib/supabase-env'
import { cn } from '@/lib/utils'

interface IdentidadeBoxGestorProps {
  className?: string
}

const FEEDBACK_MS = 4_000

export function IdentidadeBoxGestor({ className }: IdentidadeBoxGestorProps) {
  const { versaoAmigavel, buildCurto, homolog } = obterIdentidadeApp({
    supabaseUrl,
  })
  const { checking, hasWaiting } = useSyncExternalStore(
    subscribePwaUpdateUi,
    obterPwaUpdateUiSnapshot,
    obterPwaUpdateUiSnapshot
  )
  const [feedback, setFeedback] = useState<string | null>(null)
  const [atualizando, setAtualizando] = useState(false)
  const feedbackTimer = useRef<number | null>(null)

  const mostrarFeedback = useCallback((mensagem: string) => {
    if (feedbackTimer.current != null) {
      window.clearTimeout(feedbackTimer.current)
    }
    setFeedback(mensagem)
    feedbackTimer.current = window.setTimeout(() => {
      setFeedback(null)
      feedbackTimer.current = null
    }, FEEDBACK_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (feedbackTimer.current != null) {
        window.clearTimeout(feedbackTimer.current)
      }
    }
  }, [])

  async function aoVerificar(): Promise<void> {
    if (checking || atualizando) return
    setFeedback(null)
    const resultado = await verificarAtualizacaoPwa()
    // Waiting: Identidade já mostra "Atualizar agora" via hasWaiting; sem feedback.
    if (resultado === 'waiting') return
    if (resultado === 'atual') {
      mostrarFeedback('Você já está na versão mais recente.')
      return
    }
    if (resultado === 'offline') {
      mostrarFeedback('Sem conexão. Tente novamente quando estiver online.')
      return
    }
    mostrarFeedback('Não foi possível verificar agora.')
  }

  function aoAtualizarAgora(): void {
    if (atualizando) return
    setAtualizando(true)
    void solicitarAtualizacaoApp().finally(() => {
      setAtualizando(false)
    })
  }

  return (
    <div
      className={cn(
        'select-none px-1 text-[11px] leading-snug text-muted-foreground',
        className
      )}
      aria-label="Versão do BoxGestor"
    >
      <p className="font-medium text-muted-foreground">BoxGestor</p>
      <p>Versão {versaoAmigavel}</p>
      {homolog && (
        <>
          <p>Ambiente: Homologação</p>
          <p>Build: {buildCurto}</p>
        </>
      )}

      <div className="mt-2 space-y-1.5 select-auto">
        {hasWaiting ? (
          <>
            <p className="font-medium text-foreground">Atualização disponível</p>
            <Button
              type="button"
              size="sm"
              className="h-7 w-full text-[11px]"
              disabled={atualizando || checking}
              onClick={aoAtualizarAgora}
            >
              {atualizando ? 'Atualizando...' : 'Atualizar agora'}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 w-full text-[11px]"
            disabled={checking || atualizando}
            onClick={() => {
              void aoVerificar()
            }}
          >
            {checking ? 'Verificando...' : 'Verificar atualização'}
          </Button>
        )}
        {feedback && !hasWaiting && (
          <p className="text-[10px] leading-snug text-muted-foreground" role="status">
            {feedback}
          </p>
        )}
      </div>
    </div>
  )
}
