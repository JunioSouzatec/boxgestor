import { Link } from 'react-router-dom'
import { AlertCircle, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAssinatura } from '@/context/AssinaturaContext'
import { useAuth } from '@/context/AuthContext'
import { MSG } from '@/lib/mensagens-usuario'
import { APP_NAME, APP_SUPPORT_EMAIL } from '@/lib/app-brand'
import { cn } from '@/lib/utils'

interface AvisoTesteExpiradoProps {
  className?: string
  compacto?: boolean
}

export function AvisoTesteExpirado({ className, compacto = false }: AvisoTesteExpiradoProps) {
  const { testeExpirado } = useAssinatura()
  const { session } = useAuth()
  const ehDono = session?.user.papel === 'dono'

  if (!testeExpirado) return null

  if (compacto) {
    return (
      <p className={cn('text-sm text-destructive', className)}>{MSG.testeExpiradoCurto}</p>
    )
  }

  return (
    <div
      className={cn(
        'border-b border-destructive/30 bg-destructive/10 px-4 py-3 sm:px-6',
        className
      )}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-destructive">Seu Teste Premium terminou.</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Escolha um plano para continuar usando o {APP_NAME}. Seus dados permanecem salvos.
            </p>
          </div>
        </div>
        {ehDono && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/planos">Ver planos</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <a href={`mailto:${APP_SUPPORT_EMAIL}?subject=Upgrade%20${encodeURIComponent(APP_NAME)}`}>
                <MessageCircle className="h-4 w-4" />
                Falar com suporte
              </a>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
