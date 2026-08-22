/**
 * Pátio A1 — painel visual das OS por etapa (somente leitura).
 * Resumo superior = global; colunas = lista filtrada.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CreditCard,
  ParkingSquare,
  Search,
  Wrench,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { PatioOsCard } from '@/components/patio/PatioOsCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatCard } from '@/components/shared/StatCard'
import { useOficinaData } from '@/context/CraftContext'
import { cn } from '@/lib/utils'
import { STATUS_OS } from '@/types/labels'
import type { StatusOS } from '@/types/enums'
import {
  COLUNAS_PATIO,
  FILTROS_PATIO_VAZIO,
  agruparCardsPorEtapa,
  etapaContaNoPatio,
  filtrarCardsPatio,
  labelFiltroAtivoPatio,
  listarCardsPatio,
  listarResponsaveisPatio,
  montarResumoPatio,
  ordenarColunasPatio,
  patioTemFiltroAtivo,
  type FiltroRapidoPatio,
  type FiltrosPatio,
} from '@/services/patio/patio.service'

const FILTROS_RAPIDOS: Array<{ id: FiltroRapidoPatio; label: string }> = [
  { id: 'todas', label: 'Todas' },
  { id: 'em_servico', label: 'Em serviço' },
  { id: 'atrasadas', label: 'Atrasadas' },
  { id: 'hoje', label: 'Hoje' },
  { id: 'pagamento_pendente', label: 'Pagamento pendente' },
  { id: 'aguardando_aprovacao', label: 'Aguardando aprovação' },
  { id: 'prontas', label: 'Prontas' },
]

const CARD_PAINEL =
  'border border-zinc-700/50 bg-zinc-900/90 shadow-[0_1px_3px_rgba(0,0,0,0.35)]'

/** Faixa superior suave por etapa (só visual). */
const COLUNA_ACCENT: Record<string, string> = {
  aguardando_entrada: 'border-t-slate-500/70',
  em_diagnostico: 'border-t-sky-500/70',
  aguardando_aprovacao: 'border-t-violet-500/70',
  aguardando_peca: 'border-t-amber-500/70',
  em_servico: 'border-t-blue-500/75',
  pronto_para_entrega: 'border-t-emerald-500/75',
  entregue_finalizada: 'border-t-zinc-500/60',
  outras: 'border-t-zinc-600/50',
}

const FILTRO_BTN_ATIVO =
  'border-sky-500/60 bg-sky-600 text-white hover:bg-sky-600 hover:text-white'
const FILTRO_BTN_IDLE =
  'border-zinc-700/50 bg-zinc-900/80 text-zinc-200 hover:bg-zinc-800 hover:text-zinc-50'

export function PatioPage() {
  const { ordens, clientes, motos, lancamentos } = useOficinaData()
  const [filtros, setFiltros] = useState<FiltrosPatio>(FILTROS_PATIO_VAZIO)

  const todosCards = useMemo(
    () =>
      listarCardsPatio({
        ordens,
        clientes,
        motos,
        lancamentos,
      }),
    [ordens, clientes, motos, lancamentos]
  )

  /** Resumo dos cards superiores — sempre global, não muda com filtro. */
  const resumoGlobal = useMemo(() => montarResumoPatio(todosCards), [todosCards])

  const cardsFiltrados = useMemo(
    () => filtrarCardsPatio(todosCards, filtros),
    [todosCards, filtros]
  )

  const porEtapa = useMemo(() => agruparCardsPorEtapa(cardsFiltrados), [cardsFiltrados])
  const responsaveis = useMemo(() => listarResponsaveisPatio(todosCards), [todosCards])

  const filtroAtivo = patioTemFiltroAtivo(filtros)
  const labelFiltro = labelFiltroAtivoPatio(filtros)
  const totalGlobalPatio = resumoGlobal.totalNoPatio
  const totalFiltradoNoPatio = useMemo(() => {
    return cardsFiltrados.filter((c) => etapaContaNoPatio(c.etapa)).length
  }, [cardsFiltrados])

  function limparFiltros() {
    setFiltros(FILTROS_PATIO_VAZIO)
  }

  /** Filtro rápido: limpa status da OS para não misturar critérios. */
  function setRapido(rapido: FiltroRapidoPatio) {
    setFiltros((f) => ({
      ...f,
      rapido,
      status: 'todos',
    }))
  }

  function setStatusOs(status: StatusOS | 'todos') {
    setFiltros((f) => ({
      ...f,
      status,
      // Evita AND silencioso com filtro rápido de etapa/alerta
      rapido: status === 'todos' ? f.rapido : 'todas',
    }))
  }

  const colunasVisiveis = useMemo(() => {
    const base = COLUNAS_PATIO.filter((col) => {
      if (col.id === 'outras' && porEtapa.outras.length === 0) return false
      if (
        col.id === 'entregue_finalizada' &&
        porEtapa.entregue_finalizada.length === 0 &&
        filtroAtivo
      ) {
        return false
      }
      return true
    })
    return ordenarColunasPatio(base, porEtapa, filtros)
  }, [porEtapa, filtroAtivo, filtros])

  const textoContagem = filtroAtivo
    ? `Filtro ativo: ${labelFiltro} — mostrando ${totalFiltradoNoPatio} de ${totalGlobalPatio} OS`
    : `Mostrando ${totalGlobalPatio} OS no pátio`

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        titulo={
          <span className="inline-flex items-center gap-2">
            <span className="rounded-xl bg-sky-500/15 p-2 text-sky-400 ring-1 ring-sky-500/20">
              <ParkingSquare className="h-6 w-6" />
            </span>
            Pátio
          </span>
        }
        descricao="Visão rápida dos veículos e OS em andamento na oficina."
        acoes={
          <Button
            asChild
            variant="outline"
            size="sm"
            className="border-zinc-700/50 bg-zinc-900/90 text-zinc-100 hover:bg-zinc-800"
          >
            <Link to="/ordens-servico">Ver lista de OS</Link>
          </Button>
        }
      />

      <p className="rounded-xl border border-zinc-700/50 bg-zinc-900/90 px-3 py-2.5 text-xs text-zinc-300 shadow-[0_1px_3px_rgba(0,0,0,0.35)]">
        Painel somente leitura. Não altera status da OS. Arrastar cards e mudança de etapa virão em
        fases futuras. Os números dos cards superiores são o total da oficina (não mudam com
        filtro).
      </p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard
          titulo="Total no pátio"
          valor={resumoGlobal.totalNoPatio}
          icone={ParkingSquare}
          variante="info"
          ativo={!filtroAtivo}
          onClick={limparFiltros}
          ariaLabel="Mostrar todas as OS do pátio"
          descricao="Total global"
        />
        <StatCard
          titulo="Em serviço"
          valor={resumoGlobal.emServico}
          icone={Wrench}
          variante="info"
          ativo={filtros.rapido === 'em_servico'}
          onClick={() => setRapido('em_servico')}
          ariaLabel="Filtrar OS em serviço"
          descricao="Total global"
        />
        <StatCard
          titulo="Atrasadas"
          valor={resumoGlobal.atrasadas}
          icone={AlertTriangle}
          variante="warning"
          ativo={filtros.rapido === 'atrasadas'}
          onClick={() => setRapido('atrasadas')}
          ariaLabel="Filtrar OS atrasadas"
          descricao="Total global"
        />
        <StatCard
          titulo="Prontas para entrega"
          valor={resumoGlobal.prontas}
          icone={CheckCircle2}
          variante="success"
          ativo={filtros.rapido === 'prontas'}
          onClick={() => setRapido('prontas')}
          ariaLabel="Filtrar OS prontas"
          descricao="Total global"
        />
        <StatCard
          titulo="Pagamento pendente"
          valor={resumoGlobal.pagamentoPendente}
          icone={CreditCard}
          variante="warning"
          ativo={filtros.rapido === 'pagamento_pendente'}
          onClick={() => setRapido('pagamento_pendente')}
          ariaLabel="Filtrar pagamento pendente"
          descricao="Total global"
        />
        <StatCard
          titulo="Aguardando aprovação"
          valor={resumoGlobal.aguardandoAprovacao}
          icone={Clock3}
          variante="warning"
          ativo={filtros.rapido === 'aguardando_aprovacao'}
          onClick={() => setRapido('aguardando_aprovacao')}
          ariaLabel="Filtrar aguardando aprovação"
          descricao="Total global"
        />
      </div>

      <Card className={CARD_PAINEL}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-zinc-50">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5 md:col-span-1">
              <Label htmlFor="patio-busca">Busca</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="patio-busca"
                  className="pl-8"
                  placeholder="Cliente, veículo, placa ou nº OS"
                  value={filtros.busca}
                  onChange={(e) => setFiltros((f) => ({ ...f, busca: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="patio-status">Status da OS</Label>
              <select
                id="patio-status"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={filtros.status}
                onChange={(e) => setStatusOs(e.target.value as StatusOS | 'todos')}
              >
                <option value="todos">Todos</option>
                {STATUS_OS.filter((s) => s.value !== 'cancelada').map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="patio-resp">Responsável</Label>
              <select
                id="patio-resp"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={filtros.responsavel}
                onChange={(e) => setFiltros((f) => ({ ...f, responsavel: e.target.value }))}
              >
                <option value="todos">Todos</option>
                {responsaveis.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTROS_RAPIDOS.map((fr) => {
              const ativo = filtros.rapido === fr.id
              return (
                <Button
                  key={fr.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn(ativo ? FILTRO_BTN_ATIVO : FILTRO_BTN_IDLE)}
                  onClick={() => setRapido(fr.id)}
                >
                  {fr.label}
                </Button>
              )
            })}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
              onClick={limparFiltros}
            >
              Limpar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      <div
        className={cn(
          'flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2.5',
          CARD_PAINEL
        )}
      >
        <p className="min-w-0 break-words text-sm text-zinc-100">
          {textoContagem}
          {filtroAtivo ? (
            <span className="ml-2 text-xs text-zinc-400">
              ({cardsFiltrados.length} card{cardsFiltrados.length === 1 ? '' : 's'} nas colunas)
            </span>
          ) : null}
        </p>
        {filtroAtivo ? (
          <Button type="button" size="sm" variant="outline" onClick={limparFiltros}>
            Limpar filtros
          </Button>
        ) : null}
      </div>

      {/* Grid responsivo: empilha no mobile, quebra linha no notebook — sem scroll lateral obrigatório */}
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {colunasVisiveis.map((col) => {
          const lista = porEtapa[col.id]
          const destaque =
            (filtros.rapido === 'em_servico' && col.id === 'em_servico') ||
            (filtros.rapido === 'prontas' && col.id === 'pronto_para_entrega') ||
            (filtros.rapido === 'aguardando_aprovacao' && col.id === 'aguardando_aprovacao') ||
            (filtros.status !== 'todos' &&
              lista.length > 0 &&
              lista.every((c) => c.status === filtros.status))

          return (
            <section
              key={col.id}
              className={cn(
                'flex min-w-0 w-full max-w-full flex-col overflow-hidden rounded-xl border border-zinc-700/45 bg-zinc-900/80',
                'border-t-2 shadow-[0_1px_3px_rgba(0,0,0,0.3)]',
                COLUNA_ACCENT[col.id] ?? 'border-t-zinc-600/50',
                destaque && 'ring-1 ring-sky-500/30'
              )}
            >
              <header className="flex min-w-0 items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-950/50 px-3 py-2">
                <h2 className="min-w-0 truncate text-sm font-semibold text-zinc-100">
                  {col.titulo}
                </h2>
                <Badge
                  variant="outline"
                  className="shrink-0 border-zinc-600/50 bg-zinc-800/70 font-semibold text-zinc-200"
                >
                  {lista.length}
                </Badge>
              </header>
              <div className="flex max-h-[min(70vh,28rem)] min-w-0 flex-col gap-2 overflow-y-auto overflow-x-hidden p-2">
                {lista.length === 0 ? (
                  <p className="px-1 py-3 text-center text-xs text-zinc-400">
                    {filtroAtivo
                      ? 'Nenhuma OS nesta etapa com o filtro atual'
                      : 'Nenhuma OS nesta etapa'}
                  </p>
                ) : (
                  lista.map((card) => <PatioOsCard key={card.id} card={card} />)
                )}
              </div>
            </section>
          )
        })}
      </div>

      {cardsFiltrados.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          Nenhuma OS encontrada com os filtros atuais. O total global do pátio continua{' '}
          {totalGlobalPatio}.
        </p>
      ) : null}
    </div>
  )
}
