import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DollarSign,
  TrendingUp,
  ClipboardList,
  CheckCircle2,
  Users,
  Bike,
  Package,
  CalendarDays,
  Wallet,
  Wrench,
  Truck,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { AlertasOficina } from '@/components/dashboard/AlertasOficina'
import { TopServicosCard } from '@/components/dashboard/TopServicosCard'
import { TopPecasCard } from '@/components/dashboard/TopPecasCard'
import { TopClientesCard } from '@/components/dashboard/TopClientesCard'
import { DashboardAtalhosRapidos } from '@/components/dashboard/DashboardAtalhosRapidos'
import { DashboardMobileInicio } from '@/components/dashboard/DashboardMobileInicio'
import { DashboardPeriodoFiltro } from '@/components/dashboard/DashboardPeriodoFiltro'
import { ChecklistInicialCard } from '@/components/dashboard/ChecklistInicialCard'
import { LembretesRetornoCard } from '@/components/lembretes/LembretesRetornoCard'
import { PortalClienteDashboardCards } from '@/components/portal-cliente/PortalClienteDashboardCards'
import { RecursoPlanoGate } from '@/components/plano/RecursoPlanoGate'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useOficinaData } from '@/context/CraftContext'
import { useAuth } from '@/context/AuthContext'
import { useLembretes } from '@/context/LembretesContext'
import { podeAcessarModuloUsuario, visibilidadeDashboard } from '@/services/auth/permissions'
import { calcularResumoPortalDashboard } from '@/services/portal-cliente/portal-cliente.service'
import { calcularAlertasOficina, calcularTopClientes } from '@/lib/analytics'
import { compararHorarios } from '@/lib/dados-legados'
import { formatarMoeda } from '@/lib/utils'
import { getDataLocalHoje } from '@/lib/data-local'
import { calcularTotalGeralDeCampos } from '@/services/os-financeiro.service'
import {
  calcularIntervaloDashboardPreset,
  calcularMetricasDashboard,
  type PeriodoDashboardPreset,
} from '@/services/dashboard-metrics.service'
import { StatusOSBadge, EstoqueBadge } from '@/components/shared/StatusBadges'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { useTermosOficina } from '@/hooks/useTermosOficina'

export function DashboardPage() {
  const { session } = useAuth()
  const { configuracao, clientes, motos, ordens, pecas, lancamentos, agendamentos, movimentacoesEstoque } =
    useOficinaData()
  const termos = useTermosOficina()
  const { lembretes } = useLembretes()
  const vis = visibilidadeDashboard(session?.user ?? 'recepcao', configuracao)
  const user = session?.user

  const linksDashboard = useMemo(() => {
    const podeOrdens = user
      ? podeAcessarModuloUsuario(user, 'ordens_servico', configuracao)
      : false
    const podeClientes = user ? podeAcessarModuloUsuario(user, 'clientes', configuracao) : false
    const podeMotos = user ? podeAcessarModuloUsuario(user, 'motos', configuracao) : false
    const podeEstoque = user ? podeAcessarModuloUsuario(user, 'estoque', configuracao) : false
    const podeAgenda = user ? podeAcessarModuloUsuario(user, 'agenda', configuracao) : false

    return {
      osAbertas: podeOrdens ? '/ordens-servico?abertas=1' : undefined,
      osEmServico: podeOrdens ? '/ordens-servico?status=em_servico' : undefined,
      osConcluidas: podeOrdens ? '/ordens-servico?apenasFinalizadas=1' : undefined,
      pagamentosPendentes:
        podeOrdens && vis.pagamentosPendentes ? '/ordens-servico?pendentes=1' : undefined,
      clientes: podeClientes && vis.clientesMotosTotais ? '/clientes' : undefined,
      motos: podeMotos && vis.clientesMotosTotais ? '/motos' : undefined,
      estoqueBaixo:
        podeEstoque && vis.estoqueCompleto ? '/estoque?baixo=1' : undefined,
      agendaHoje: podeAgenda && vis.agendaHoje ? '/agenda?data=hoje' : undefined,
    }
  }, [user, configuracao, vis])

  const hoje = getDataLocalHoje()
  const [periodoPreset, setPeriodoPreset] = useState<PeriodoDashboardPreset>('mes')
  const [dataInicio, setDataInicio] = useState(hoje)
  const [dataFim, setDataFim] = useState(hoje)

  const intervalo = useMemo(
    () =>
      calcularIntervaloDashboardPreset(periodoPreset, new Date(), {
        inicio: dataInicio,
        fim: dataFim,
      }),
    [periodoPreset, dataInicio, dataFim]
  )

  const metricas = useMemo(
    () =>
      calcularMetricasDashboard(
        { clientes, motos, ordens, pecas, lancamentos, movimentacoesEstoque },
        intervalo
      ),
    [clientes, motos, ordens, pecas, lancamentos, movimentacoesEstoque, intervalo]
  )

  const getClienteNome = (id: string) => clientes.find((c) => c.id === id)?.nome ?? '—'

  const ordensRecentes = useMemo(
    () => [...ordens].sort((a, b) => b.numero - a.numero).slice(0, 5),
    [ordens]
  )

  const topClientes = useMemo(
    () => calcularTopClientes(ordens, clientes, 5),
    [ordens, clientes]
  )

  const alertas = useMemo(
    () => calcularAlertasOficina(ordens, pecas, getClienteNome),
    [ordens, pecas, clientes]
  )

  const resumoPortal = useMemo(
    () => calcularResumoPortalDashboard(clientes, ordens, lembretes),
    [clientes, ordens, lembretes]
  )

  const agendamentosHoje = useMemo(
    () => agendamentos.filter((a) => a.data === hoje),
    [agendamentos, hoje]
  )

  const semDados =
    ordens.length === 0 &&
    lancamentos.filter((l) => l.tipo === 'receita' && l.pago).length === 0

  const descricaoLucro =
    metricas.lucroEstimado.pecasSemCustoUsadas > 0
      ? `Mão de obra: ${formatarMoeda(metricas.lucroEstimado.maoObra)} · Peças: ${formatarMoeda(metricas.lucroEstimado.pecas)} · ${metricas.lucroEstimado.pecasSemCustoUsadas} un. sem custo`
      : `Mão de obra: ${formatarMoeda(metricas.lucroEstimado.maoObra)} · Peças: ${formatarMoeda(metricas.lucroEstimado.pecas)}`

  const descricaoOsConcluidas =
    metricas.osFinalizadasPeriodo > 0 || metricas.osEntreguesPeriodo > 0
      ? `${metricas.osFinalizadasPeriodo} finalizadas · ${metricas.osEntreguesPeriodo} entregues`
      : 'Nenhuma OS concluída no período'

  return (
    <div>
      <PageHeader
        titulo="Dashboard"
        descricao="Indicadores reais da sua oficina"
        acoes={
          <div className="hidden md:block">
            <DashboardAtalhosRapidos />
          </div>
        }
      />

      <DashboardMobileInicio />

      <div className="mb-6">
        <DashboardPeriodoFiltro
          preset={periodoPreset}
          onPresetChange={setPeriodoPreset}
          dataInicio={dataInicio}
          dataFim={dataFim}
          onDataInicioChange={setDataInicio}
          onDataFimChange={setDataFim}
          intervaloLabel={intervalo.label}
          intervaloInicio={intervalo.inicio}
          intervaloFim={intervalo.fim}
        />
      </div>

      {semDados && (
        <div className="mb-6 rounded-md border border-border bg-muted/10 p-4 text-sm text-muted-foreground">
          Nenhuma OS cadastrada ainda. Use os atalhos acima para começar a registrar clientes,
          {termos.veiculos.toLowerCase()} e ordens de serviço.
        </div>
      )}

      <ChecklistInicialCard compacto />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {vis.faturamentoLucro && (
          <>
            <StatCard
              titulo="Faturamento"
              valor={metricas.faturamento}
              icone={DollarSign}
              formatarComoMoeda
              variante="success"
              descricao={
                metricas.faturamento > 0
                  ? 'Pagamentos recebidos no período'
                  : 'Nenhum pagamento registrado ainda.'
              }
            />
            <StatCard
              titulo="Lucro estimado"
              valor={metricas.lucroEstimado.total}
              icone={TrendingUp}
              formatarComoMoeda
              descricao={
                metricas.lucroEstimado.total > 0 ? descricaoLucro : 'Sem receitas no período.'
              }
              variante={metricas.lucroEstimado.total >= 0 ? 'success' : 'warning'}
            />
          </>
        )}
        <StatCard
          titulo="OS abertas"
          valor={metricas.osAbertas}
          icone={ClipboardList}
          variante="info"
          to={linksDashboard.osAbertas}
          ariaLabel="Ver ordens de serviço abertas"
          descricao={metricas.osAbertas === 0 ? 'Nenhuma OS aberta.' : 'Clique para ver a lista'}
        />
        <StatCard
          titulo="OS em serviço"
          valor={metricas.osEmServico}
          icone={Wrench}
          variante="info"
          to={linksDashboard.osEmServico}
          ariaLabel="Ver ordens de serviço em serviço"
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          titulo="OS concluídas no período"
          valor={metricas.osFinalizadasPeriodo + metricas.osEntreguesPeriodo}
          icone={CheckCircle2}
          variante="default"
          to={linksDashboard.osConcluidas}
          ariaLabel="Ver ordens de serviço concluídas"
          descricao={descricaoOsConcluidas}
        />
        {vis.pagamentosPendentes && (
          <StatCard
            titulo="Pagamentos pendentes"
            valor={metricas.pagamentosPendentes.valorTotal}
            icone={Wallet}
            formatarComoMoeda
            variante={metricas.pagamentosPendentes.valorTotal > 0 ? 'warning' : 'success'}
            to={linksDashboard.pagamentosPendentes}
            ariaLabel="Ver ordens com pagamento pendente"
            descricao={
              metricas.pagamentosPendentes.quantidadeOs > 0
                ? `${metricas.pagamentosPendentes.quantidadeOs} OS com saldo`
                : 'Nenhum saldo pendente.'
            }
          />
        )}
        {vis.clientesMotosTotais && (
          <>
            <StatCard
              titulo="Clientes cadastrados"
              valor={metricas.clientesTotal}
              icone={Users}
              to={linksDashboard.clientes}
              ariaLabel="Ver clientes cadastrados"
            />
            <StatCard
              titulo={`${termos.veiculos} cadastrados`}
              valor={metricas.motosTotal}
              icone={Bike}
              to={linksDashboard.motos}
              ariaLabel={`Ver ${termos.veiculos.toLowerCase()} cadastrados`}
            />
          </>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          titulo="Estoque baixo"
          valor={metricas.estoqueBaixo}
          icone={Package}
          variante={metricas.estoqueBaixo > 0 ? 'warning' : 'success'}
          descricao={
            metricas.estoqueBaixo === 0 ? 'Nenhum item com estoque baixo.' : 'Clique para ver itens'
          }
          to={linksDashboard.estoqueBaixo}
          ariaLabel="Ver itens com estoque baixo"
        />
        {vis.estoqueCompleto && vis.faturamentoLucro && (
          <>
            <RecursoPlanoGate recurso="estoque_completo">
              <div>
                <StatCard
                  titulo="Valor em estoque"
                  valor={metricas.resumoEstoque.valorTotalEstoque}
                  icone={Package}
                  formatarComoMoeda
                />
              </div>
            </RecursoPlanoGate>
            <RecursoPlanoGate recurso="estoque_completo">
              <div>
                <StatCard
                  titulo="Lucro potencial (estoque)"
                  valor={metricas.resumoEstoque.lucroEstimadoEstoque}
                  icone={Truck}
                  formatarComoMoeda
                  variante="success"
                />
              </div>
            </RecursoPlanoGate>
          </>
        )}
        {vis.agendaHoje && (
          <StatCard
            titulo="Agendamentos hoje"
            valor={agendamentosHoje.length}
            icone={CalendarDays}
            variante="info"
            to={linksDashboard.agendaHoje}
            ariaLabel="Ver agendamentos de hoje"
          />
        )}
      </div>

      {vis.topServicosPecas && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {vis.faturamentoLucro ? (
            <>
              <TopServicosCard servicos={metricas.topServicos} />
              <TopPecasCard pecas={metricas.topPecas} />
            </>
          ) : (
            <TopPecasCard pecas={metricas.topPecas} />
          )}
        </div>
      )}

      {vis.portalLembretes && (
        <div className="mt-6">
          <RecursoPlanoGate recurso="portal_cliente">
            <div className="mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Portal do Cliente</h3>
            </div>
            <PortalClienteDashboardCards resumo={resumoPortal} compacto />
          </RecursoPlanoGate>
        </div>
      )}

      {vis.portalLembretes && (
        <div className="mt-6">
          <RecursoPlanoGate recurso="lembretes">
            <LembretesRetornoCard />
          </RecursoPlanoGate>
        </div>
      )}

      {vis.alertas && (
        <div className="mt-6">
          <RecursoPlanoGate recurso="alertas">
            <AlertasOficina alertas={alertas} />
          </RecursoPlanoGate>
        </div>
      )}

      {vis.topClientes && (
        <div className="mt-6">
          <RecursoPlanoGate recurso="relatorios_avancados">
            <TopClientesCard clientes={topClientes} />
          </RecursoPlanoGate>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ordens recentes</CardTitle>
          </CardHeader>
          <CardContent>
            {ordensRecentes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma OS cadastrada ainda.</p>
            ) : (
              <>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>OS</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Status</TableHead>
                        {vis.faturamentoLucro && <TableHead className="text-right">Total</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ordensRecentes.map((os) => (
                        <TableRow key={os.id}>
                          <TableCell className="font-medium">
                            <Link
                              to={`/ordens-servico?ver=${os.id}`}
                              className="hover:text-primary hover:underline"
                            >
                              #{os.numero}
                            </Link>
                          </TableCell>
                          <TableCell>{getClienteNome(os.cliente_id)}</TableCell>
                          <TableCell>
                            <StatusOSBadge status={os.status} />
                          </TableCell>
                          {vis.faturamentoLucro && (
                            <TableCell className="text-right">
                              {formatarMoeda(calcularTotalGeralDeCampos(os))}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="md:hidden space-y-2">
                  {ordensRecentes.map((os) => (
                    <Link
                      key={os.id}
                      to={`/ordens-servico?ver=${os.id}`}
                      className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-3 transition-colors hover:bg-muted/40"
                    >
                      <div>
                        <p className="font-semibold">OS #{os.numero}</p>
                        <p className="text-sm text-muted-foreground">{getClienteNome(os.cliente_id)}</p>
                      </div>
                      <div className="text-right">
                        <StatusOSBadge status={os.status} />
                        {vis.faturamentoLucro && (
                          <p className="mt-1 text-sm font-medium">
                            {formatarMoeda(calcularTotalGeralDeCampos(os))}
                          </p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Peças com estoque baixo</CardTitle>
          </CardHeader>
          <CardContent>
            {metricas.pecasBaixoLista.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum item com estoque baixo.</p>
            ) : (
              <>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Peça</TableHead>
                        <TableHead>Qtd</TableHead>
                        <TableHead>Mínimo</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {metricas.pecasBaixoLista.slice(0, 8).map((peca) => (
                        <TableRow key={peca.id}>
                          <TableCell className="font-medium">{peca.nome}</TableCell>
                          <TableCell>{peca.quantidade}</TableCell>
                          <TableCell>{peca.estoque_minimo}</TableCell>
                          <TableCell>
                            <EstoqueBadge quantidade={peca.quantidade} minimo={peca.estoque_minimo} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="md:hidden space-y-2">
                  {metricas.pecasBaixoLista.slice(0, 8).map((peca) => (
                    <div
                      key={peca.id}
                      className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2.5"
                    >
                      <p className="font-medium text-sm">{peca.nome}</p>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">
                          {peca.quantidade}/{peca.estoque_minimo}
                        </span>
                        <EstoqueBadge quantidade={peca.quantidade} minimo={peca.estoque_minimo} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {vis.agendaHoje && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Agenda de hoje</CardTitle>
          </CardHeader>
        <CardContent>
          {agendamentosHoje.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum agendamento para hoje.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Horário</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Serviço</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agendamentosHoje
                  .sort((a, b) => compararHorarios(a.horario, b.horario))
                  .map((ag) => (
                    <TableRow key={ag.id}>
                      <TableCell className="font-medium">{ag.horario}</TableCell>
                      <TableCell>{getClienteNome(ag.cliente_id)}</TableCell>
                      <TableCell>{ag.servico}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  )
}
