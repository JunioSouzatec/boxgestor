import { AlertTriangle } from 'lucide-react'
import { useAssinatura } from '@/context/AssinaturaContext'
import { mensagemLimite, type TipoLimite } from '@/services/assinatura/plano-features'
import { getLabelPlano, planoTemLimitesNumericos } from '@/types/plano'
import { BotaoUpgrade } from '@/components/plano/BotaoUpgrade'
import { cn } from '@/lib/utils'

interface AvisoLimitePlanoProps {
  tipo: TipoLimite
  className?: string
}

export function AvisoLimitePlano({ tipo, className }: AvisoLimitePlanoProps) {
  const { plano, limites, uso, limiteAtingido, proximoDoLimite } = useAssinatura()

  if (!limites || !planoTemLimitesNumericos(plano)) return null

  const max = limites[tipo]
  if (max === null) return null

  const atingido = limiteAtingido(tipo)
  const proximo = proximoDoLimite(tipo)

  if (!atingido && !proximo) return null

  return (
    <div
      className={cn(
        'mb-4 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between',
        atingido
          ? 'border-destructive/40 bg-destructive/10'
          : 'border-amber-500/40 bg-amber-500/10',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={cn('mt-0.5 h-5 w-5 shrink-0', atingido ? 'text-destructive' : 'text-amber-400')}
        />
        <div>
          <p className="font-medium">
            {atingido
              ? 'Limite do plano atingido'
              : `Próximo do limite — ${getLabelPlano(plano)}`}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {atingido
              ? mensagemLimite(tipo)
              : `Você usa ${uso[tipo]} de ${max}. ${mensagemLimite(tipo)}`}
          </p>
        </div>
      </div>
      <BotaoUpgrade variant="outline" className="shrink-0" />
    </div>
  )
}
