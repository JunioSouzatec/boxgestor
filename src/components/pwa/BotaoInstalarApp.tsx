import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePwaInstall } from '@/hooks/usePwaInstall'
import { cn } from '@/lib/utils'

interface BotaoInstalarAppProps {
  variant?: 'header' | 'settings'
  className?: string
}

export function BotaoInstalarApp({ variant = 'header', className }: BotaoInstalarAppProps) {
  const { canInstall, installed, install } = usePwaInstall()

  if (installed) {
    if (variant === 'settings') {
      return (
        <p className="text-sm text-emerald-400">
          App instalado — o Craft Oficina está disponível como aplicativo.
        </p>
      )
    }
    return null
  }

  if (!canInstall) {
    if (variant === 'settings') {
      return (
        <p className="text-sm text-muted-foreground">
          A instalação aparecerá aqui quando o navegador permitir (Chrome ou Edge no Windows).
          Use também o menu do navegador: Instalar aplicativo.
        </p>
      )
    }
    return null
  }

  if (variant === 'header') {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => void install()}
        className={cn('gap-1.5 text-xs border-primary/30 text-primary', className)}
        title="Instalar Craft Oficina no computador"
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden md:inline">Instalar app</span>
      </Button>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      <p className="text-sm text-muted-foreground">
        Instale o Craft Oficina no Windows para abrir em janela própria, com ícone na área de
        trabalho e suporte offline após o primeiro carregamento.
      </p>
      <Button onClick={() => void install()} className="gap-2 w-fit">
        <Download className="h-4 w-4" />
        Instalar app
      </Button>
    </div>
  )
}
