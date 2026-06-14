import { Link } from 'react-router-dom'
import { Crown, Sparkles, Star, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useAssinatura } from '@/context/AssinaturaContext'
import { useAuth } from '@/context/AuthContext'
import { getLabelPlano, normalizarPlanoTier, type PlanoTier } from '@/types/plano'
import { cn } from '@/lib/utils'

const PLANO_ESTILO: Record<
  PlanoTier,
  { variant: 'secondary' | 'default' | 'warning'; icone: typeof Zap }
> = {
  trial: { variant: 'secondary', icone: Zap },
  essential: { variant: 'default', icone: Star },
  professional: { variant: 'default', icone: Sparkles },
  premium: { variant: 'warning', icone: Crown },
}

interface PlanoBadgeProps {
  link?: boolean
  className?: string
}

export function PlanoBadge({ link = true, className }: PlanoBadgeProps) {
  const { plano } = useAssinatura()
  const { session } = useAuth()
  const planoNormalizado = normalizarPlanoTier(plano)
  const estilo = PLANO_ESTILO[planoNormalizado]
  const Icone = estilo.icone
  const podeVerPlanos = session?.user.papel === 'dono'

  const badge = (
    <Badge
      variant={estilo.variant}
      className={cn('gap-1.5 px-2.5 py-1 font-medium', className)}
    >
      <Icone className="h-3.5 w-3.5" />
      {getLabelPlano(planoNormalizado)}
    </Badge>
  )

  if (link && podeVerPlanos) {
    return (
      <Link to="/planos" title="Ver planos e assinatura">
        {badge}
      </Link>
    )
  }

  return badge
}
