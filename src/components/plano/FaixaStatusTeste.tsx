import { Sparkles } from 'lucide-react'
import { useAssinatura } from '@/context/AssinaturaContext'
import { normalizarPlanoTier } from '@/types/plano'
import { cn } from '@/lib/utils'

/** Faixa no topo do app durante o Teste Premium ativo. */
export function FaixaStatusTeste() {
  const { assinatura, testeAtivo, diasRestantesTeste } = useAssinatura()
  const plano = normalizarPlanoTier(assinatura.plano)

  if (plano !== 'trial' || !testeAtivo || diasRestantesTeste === null) return null

  return (
    <div
      className={cn(
        'border-b border-primary/20 bg-primary/5 px-4 py-2 text-center text-sm text-muted-foreground sm:px-6'
      )}
    >
      <Sparkles className="mr-1.5 inline h-4 w-4 text-primary" />
      <span className="text-foreground font-medium">
        Teste Premium — {diasRestantesTeste} dia{diasRestantesTeste === 1 ? '' : 's'} restante
        {diasRestantesTeste === 1 ? '' : 's'}
      </span>
    </div>
  )
}
