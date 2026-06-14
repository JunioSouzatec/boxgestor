import { Check, Crown, Sparkles, Star, Zap } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAssinatura } from '@/context/AssinaturaContext'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import { podeAlterarPlanoManualmente } from '@/services/auth/permissions'
import { MSG } from '@/lib/mensagens-usuario'
import {
  diasRestantesTrial,
  formatarLimite,
  getLabelPlano,
  getPlanoCatalogo,
  normalizarPlanoTier,
  planoTemLimitesNumericos,
  PLANOS_UI,
  trialExpirado,
  type PlanoTier,
} from '@/types/plano'
import { cn } from '@/lib/utils'

const PLANO_ICONE: Record<PlanoTier, typeof Zap> = {
  trial: Zap,
  essential: Star,
  professional: Sparkles,
  premium: Crown,
}

export function PlanosAssinaturaPage() {
  const { plano, assinatura, fazerUpgrade, uso, limites } = useAssinatura()
  const { session } = useAuth()
  const { toast } = useToast()
  const { confirmar } = useConfirmacao()
  const podeAlterarManual = podeAlterarPlanoManualmente(session?.user)
  const planoAtual = normalizarPlanoTier(plano)
  const catalogoAtual = getPlanoCatalogo(planoAtual)
  const diasTrial = diasRestantesTrial(assinatura)

  function solicitarUpgrade(nomePlano: string) {
    void confirmar({
      titulo: 'Solicitar upgrade',
      mensagem: MSG.solicitarUpgradeContato,
      confirmarTexto: 'Entendi',
      cancelarTexto: 'Fechar',
      destrutivo: false,
    })
    toast.sucesso(`Solicitação registrada para o plano ${nomePlano}. Nossa equipe entrará em contato.`)
  }

  function handleSelecionarPlano(id: PlanoTier) {
    if (!podeAlterarManual) {
      solicitarUpgrade(getLabelPlano(id))
      return
    }
    if (id === planoAtual) return
    const nome = getLabelPlano(id)
    if (
      window.confirm(
        `Alterar para o plano ${nome}? Nenhum pagamento será processado — alteração manual para teste.`
      )
    ) {
      fazerUpgrade(id)
      toast.sucesso(MSG.planoAtualizado)
    }
  }

  const metricasUso = limites
    ? (
        [
          { label: 'Usuários', tipo: 'usuarios' as const, valor: uso.usuarios, max: limites.usuarios },
          { label: 'Clientes', tipo: 'clientes' as const, valor: uso.clientes, max: limites.clientes },
          { label: 'Motos', tipo: 'motos' as const, valor: uso.motos, max: limites.motos },
          {
            label: planoAtual === 'trial' ? 'OS (teste)' : 'OS este mês',
            tipo: 'os_mes' as const,
            valor: uso.os_mes,
            max: limites.os_mes,
          },
        ] as const
      ).filter((m) => m.max !== null)
    : []

  return (
    <div>
      <PageHeader titulo="Planos" descricao="Tabela oficial de preços do Craft Oficina" />

      <Card className="mb-6 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Plano atual da oficina</p>
            <p className="text-2xl font-bold">{getLabelPlano(planoAtual)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {catalogoAtual?.preco_label}
              {catalogoAtual?.duracao_label ? ` · ${catalogoAtual.duracao_label}` : ''}
            </p>
            {planoAtual === 'trial' && diasTrial !== null && (
              <p
                className={cn(
                  'mt-1 text-sm',
                  trialExpirado(assinatura) ? 'text-destructive' : 'text-muted-foreground'
                )}
              >
                {trialExpirado(assinatura)
                  ? 'Período de teste encerrado. Escolha um plano para continuar.'
                  : `${diasTrial} dia(s) restante(s) no teste grátis`}
              </p>
            )}
          </div>
          {planoAtual !== 'premium' && (
            <Button onClick={() => solicitarUpgrade('Profissional')}>Solicitar upgrade</Button>
          )}
        </CardContent>
      </Card>

      {planoTemLimitesNumericos(planoAtual) && metricasUso.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Uso do plano {getLabelPlano(planoAtual)}</CardTitle>
            <CardDescription>Acompanhe os limites do seu plano atual</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metricasUso.map(({ label, valor, max }) => {
              const pct = Math.min(100, Math.round((valor / max!) * 100))
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
                      {valor}/{formatarLimite(max)}
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

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {PLANOS_UI.map((item) => {
          const Icone = PLANO_ICONE[item.id]
          const atual = planoAtual === item.id

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
                  <Badge className="bg-primary text-primary-foreground">Mais indicado</Badge>
                </div>
              )}
              {atual && (
                <div className="absolute right-4 top-4">
                  <Badge variant="success">Plano atual</Badge>
                </div>
              )}

              <CardHeader>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Icone className="h-5 w-5 text-primary" />
                </div>
                <CardTitle>{item.nome}</CardTitle>
                {item.publico_alvo && (
                  <p className="text-xs text-muted-foreground">Para: {item.publico_alvo}</p>
                )}
                <CardDescription>{item.descricao}</CardDescription>
                <p className="pt-2 text-2xl font-bold">{item.preco_label}</p>
                {item.duracao_label && (
                  <p className="text-xs text-muted-foreground">Duração: {item.duracao_label}</p>
                )}
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
                    Plano atual
                  </Button>
                ) : podeAlterarManual ? (
                  <Button className="w-full" onClick={() => handleSelecionarPlano(item.id)}>
                    Selecionar plano
                  </Button>
                ) : (
                  <Button className="w-full" variant="outline" onClick={() => solicitarUpgrade(item.nome)}>
                    Solicitar upgrade
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Para alterar seu plano, use o botão Solicitar upgrade ou fale com o suporte Craft.
      </p>
    </div>
  )
}
