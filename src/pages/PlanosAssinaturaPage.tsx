import { Check, Crown, Sparkles, Zap } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { BotaoUpgrade } from '@/components/plano/BotaoUpgrade'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAssinatura } from '@/context/AssinaturaContext'
import { useAuth } from '@/context/AuthContext'
import {
  getLabelPlano,
  ORDEM_PLANO,
  PLANOS_CATALOGO,
  type PlanoTier,
} from '@/types/plano'
import { cn } from '@/lib/utils'

const PLANO_ICONE = {
  free: Zap,
  profissional: Sparkles,
  premium: Crown,
} as const

export function PlanosAssinaturaPage() {
  const { plano, assinatura, fazerUpgrade, uso, limites } = useAssinatura()
  const { session } = useAuth()

  function handleSelecionarPlano(id: PlanoTier) {
    if (id === plano) return
    const nome = getLabelPlano(id)
    if (
      window.confirm(
        `Simular upgrade para o plano ${nome}? Nenhum pagamento será processado — apenas localStorage.`
      )
    ) {
      fazerUpgrade(id)
    }
  }

  return (
    <div>
      <PageHeader
        titulo="Planos e Assinatura"
        descricao="Gerencie o plano da sua oficina no Craft"
      />

      <Card className="mb-6 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Plano atual</p>
            <p className="text-2xl font-bold">{getLabelPlano(plano)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Oficina: {session?.user.office_id} · Atualizado em{' '}
              {new Date(assinatura.updated_at).toLocaleDateString('pt-BR')}
            </p>
          </div>
          {plano !== 'premium' && <BotaoUpgrade size="default" />}
        </CardContent>
      </Card>

      {plano === 'free' && limites && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Uso do plano Free</CardTitle>
            <CardDescription>Acompanhe os limites do seu plano atual</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {(
              [
                { label: 'Clientes', valor: uso.clientes, max: limites.clientes },
                { label: 'Motos', valor: uso.motos, max: limites.motos },
                { label: 'OS este mês', valor: uso.os_mes, max: limites.os_mes },
              ] as const
            ).map(({ label, valor, max }) => {
              const pct = Math.min(100, Math.round((valor / max) * 100))
              const critico = pct >= 100
              const alerta = pct >= 80 && pct < 100
              return (
                <div key={label} className="rounded-lg border border-border bg-muted/20 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{label}</p>
                    <span
                      className={cn(
                        'text-xs font-medium',
                        critico && 'text-destructive',
                        alerta && 'text-amber-400',
                        !critico && !alerta && 'text-muted-foreground'
                      )}
                    >
                      {valor}/{max}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        critico ? 'bg-destructive' : alerta ? 'bg-amber-500' : 'bg-primary'
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {PLANOS_CATALOGO.map((item) => {
          const Icone = PLANO_ICONE[item.id]
          const atual = item.id === plano
          const upgrade = ORDEM_PLANO[item.id] > ORDEM_PLANO[plano]

          return (
            <Card
              key={item.id}
              className={cn(
                'relative flex flex-col',
                item.destaque && 'border-primary/40 shadow-lg shadow-primary/5',
                atual && 'ring-2 ring-primary'
              )}
            >
              {item.destaque && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">Mais popular</Badge>
                </div>
              )}
              {atual && (
                <div className="absolute right-4 top-4">
                  <Badge variant="success">Seu plano</Badge>
                </div>
              )}

              <CardHeader>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Icone className="h-5 w-5 text-primary" />
                </div>
                <CardTitle>{item.nome}</CardTitle>
                <CardDescription>{item.descricao}</CardDescription>
                <p className="pt-2 text-3xl font-bold">{item.preco_label}</p>
              </CardHeader>

              <CardContent className="flex flex-1 flex-col">
                <ul className="mb-6 flex-1 space-y-2">
                  {item.recursos.map((recurso) => (
                    <li key={recurso} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{recurso}</span>
                    </li>
                  ))}
                </ul>

                {atual ? (
                  <Button disabled variant="outline" className="w-full">
                    Plano ativo
                  </Button>
                ) : upgrade ? (
                  <Button className="w-full" onClick={() => handleSelecionarPlano(item.id)}>
                    Fazer upgrade
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleSelecionarPlano(item.id)}
                  >
                    Alterar plano
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Pagamentos reais serão integrados futuramente via Stripe ou gateway brasileiro. Por
        enquanto, a alteração de plano é simulada no localStorage.
      </p>
    </div>
  )
}
