/**
 * RC2 Gestor Inteligente Fase 2 — painel executivo com drilldown.
 * Somente leitura. Sem biblioteca de gráficos externa.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Banknote,
  Brain,
  CheckCircle2,
  ClipboardList,
  Package,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react'
import { RecursoPlanoGate } from '@/components/plano/RecursoPlanoGate'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/context/AuthContext'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { podeAcessarModuloUsuario, podeVerFinanceiroCompleto } from '@/services/auth/permissions'
import { TelaSemPermissao } from '@/components/layout/TelaSemPermissao'
import { formatarData, formatarMoeda } from '@/lib/utils'
import { getDataLocalHoje } from '@/lib/data-local'
import { obterComissoesConfig } from '@/types/comissoes'
import {
  calcularIntervaloGestorPreset,
  calcularPainelGestorInteligente,
  getLabelPeriodoGestor,
  type PeriodoGestorPreset,
  type TipoPainelGestor,
} from '@/services/gestor-inteligente.service'
import {
  construirDetalheGestor,
  type GestorDetalheTipo,
  type GestorDetalheView,
} from '@/services/gestor-detalhe.service'
import {
  comissaoItensDisponivel,
  listarItensComissaoOficina,
} from '@/services/comissoes/comissao-itens.service'
import {
  calcularResumoCaixa,
  listarSessoesCaixa,
  obterCaixaAberto,
} from '@/services/caixa/caixa.service'
import type { ResumoCaixa, SessaoCaixa } from '@/types/caixa'
import { StatusOSBadge } from '@/components/shared/StatusBadges'
import {
  AlertCards,
  AreaChartCard,
  DonutChartCard,
  FormasPagamentoChart,
  FuncionariosProdutividadeChart,
  GestorMetricCard,
  InsightCards,
  RankingBarList,
} from '@/components/gestor-inteligente/GestorCharts'
import { GestorDetalheModal } from '@/components/gestor-inteligente/GestorDetalheModal'

const PRESETS: PeriodoGestorPreset[] = ['hoje', '7dias', '30dias', 'mes', 'personalizado']
const TIPOS: { id: TipoPainelGestor; label: string }[] = [
  { id: 'geral', label: 'Geral' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'os', label: 'OS' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'funcionarios', label: 'Funcionários' },
]

export function GestorInteligentePage() {
  const { session } = useAuth()
  const { oficinaId } = useCraft()
  const {
    configuracao,
    clientes,
    motos,
    ordens,
    pecas,
    lancamentos,
    movimentacoesEstoque,
    perfisComissao,
    fornecedores,
  } = useOficinaData()

  const user = session?.user
  const podeAcessar =
    Boolean(user) &&
    podeAcessarModuloUsuario(user, 'gestor_inteligente', configuracao) &&
    podeVerFinanceiroCompleto(user, configuracao)

  const hoje = getDataLocalHoje()
  const [periodo, setPeriodo] = useState<PeriodoGestorPreset>('30dias')
  const [tipo, setTipo] = useState<TipoPainelGestor>('geral')
  const [dataInicio, setDataInicio] = useState(hoje)
  const [dataFim, setDataFim] = useState(hoje)
  const [comissaoAberta, setComissaoAberta] = useState<number | undefined>(undefined)
  const [openByEmployee, setOpenByEmployee] = useState<Map<string, number> | undefined>()
  const [caixaSessao, setCaixaSessao] = useState<SessaoCaixa | null>(null)
  const [caixaResumo, setCaixaResumo] = useState<ResumoCaixa | null>(null)
  const [caixaDiffFechado, setCaixaDiffFechado] = useState<SessaoCaixa | null>(null)
  const [carregandoExtra, setCarregandoExtra] = useState(false)
  const [detalheAberto, setDetalheAberto] = useState(false)
  const [detalheView, setDetalheView] = useState<GestorDetalheView | null>(null)

  const configComissoes = useMemo(() => obterComissoesConfig(configuracao), [configuracao])

  const intervalo = useMemo(
    () =>
      calcularIntervaloGestorPreset(periodo, new Date(), {
        inicio: dataInicio,
        fim: dataFim,
      }),
    [periodo, dataInicio, dataFim]
  )

  const carregarExtras = useCallback(async () => {
    if (!podeAcessar) return
    setCarregandoExtra(true)
    try {
      if (comissaoItensDisponivel()) {
        const mes = intervalo.fim.slice(0, 7)
        const itens = await listarItensComissaoOficina(oficinaId, { competenceMonth: mes })
        const ativos = itens.filter((i) => i.status !== 'cancelado' && !i.adjustment_of_item_id)
        const total = Math.round(ativos.reduce((a, i) => a + i.open_amount, 0) * 100) / 100
        const mapa = new Map<string, number>()
        for (const i of ativos) {
          mapa.set(
            i.employee_id,
            Math.round(((mapa.get(i.employee_id) ?? 0) + i.open_amount) * 100) / 100
          )
        }
        setComissaoAberta(total)
        setOpenByEmployee(mapa)
      } else {
        setComissaoAberta(undefined)
        setOpenByEmployee(undefined)
      }

      const aberto = await obterCaixaAberto(oficinaId)
      if (aberto.ok && aberto.dados) {
        setCaixaSessao(aberto.dados)
        const resumo = await calcularResumoCaixa(oficinaId, aberto.dados.id)
        setCaixaResumo(resumo.ok ? resumo.dados ?? null : null)
        setCaixaDiffFechado(null)
      } else {
        setCaixaSessao(null)
        setCaixaResumo(null)
        const sessoes = await listarSessoesCaixa(oficinaId, { status: 'closed', limite: 1 })
        const ultima =
          sessoes.ok && sessoes.dados?.length
            ? sessoes.dados.find((s) => s.difference != null && Math.abs(s.difference) > 0.009) ??
              sessoes.dados[0]
            : null
        setCaixaDiffFechado(ultima ?? null)
      }
    } finally {
      setCarregandoExtra(false)
    }
  }, [podeAcessar, oficinaId, intervalo.fim])

  useEffect(() => {
    void carregarExtras()
  }, [carregarExtras])

  const painel = useMemo(() => {
    if (!podeAcessar) return null
    return calcularPainelGestorInteligente({
      dados: { clientes, motos, ordens, pecas, lancamentos, movimentacoesEstoque },
      intervalo,
      perfis: perfisComissao,
      configComissoes,
      comissaoEmAbertoTotal: comissaoAberta,
      openByEmployee,
      caixa: {
        sessao: caixaSessao ?? caixaDiffFechado,
        resumo: caixaResumo,
      },
    })
  }, [
    podeAcessar,
    clientes,
    motos,
    ordens,
    pecas,
    lancamentos,
    movimentacoesEstoque,
    intervalo,
    perfisComissao,
    configComissoes,
    comissaoAberta,
    openByEmployee,
    caixaSessao,
    caixaDiffFechado,
    caixaResumo,
  ])

  if (!user || !podeAcessar) {
    return <TelaSemPermissao tituloPagina="Gestor Inteligente" />
  }

  if (!painel) return null

  const painelAtual = painel
  const showFinanceiro = tipo === 'geral' || tipo === 'financeiro'
  const showOs = tipo === 'geral' || tipo === 'os'
  const showEstoque = tipo === 'geral' || tipo === 'estoque'
  const showFunc = tipo === 'geral' || tipo === 'funcionarios'

  function abrirDetalhe(
    detalheTipo: GestorDetalheTipo,
    extras?: { filtroNome?: string; filtroFuncionarioId?: string; filtroStatusKey?: string }
  ) {
    const view = construirDetalheGestor(detalheTipo, {
      painel: painelAtual,
      dados: { clientes, motos, ordens, pecas, lancamentos, movimentacoesEstoque },
      fornecedores,
      perfis: perfisComissao,
      configComissoes,
      filtroNome: extras?.filtroNome,
      filtroFuncionarioId: extras?.filtroFuncionarioId,
      filtroStatusKey: extras?.filtroStatusKey,
    })
    setDetalheView(view)
    setDetalheAberto(true)
  }

  return (
    <RecursoPlanoGate recurso="financeiro_basico" pagina>
      <div className="-mx-4 -mt-4 space-y-6 bg-gradient-to-b from-primary/5 via-background to-background px-4 pb-8 pt-4 sm:-mx-6 sm:px-6 sm:pt-6">
        <header className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-zinc-950 via-zinc-900 to-primary/20 p-5 text-zinc-50 shadow-lg sm:p-7">
          <div className="pointer-events-none absolute -right-10 top-0 h-40 w-40 rounded-full bg-primary/30 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-200">
                <Brain className="h-3.5 w-3.5 text-primary" />
                Gestor Inteligente
              </div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Visão executiva da oficina
              </h1>
              <p className="mt-2 text-sm text-zinc-300 sm:text-base">
                Entenda faturamento, OS, estoque, caixa e produtividade em tempo real.
              </p>
            </div>
            <Badge variant="outline" className="border-white/20 bg-white/5 text-zinc-100">
              {painel.intervalo.label}: {formatarData(painel.intervalo.inicio)} —{' '}
              {formatarData(painel.intervalo.fim)}
            </Badge>
          </div>
        </header>

        <div className="space-y-3 rounded-2xl border border-border bg-card/70 p-4 shadow-sm backdrop-blur">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p}
                type="button"
                size="sm"
                variant={periodo === p ? 'default' : 'outline'}
                onClick={() => setPeriodo(p)}
              >
                {getLabelPeriodoGestor(p)}
              </Button>
            ))}
          </div>
          {periodo === 'personalizado' && (
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <Label htmlFor="gi-inicio">De</Label>
                <Input
                  id="gi-inicio"
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="gi-fim">Até</Label>
                <Input
                  id="gi-fim"
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                />
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            {TIPOS.map((t) => (
              <Button
                key={t.id}
                type="button"
                size="sm"
                variant={tipo === t.id ? 'secondary' : 'ghost'}
                onClick={() => setTipo(t.id)}
              >
                {t.label}
              </Button>
            ))}
            {carregandoExtra && (
              <span className="self-center text-xs text-muted-foreground">
                Atualizando caixa e comissões…
              </span>
            )}
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Insights do período
          </h2>
          <InsightCards insights={painel.insights} />
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {showFinanceiro && (
            <>
              <GestorMetricCard
                titulo="Faturamento do período"
                valor={painel.faturamento}
                monetario
                icone={TrendingUp}
                tom="success"
                detalhe={
                  painel.melhorDiaFaturamento
                    ? `Melhor dia no período: ${painel.melhorDiaFaturamento.label}`
                    : `${painel.qtdPagamentosRecebidos} pagamentos recebidos`
                }
                onAbrirDetalhe={() => abrirDetalhe('faturamento')}
              />
              <GestorMetricCard
                titulo="Recebido"
                valor={painel.totalRecebido}
                monetario
                icone={Wallet}
                tom="info"
                detalhe={`${painel.qtdPagamentosRecebidos} pagamentos no período`}
                onAbrirDetalhe={() => abrirDetalhe('recebido')}
              />
              <GestorMetricCard
                titulo="A receber"
                valor={painel.aReceber}
                monetario
                icone={Banknote}
                tom="warning"
                detalhe={`${painel.osAReceberQtd} OS com saldo pendente`}
                onAbrirDetalhe={() => abrirDetalhe('a_receber')}
              />
              <GestorMetricCard
                titulo="Comissão em aberto"
                valor={painel.comissaoEmAberto}
                monetario
                icone={Users}
                tom="warning"
                detalhe="Saldo da oficina com a equipe"
                onAbrirDetalhe={() => abrirDetalhe('comissao_aberta')}
              />
            </>
          )}
          {showOs && (
            <>
              <GestorMetricCard
                titulo="OS abertas"
                valor={painel.osAbertas}
                icone={ClipboardList}
                tom="info"
                detalhe="Em andamento agora · toque para detalhar"
                onAbrirDetalhe={() => abrirDetalhe('os_abertas')}
              />
              <GestorMetricCard
                titulo="OS finalizadas"
                valor={painel.osFinalizadas}
                icone={CheckCircle2}
                tom="success"
                detalhe={`${painel.osFinalizadas} OS no período`}
                onAbrirDetalhe={() => abrirDetalhe('os_finalizadas')}
              />
              <GestorMetricCard
                titulo="Ticket médio"
                valor={painel.ticketMedio}
                monetario
                icone={Wrench}
                detalhe="Faturamento ÷ OS concluídas"
              />
            </>
          )}
          {showEstoque && (
            <GestorMetricCard
              titulo="Estoque baixo"
              valor={painel.estoqueBaixo}
              icone={Package}
              tom={painel.estoqueBaixo > 0 ? 'warning' : 'default'}
              detalhe={
                painel.estoqueBaixo > 0
                  ? `${painel.estoqueBaixo} itens em alerta`
                  : 'Nenhum item em alerta'
              }
              onAbrirDetalhe={() => abrirDetalhe('estoque_baixo')}
            />
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          {showFinanceiro && (
            <AreaChartCard
              titulo="Evolução do faturamento no período"
              subtitulo="Faturamento diário conforme o período selecionado."
              pontos={painel.faturamentoPorDia}
              total={painel.faturamento}
              melhorDia={painel.melhorDiaFaturamento}
              onAbrirDetalhe={() => abrirDetalhe('evolucao_faturamento')}
            />
          )}
          {showOs && (
            <DonutChartCard
              titulo="Status das OS"
              fatias={painel.osStatusFatias}
              onAbrirDetalhe={() => abrirDetalhe('status_os')}
              onFatiaClick={(key) =>
                abrirDetalhe('status_os', { filtroStatusKey: key })
              }
            />
          )}
          {showOs && (
            <RankingBarList
              titulo="Serviços que mais vendem"
              itens={painel.topServicos}
              onItemClick={(item) =>
                abrirDetalhe('servico', { filtroNome: item.nome })
              }
            />
          )}
          {showEstoque && (
            <RankingBarList
              titulo="Peças que mais saem"
              itens={painel.topPecas}
              modo="quantidade"
              unidade="un."
              onItemClick={(item) => abrirDetalhe('peca', { filtroNome: item.nome })}
            />
          )}
          {showFinanceiro && (
            <FormasPagamentoChart
              titulo="Formas de pagamento"
              itens={painel.formasPagamento}
              onAbrirDetalhe={() => abrirDetalhe('formas_pagamento')}
            />
          )}
          {showFunc && (
            <FuncionariosProdutividadeChart
              funcionarios={painel.funcionarios}
              onItemClick={(f) =>
                abrirDetalhe('funcionario', { filtroFuncionarioId: f.id })
              }
            />
          )}

          {showFinanceiro && (
            <Card className="border-border/80 bg-card/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Caixa</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {caixaSessao ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Badge variant="success">Aberto</Badge>
                      <span className="text-muted-foreground">
                        desde {formatarData(caixaSessao.opened_at)}
                        {caixaSessao.opened_by_name ? ` · ${caixaSessao.opened_by_name}` : ''}
                      </span>
                    </div>
                    {caixaResumo && (
                      <dl className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
                          <dt className="text-[11px] text-muted-foreground">Saldo esperado</dt>
                          <dd className="mt-1 text-lg font-semibold tabular-nums">
                            {formatarMoeda(caixaResumo.saldoEsperado)}
                          </dd>
                        </div>
                        <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
                          <dt className="text-[11px] text-muted-foreground">Entradas / vendas</dt>
                          <dd className="mt-1 font-medium tabular-nums">
                            {formatarMoeda(caixaResumo.totalEntradas + caixaResumo.totalVendas)}
                          </dd>
                        </div>
                        <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
                          <dt className="text-[11px] text-muted-foreground">Saídas / sangrias</dt>
                          <dd className="mt-1 font-medium tabular-nums">
                            {formatarMoeda(caixaResumo.totalSaidas + caixaResumo.totalSangrias)}
                          </dd>
                        </div>
                        <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
                          <dt className="text-[11px] text-muted-foreground">Estornos</dt>
                          <dd className="mt-1 font-medium tabular-nums">
                            {formatarMoeda(caixaResumo.totalEstornos)}
                          </dd>
                        </div>
                      </dl>
                    )}
                  </>
                ) : (
                  <>
                    <Badge variant="secondary">Fechado</Badge>
                    {caixaDiffFechado?.difference != null &&
                    Math.abs(caixaDiffFechado.difference) > 0.009 ? (
                      <p className="text-amber-300">
                        Último fechamento com diferença de{' '}
                        {formatarMoeda(caixaDiffFechado.difference)}.
                      </p>
                    ) : (
                      <p className="text-muted-foreground">Nenhum caixa aberto no momento.</p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {showOs && (
            <Card className="border-border/80 bg-card/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">OS paradas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {painel.osParadas.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                    Nenhuma OS parada há mais de 5 dias.
                  </p>
                ) : (
                  painel.osParadas.map((os) => (
                    <div
                      key={os.os_id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/10 px-3 py-2.5 text-sm"
                    >
                      <div>
                        <p className="font-medium">
                          OS #{os.numero} parada há {os.dias_parada} dias
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Atualizada em {formatarData(os.atualizado_em)}
                          {os.responsavel ? ` · ${os.responsavel}` : ''}
                        </p>
                      </div>
                      <StatusOSBadge status={os.status} />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}

          <Card className="border-border/80 bg-card/60 lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Alertas inteligentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AlertCards alertas={painel.alertas} />
            </CardContent>
          </Card>
        </section>

        <GestorDetalheModal
          open={detalheAberto}
          onOpenChange={setDetalheAberto}
          detalhe={detalheView}
        />
      </div>
    </RecursoPlanoGate>
  )
}
