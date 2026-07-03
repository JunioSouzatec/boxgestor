import { Mic, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSpeechToText } from '@/hooks/useSpeechToText'
import { cn } from '@/lib/utils'

interface BotaoDitadoVozProps {
  onTranscricao: (texto: string, modo: 'substituir' | 'complementar') => void
  textoAtual?: string
  className?: string
  size?: 'sm' | 'icon'
}

export function BotaoDitadoVoz({
  onTranscricao,
  textoAtual = '',
  className,
  size = 'icon',
}: BotaoDitadoVozProps) {
  const { suportado, ouvindo, erro, ultimaTranscricao, alternar } = useSpeechToText({
    onTranscricao: (texto) => {
      const complementar = textoAtual.trim().length > 0
      const merged = complementar ? `${textoAtual.trim()} ${texto}`.trim() : texto
      onTranscricao(merged, complementar ? 'complementar' : 'substituir')
    },
  })

  if (!suportado) {
    return (
      <p className="text-[10px] text-muted-foreground" title="Ditado por voz indisponível neste navegador">
        Ditado indisponível
      </p>
    )
  }

  return (
    <div className={cn('flex flex-col items-end gap-0.5', className)}>
      <Button
        type="button"
        variant={ouvindo ? 'default' : 'outline'}
        size={size}
        className={cn(size === 'icon' && 'h-8 w-8 shrink-0')}
        onClick={alternar}
        title={ouvindo ? 'Parar ditado' : 'Ditar observação por voz'}
        aria-label={ouvindo ? 'Parar ditado por voz' : 'Iniciar ditado por voz'}
      >
        {ouvindo ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </Button>
      {ouvindo && <span className="text-[10px] text-primary">Ouvindo...</span>}
      {!ouvindo && ultimaTranscricao && (
        <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Transcrição adicionada</span>
      )}
      {erro && <span className="max-w-[140px] text-right text-[10px] text-destructive">{erro}</span>}
    </div>
  )
}
