/**
 * Central do Dia A1 — painel operacional diário (somente leitura).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  MessageCircle,
  Package,
  ParkingSquare,
  Search,
  SunMedium,
  Wallet,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatCard } from '@/components/shared/StatCard'
import { useComunicacao } from '@/context/ComunicacaoContext'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { cn, formatarData } from '@/lib/utils'
import { rotaVisualizarOs } from '@/lib/rota-os'
import { obterCaixaAberto } from '@/services/caixa/caixa.service'
import {
  diasAtrasoOs,
  filtrarCardsOsCentral,
  filtrarPrioridadesCentral,
  labelPrioridadeCentral,
  montarCentralDoDia,
  type FiltroPrioridadeCentral,
  type FiltroTipoCentral,
  type PrioridadeCentral,
} from '@/services/central-do-dia/central-do-dia.service'
import { listarCardsPatio } from '@/services/patio/patio.service'
import type { SessaoCaixa } from '@/types/caixa'

type SecaoFoco =
  | 'todas'
  | 'prioridades'
  | 'atrasadas'
  | 'hoje'
  | 'prontas'
  | 'pagamentos'
  | 'comunicacao'
  | 'estoque'
  | 'caixa'
  | 'agenda'

const BADGE_PRIO: Record<PrioridadeCentral, string> = {
  critico: 'border-red-500/35 bg-red-950/50 text-red-300',
  atencao: 'border-amber-500/35 bg-amber-950/50 text-amber-300',
  normal: 'border-sky-500/35 bg-sky-950/50 text-sky-300',
}

const CARD_PAINEL =
  'min-w-0 border border-zinc-700/50 bg-zinc-900/90 shadow-[0_1px_3px_rgba(0,0,0,0.35)]'

const BTN_ACAO =
  'border-zinc-700/50 bg-zinc-800/70 text-zinc-100 hover:bg-zinc-800 hover:text-zinc-50'

const ITEM_LISTA =
  'rounded-xl border border-zinc-700/45 bg-zinc-950/45'

export function CentralDoDiaPage() {
  const { oficinaId } = useCraft()
  const { ordens, clientes, motos, lancamentos, pecas, agendamentos, configuracao } =
    useOficinaData()
  const { resumoAlertas, resumoMensagensAgendadas } = useComunicacao()

  const [busca, setBusca] = useState('')
  const [prioridade, setPrioridade] = useState<FiltroPrioridadeCentral>('todos')
  const [tipo, setTipo] = useState<FiltroTipoCentral>('todos')
  const [foco, setFoco] = useState<SecaoFoco>('todas')
  const [caixaSessao, setCaixaSessao] = useState<SessaoCaixa | null>(null)
  const [caixaCarregado, setCaixaCarregado] = useState(false)

  useEffect(() => {
    let ativo = true
    if (!oficinaId) {
      setCaixaSessao(null)
      setCaixaCarregado(true)
      return
    }
    setCaixaCarregado(false)
    void obterCaixaAberto(oficinaId).then((r) => {
      if (!ativo) return
      setCaixaSessao(r.ok ? r.dados ?? null : null)
      setCaixaCarregado(true)
    })
    return () => {
      ativo = false
    }
  }, [oficinaId])

  const cardsPatio = useMemo(
    () => listarCardsPatio({ ordens, clientes, motos, lancamentos }),
    [ordens, clientes, motos, lancamentos]
  )

  const dados = useMemo(
    () =>
      montarCentralDoDia({
        cardsPatio,
        agendamentos,
        clientes,
        pecas,
        configuracao,
        resumoAlertas,
        resumoMensagens: resumoMensagensAgendadas,
        caixaSessao,
        caixaCarregado,
      }),
    [
      cardsPatio,
      agendamentos,
      clientes,
      pecas,
      configuracao,
      resumoAlertas,
      resumoMensagensAgendadas,
      caixaSessao,
      caixaCarregado,
    ]
  )

  const prioridadesFiltradas = useMemo(
    () =>
      filtrarPrioridadesCentral(dados.prioridades, {
        busca,
        prioridade,
        tipo,
      }),
    [dados.prioridades, busca, prioridade, tipo]
  )

  const osAtrasadas = useMemo(
    () => filtrarCardsOsCentral(dados.osAtrasadas, busca),
    [dados.osAtrasadas, busca]
  )
  const osParaHoje = useMemo(
    () => filtrarCardsOsCentral(dados.osParaHoje, busca),
    [dados.osParaHoje, busca]
  )
  const prontas = useMemo(
    () => filtrarCardsOsCentral(dados.prontas, busca),
    [dados.prontas, busca]
  )
  const pagamentos = useMemo(
    () => filtrarCardsOsCentral(dados.pagamentosPendentes, busca),
    [dados.pagamentosPendentes, busca]
  )

  const mostrar = (s: SecaoFoco) => foco === 'todas' || foco === s

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        titulo={
          <span className="inline-flex items-center gap-2">
            <span className="rounded-xl bg-amber-500/15 p-2 text-amber-400 ring-1 ring-amber-500/20">
              <SunMedium className="h-6 w-6" />
            </span>
            Central do Dia
          </span>
        }
        descricao="Resumo operacional para começar o dia da oficina."
        acoes={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className={BTN_ACAO}>
              <Link to="/patio">
                <ParkingSquare className="h-4 w-4 text-sky-600" />
                Abrir Pátio
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className={BTN_ACAO}>
              <Link to="/ordens-servico">Ver OS</Link>
            </Button>
          </div>
        }
      />

      <p className="rounded-xl border border-zinc-700/50 bg-zinc-900/90 px-3 py-2.5 text-xs text-zinc-300 shadow-[0_1px_3px_rgba(0,0,0,0.35)]">
        Central somente leitura nesta fase. Use os atalhos para abrir as telas e executar ações.
        Datas no fuso Brasil (America/São_Paulo).
      </p>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          titulo="OS para hoje"
          valor={dados.resumo.osParaHoje}
          icone={ClipboardList}
          variante="info"
          ativo={foco === 'hoje'}
          onClick={() => setFoco(foco === 'hoje' ? 'todas' : 'hoje')}
        />
        <StatCard
          titulo="OS atrasadas"
          valor={dados.resumo.osAtrasadas}
          icone={AlertTriangle}
          variante="warning"
          ativo={foco === 'atrasadas'}
          onClick={() => setFoco(foco === 'atrasadas' ? 'todas' : 'atrasadas')}
        />
        <StatCard
          titulo="Prontas para entrega"
          valor={dados.resumo.prontas}
          icone={CheckCircle2}
          variante="success"
          ativo={foco === 'prontas'}
          onClick={() => setFoco(foco === 'prontas' ? 'todas' : 'prontas')}
        />
        <StatCard
          titulo="Pagamentos pendentes"
          valor={dados.resumo.pagamentosPendentes}
          icone={CreditCard}
          variante="warning"
          ativo={foco === 'pagamentos'}
          onClick={() => setFoco(foco === 'pagamentos' ? 'todas' : 'pagamentos')}
        />
        <StatCard
          titulo="Agendamentos de hoje"
          valor={dados.resumo.agendamentosHoje}
          icone={CalendarDays}
          variante="info"
          ativo={foco === 'agenda'}
          onClick={() => setFoco(foco === 'agenda' ? 'todas' : 'agenda')}
        />
        <StatCard
          titulo="Comunicações pendentes"
          valor={dados.resumo.comunicacoesPendentes}
          icone={MessageCircle}
          variante="info"
          ativo={foco === 'comunicacao'}
          onClick={() => setFoco(foco === 'comunicacao' ? 'todas' : 'comunicacao')}
        />
        <StatCard
          titulo="Estoque baixo"
          valor={dados.resumo.estoqueBaixo}
          icone={Package}
          variante="warning"
          ativo={foco === 'estoque'}
          onClick={() => setFoco(foco === 'estoque' ? 'todas' : 'estoque')}
        />
        <StatCard
          titulo="Caixa"
          valor={
            !caixaCarregado
              ? '…'
              : dados.resumo.caixaAberto
                ? 'Aberto'
                : 'Fechado'
          }
          icone={Wallet}
          variante={dados.resumo.caixaAberto ? 'success' : 'warning'}
          ativo={foco === 'caixa'}
          onClick={() => setFoco(foco === 'caixa' ? 'todas' : 'caixa')}
          descricao={
            dados.resumo.caixaExigeAberto
              ? 'Pagamentos podem exigir caixa aberto'
              : 'Status da sessão'
          }
        />
      </div>

      <Card className={CARD_PAINEL}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-zinc-50">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="central-busca">Busca</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="central-busca"
                className="pl-8"
                placeholder="Cliente, veículo, placa ou nº OS"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="central-prio">Prioridade</Label>
            <select
              id="central-prio"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={prioridade}
              onChange={(e) => setPrioridade(e.target.value as FiltroPrioridadeCentral)}
            >
              <option value="todos">Todas</option>
              <option value="critico">Crítico</option>
              <option value="atencao">Atenção</option>
              <option value="normal">Normal</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="central-tipo">Tipo</Label>
            <select
              id="central-tipo"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as FiltroTipoCentral)}
            >
              <option value="todos">Todos</option>
              <option value="os">OS</option>
              <option value="pagamento">Pagamento</option>
              <option value="comunicacao">Comunicação</option>
              <option value="agenda">Agenda</option>
              <option value="estoque">Estoque</option>
              <option value="caixa">Caixa</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {mostrar('prioridades') || foco === 'todas' ? (
        <Secao titulo="A) Prioridades de hoje" contagem={prioridadesFiltradas.length}>
          {prioridadesFiltradas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma prioridade com os filtros atuais.</p>
          ) : (
            <ul className="space-y-2.5">
              {prioridadesFiltradas.map((p) => {
                const titulo = (p.titulo ?? '').trim() || 'Prioridade sem título'
                const descricao = (p.descricao ?? '').trim()
                const acao = (p.acaoLabel ?? '').trim() || 'Abrir'
                return (
                  <li
                    key={p.id}
                    className={cn(
                      'flex min-w-0 flex-col gap-3 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between',
                      ITEM_LISTA
                    )}
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn('font-semibold', BADGE_PRIO[p.prioridade])}
                        >
                          {labelPrioridadeCentral(p.prioridade)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="border-zinc-600/50 bg-zinc-800/60 text-[10px] uppercase text-zinc-300"
                        >
                          {p.tipo}
                        </Badge>
                      </div>
                      <p className="break-words text-sm font-semibold text-zinc-50">{titulo}</p>
                      <p className="break-words text-xs leading-relaxed text-zinc-300">
                        {descricao || 'Sem detalhes adicionais para esta prioridade.'}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="outline" className={cn('shrink-0', BTN_ACAO)}>
                      <Link to={p.acaoTo}>{acao}</Link>
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </Secao>
      ) : null}

      {mostrar('atrasadas') ? (
        <SecaoOs
          titulo="B) OS atrasadas"
          cards={osAtrasadas}
          hoje={dados.hoje}
          vazio="Nenhuma OS atrasada."
          verTodosTo="/patio"
        />
      ) : null}

      {mostrar('hoje') ? (
        <SecaoOs
          titulo="C) OS para hoje"
          cards={osParaHoje}
          hoje={dados.hoje}
          vazio="Nenhuma OS para hoje."
          verTodosTo="/patio"
        />
      ) : null}

      {mostrar('prontas') ? (
        <SecaoOs
          titulo="D) Prontas para entrega"
          cards={prontas}
          hoje={dados.hoje}
          vazio="Nenhuma OS pronta para entrega."
          verTodosTo="/patio"
        />
      ) : null}

      {mostrar('pagamentos') ? (
        <SecaoOs
          titulo="E) Pagamentos pendentes"
          cards={pagamentos}
          hoje={dados.hoje}
          vazio="Nenhum pagamento pendente em OS abertas."
          verTodosTo="/financeiro"
          destaqueSaldo
        />
      ) : null}

      {mostrar('comunicacao') ? (
        <Secao titulo="F) Comunicação pendente">
          <div className="grid gap-2 sm:grid-cols-2">
            <InfoLinha label="Alertas vencidos" valor={String(dados.comunicacao.alertasVencidos)} />
            <InfoLinha label="Alertas hoje" valor={String(dados.comunicacao.alertasHoje)} />
            <InfoLinha label="Alertas pendentes" valor={String(dados.comunicacao.alertasPendentes)} />
            <InfoLinha
              label="Mensagens atrasadas"
              valor={String(dados.comunicacao.mensagensAtrasadas)}
            />
            <InfoLinha label="Mensagens hoje" valor={String(dados.comunicacao.mensagensHoje)} />
          </div>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link to="/comunicacao">Abrir Comunicação</Link>
          </Button>
        </Secao>
      ) : null}

      {mostrar('estoque') ? (
        <Secao titulo="G) Estoque baixo" contagem={dados.estoqueBaixo.length}>
          {dados.estoqueBaixo.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum item abaixo do mínimo.</p>
          ) : (
            <ul className="space-y-2">
              {dados.estoqueBaixo.map((e) => (
                <li
                  key={e.id}
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-2 px-3.5 py-3 text-sm',
                    ITEM_LISTA
                  )}
                >
                  <div className="min-w-0">
                    <p className="break-words font-medium text-zinc-50">
                      {e.nome || 'Item sem nome'}
                    </p>
                    <p className="text-xs text-zinc-300">
                      {e.quantidade} un. · mínimo {e.minimo}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline" className={BTN_ACAO}>
                    <Link to="/estoque?baixo=1">Abrir Estoque</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button asChild size="sm" variant="ghost" className="mt-2">
            <Link to="/estoque?baixo=1">Ver todos no Estoque</Link>
          </Button>
        </Secao>
      ) : null}

      {mostrar('caixa') ? (
        <Secao titulo="H) Caixa do dia">
          <div className="space-y-2 text-sm">
            <InfoLinha
              label="Status"
              valor={
                !caixaCarregado
                  ? 'Carregando…'
                  : dados.caixa.aberto
                    ? 'Aberto'
                    : 'Fechado'
              }
            />
            {dados.caixa.sessao?.opened_by_name ? (
              <InfoLinha label="Aberto por" valor={dados.caixa.sessao.opened_by_name} />
            ) : null}
            {dados.caixa.exigeAberto && !dados.caixa.aberto ? (
              <p className="rounded-xl border border-amber-500/35 bg-amber-950/45 px-3 py-2 text-xs text-amber-200">
                Configuração exige caixa aberto para pagamentos.
              </p>
            ) : null}
          </div>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link to="/caixa">Abrir Caixa</Link>
          </Button>
        </Secao>
      ) : null}

      {mostrar('agenda') ? (
        <Secao titulo="Agendamentos de hoje" contagem={dados.agendaHoje.length}>
          {dados.agendaHoje.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum agendamento para hoje.</p>
          ) : (
            <ul className="space-y-2">
              {dados.agendaHoje.map((a) => (
                <li
                  key={a.id}
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-2 px-3.5 py-3 text-sm',
                    ITEM_LISTA
                  )}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-50">
                      {a.horario} · {a.clienteNome || 'Cliente não informado'}
                    </p>
                    <p className="break-words text-xs text-zinc-300">
                      {a.servico?.trim() || 'Serviço não informado'}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline" className={BTN_ACAO}>
                    <Link to="/agenda?data=hoje">Abrir Agenda</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      ) : null}
    </div>
  )
}

function Secao({
  titulo,
  contagem,
  children,
}: {
  titulo: string
  contagem?: number
  children: ReactNode
}) {
  return (
    <Card className={cn('min-w-0', CARD_PAINEL)}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base text-zinc-50">{titulo}</CardTitle>
        {contagem != null ? (
          <Badge
            variant="outline"
            className="border-zinc-600/50 bg-zinc-800/70 font-semibold text-zinc-200"
          >
            {contagem}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="min-w-0">{children}</CardContent>
    </Card>
  )
}

function InfoLinha({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-xl border border-zinc-700/45 bg-zinc-950/45 px-3 py-2">
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="font-semibold text-zinc-50">{valor}</p>
    </div>
  )
}

function SecaoOs({
  titulo,
  cards,
  hoje,
  vazio,
  verTodosTo,
  destaqueSaldo,
}: {
  titulo: string
  cards: ReturnType<typeof listarCardsPatio>
  hoje: string
  vazio: string
  verTodosTo: string
  destaqueSaldo?: boolean
}) {
  return (
    <Secao titulo={titulo} contagem={cards.length}>
      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">{vazio}</p>
      ) : (
        <ul className="space-y-2">
          {cards.map((c) => {
            const dias = diasAtrasoOs(c, hoje)
            return (
              <li
                key={c.id}
                className={cn(
                  'flex min-w-0 flex-col gap-3 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between',
                  ITEM_LISTA
                )}
              >
                <div className="min-w-0 space-y-1 text-sm">
                  <p className="font-semibold text-zinc-50">
                    OS #{c.numero} · {c.clienteNome?.trim() || 'Cliente não informado'}
                  </p>
                  <p className="break-words text-xs text-zinc-300">
                    {c.veiculoLabel?.trim() || 'Veículo não informado'}
                    {c.placa ? ` · ${c.placa}` : ''}
                    {c.statusLabel ? ` · ${c.statusLabel}` : ''}
                  </p>
                  <p className="text-xs text-zinc-400">
                    Previsão: {c.dataPrevisao ? formatarData(c.dataPrevisao) : 'sem previsão'}
                    {dias > 0 ? ` · ${dias} dia(s) de atraso` : ''}
                    {destaqueSaldo || c.pagamentoPendente
                      ? ` · saldo ${c.valorPendenteLabel}`
                      : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline" className={BTN_ACAO}>
                    <Link to={rotaVisualizarOs({ id: c.id })}>Abrir OS</Link>
                  </Button>
                  <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
                  >
                    <Link to="/patio">Abrir no Pátio</Link>
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <Button asChild size="sm" variant="ghost" className="mt-2">
        <Link to={verTodosTo}>Ver todos</Link>
      </Button>
    </Secao>
  )
}
