import { useCallback, useEffect, useState } from 'react'
import { Check, Crown, Sparkles, Star, Zap } from 'lucide-react'
import { APP_NAME } from '@/lib/app-brand'
import { PageHeader } from '@/components/layout/PageHeader'
import { AjudaTooltip } from '@/components/shared/AjudaTooltip'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAssinatura } from '@/context/AssinaturaContext'
import { useAuth } from '@/context/AuthContext'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { useToast } from '@/context/ToastContext'
import { obterNomeExibidoOficina } from '@/lib/oficina-marca'
import { MSG } from '@/lib/mensagens-usuario'
import { upgradeRequestsService } from '@/services/assinatura/upgrade-requests.service'
import {
  diasRestantesTrial,
  formatarLimite,
  getLabelPlano,
  getPlanoCatalogo,
  normalizarPlanoTier,
  ORDEM_PLANO,
  planoTemLimitesNumericos,
  PLANOS_UI,
  trialExpirado,
  type PlanoTier,
} from '@/types/plano'
import {
  badgeVariantUpgradeStatus,
  STATUS_UPGRADE_LABEL,
  type UpgradeRequest,
} from '@/types/upgrade-request'
import { cn } from '@/lib/utils'

const PLANO_ICONE: Record<PlanoTier, typeof Zap> = {
  trial: Zap,
  essential: Star,
  professional: Sparkles,
  premium: Crown,
}

const PLANOS_PAGOS: PlanoTier[] = ['essential', 'professional', 'premium']

export function PlanosAssinaturaPage() {
  const { oficinaId } = useCraft()
  const { configuracao } = useOficinaData()
  const { plano, assinatura, uso, limites, testeAtivo } = useAssinatura()
  const { session, estadoAuth } = useAuth()
  const { toast } = useToast()
  const [solicitacoes, setSolicitacoes] = useState<UpgradeRequest[]>([])
  const [enviando, setEnviando] = useState<PlanoTier | null>(null)

  const planoAtual = normalizarPlanoTier(plano)
  const catalogoAtual = getPlanoCatalogo(planoAtual)
  const diasTrial = diasRestantesTrial(assinatura)
  const nomeOficina = obterNomeExibidoOficina(configuracao)

  const recarregarSolicitacoes = useCallback(() => {
    setSolicitacoes(upgradeRequestsService.listarPorOficina(oficinaId))
  }, [oficinaId])

  useEffect(() => {
    recarregarSolicitacoes()
    const handler = () => recarregarSolicitacoes()
    window.addEventListener('craft-upgrade-requests-updated', handler)
    return () => window.removeEventListener('craft-upgrade-requests-updated', handler)
  }, [recarregarSolicitacoes])

  const temPendente = solicitacoes.some((s) => s.status === 'pending')

  function rotuloBotaoPlano(id: PlanoTier): string {
    if (ORDEM_PLANO[id] > ORDEM_PLANO[planoAtual]) return 'Solicitar upgrade'
    return 'Solicitar mudança de plano'
  }

  function solicitarPlano(id: PlanoTier) {
    if (!session?.user) return
    if (id === planoAtual) return
    if (estadoAuth === 'oficina_arquivada') {
      toast.atencao(MSG.oficinaArquivadaUpgrade)
      return
    }

    setEnviando(id)
    try {
      upgradeRequestsService.criar({
        office_id: oficinaId,
        office_nome: nomeOficina,
        current_plan: planoAtual,
        requested_plan: id,
        solicitante: session.user,
      })
      toast.sucesso(MSG.solicitacaoUpgradeEnviada)
      recarregarSolicitacoes()
    } catch (err) {
      toast.erro(err instanceof Error ? err.message : MSG.erroSalvar)
    } finally {
      setEnviando(null)
    }
  }

  const metricasUso = limites
    ? (
        [
          { label: 'Usuários', tipo: 'usuarios' as const, valor: uso.usuarios, max: limites.usuarios },
          { label: 'Clientes', tipo: 'clientes' as const, valor: uso.clientes, max: limites.clientes },
          { label: 'Motos', tipo: 'motos' as const, valor: uso.motos, max: limites.motos },
          {
            label: planoAtual === 'trial' ? 'OS (período de teste)' : 'OS este mês',
            tipo: 'os_mes' as const,
            valor: planoAtual === 'trial' ? uso.os_total : uso.os_mes,
            max: limites.os_mes,
          },
        ] as const
      ).filter((m) => m.max !== null)
    : []

  const planosExibir = PLANOS_UI.filter(
    (p) => p.id === 'trial' || PLANOS_PAGOS.includes(p.id)
  )

  return (
    <div>
      <PageHeader
        titulo="Planos"
        descricao={
          <span className="inline-flex flex-wrap items-center gap-2">
            Planos e preços do {APP_NAME}
            <AjudaTooltip texto="No Teste Premium você acessa todos os recursos por 7 dias." />
          </span>
        }
      />

      <div className="mb-6 space-y-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-4 text-sm text-muted-foreground">
        <p>{MSG.testePremiumComece}</p>
        <p>{MSG.testePremiumDepoisPlano}</p>
        <p>{MSG.testePremiumDadosSalvos}</p>
      </div>

      <Card className="mb-6 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Plano atual da oficina</p>
            <p className="text-2xl font-bold">{getLabelPlano(planoAtual)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {MSG.planoAtualLabel(getLabelPlano(planoAtual))}
            </p>
            <p className="text-sm text-muted-foreground">
              {catalogoAtual?.preco_label}
              {catalogoAtual?.duracao_label ? ` · ${catalogoAtual.duracao_label}` : ''}
            </p>
            {planoAtual === 'trial' && diasTrial !== null && (
              <div className="mt-2 space-y-0.5 text-sm">
                {assinatura.trial_inicio_em && (
                  <p className="text-muted-foreground">
                    Início do teste:{' '}
                    {new Date(assinatura.trial_inicio_em).toLocaleDateString('pt-BR')}
                  </p>
                )}
                <p
                  className={cn(
                    trialExpirado(assinatura) ? 'text-destructive' : 'text-muted-foreground'
                  )}
                >
                  {trialExpirado(assinatura)
                    ? `${MSG.testePremiumEncerrado} ${MSG.testePremiumEscolherPlano}`
                    : testeAtivo
                      ? `Teste Premium — ${diasTrial} dia(s) restante(s)`
                      : null}
                </p>
              </div>
            )}
            {temPendente && (
              <p className="mt-2 text-sm text-amber-400">{MSG.aguardandoConfirmacaoSuporte}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {solicitacoes.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Suas solicitações</CardTitle>
            <CardDescription>Acompanhe o status dos pedidos enviados ao suporte</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {solicitacoes.map((req) => (
                <div
                  key={req.id}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{getLabelPlano(req.requested_plan)}</p>
                    <p className="text-xs text-muted-foreground">
                      De {getLabelPlano(req.current_plan)} ·{' '}
                      {new Date(req.created_at).toLocaleString('pt-BR')}
                    </p>
                    {req.note && req.status === 'rejected' && (
                      <p className="mt-1 text-xs text-muted-foreground">Obs.: {req.note}</p>
                    )}
                  </div>
                  <Badge variant={badgeVariantUpgradeStatus(req.status)}>
                    {STATUS_UPGRADE_LABEL[req.status]}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
        {planosExibir.map((item) => {
          const Icone = PLANO_ICONE[item.id]
          const atual = planoAtual === item.id
          const pendenteEstePlano = upgradeRequestsService.temPendente(oficinaId, item.id)

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
                ) : item.id === 'trial' ? (
                  <Button disabled variant="outline" className="w-full">
                    Teste automático
                  </Button>
                ) : pendenteEstePlano ? (
                  <Button disabled variant="outline" className="w-full">
                    {MSG.aguardandoConfirmacaoSuporte}
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant="outline"
                    disabled={enviando === item.id}
                    onClick={() => solicitarPlano(item.id)}
                  >
                    {enviando === item.id ? 'Enviando…' : rotuloBotaoPlano(item.id)}
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Para alterar seu plano, use Solicitar upgrade ou fale com o suporte {APP_NAME}. A troca é
        confirmada manualmente pela nossa equipe.
      </p>
    </div>
  )
}
