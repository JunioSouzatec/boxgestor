import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { useAssinatura } from '@/context/AssinaturaContext'
import { useToast } from '@/context/ToastContext'
import { useCraft } from '@/context/CraftContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MSG } from '@/lib/mensagens-usuario'
import {
  getLabelPlano,
  normalizarPlanoTier,
  PLANOS_UI,
  type PlanoTier,
} from '@/types/plano'
import { cn } from '@/lib/utils'

export function AdminPlanosOficinaCard() {
  const { oficinaId } = useCraft()
  const { plano, fazerUpgrade } = useAssinatura()
  const { toast } = useToast()
  const [salvando, setSalvando] = useState(false)
  const planoAtual = normalizarPlanoTier(plano)

  function alterarPlano(id: PlanoTier) {
    if (id === planoAtual) return
    const nome = getLabelPlano(id)
    if (
      !window.confirm(
        `Alterar plano da oficina ${oficinaId} para ${nome}? Uso interno de suporte — sem cobrança.`
      )
    ) {
      return
    }
    setSalvando(true)
    try {
      fazerUpgrade(id)
      toast.sucesso(MSG.planoAtualizado)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Alterar plano manualmente</CardTitle>
        <CardDescription>
          Ferramenta de suporte. Oficinas clientes devem solicitar upgrade pelo fluxo comercial.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          Plano atual: <strong>{getLabelPlano(planoAtual)}</strong>
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PLANOS_UI.map((item) => {
            const atual = planoAtual === item.id
            return (
              <div
                key={item.id}
                className={cn(
                  'rounded-lg border p-4',
                  atual ? 'border-primary ring-1 ring-primary' : 'border-border'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{item.nome}</p>
                  {atual && (
                    <Badge variant="success" className="text-[10px]">
                      Atual
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{item.preco_label}</p>
                <Button
                  size="sm"
                  variant={atual ? 'outline' : 'default'}
                  className="mt-3 w-full"
                  disabled={atual || salvando}
                  onClick={() => alterarPlano(item.id)}
                >
                  {salvando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : atual ? (
                    <>
                      <Check className="mr-1 h-4 w-4" />
                      Ativo
                    </>
                  ) : (
                    'Aplicar plano'
                  )}
                </Button>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
