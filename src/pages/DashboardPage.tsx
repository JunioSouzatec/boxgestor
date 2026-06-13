import { useMemo } from 'react'
import {
  DollarSign,
  TrendingUp,
  ClipboardList,
  CheckCircle2,
  Users,
  Bike,
  Package,
  CalendarDays,
  CreditCard,
  Wallet,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { AlertasOficina } from '@/components/dashboard/AlertasOficina'
import { TopServicosCard } from '@/components/dashboard/TopServicosCard'
import { TopClientesCard } from '@/components/dashboard/TopClientesCard'
import { LembretesRetornoCard } from '@/components/lembretes/LembretesRetornoCard'
import { PortalClienteDashboardCards } from '@/components/portal-cliente/PortalClienteDashboardCards'
import { RecursoPlanoGate } from '@/components/plano/RecursoPlanoGate'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { lembretesService } from '@/services/lembretes/lembretes.service'
import { calcularResumoPortalDashboard } from '@/services/portal-cliente/portal-cliente.service'
import {
  calcularAlertasOficina,
  calcularTopClientes,
  calcularTopServicos,
} from '@/lib/analytics'
import { formatarMoeda } from '@/lib/utils'
import { calcularMetricasPagamentoDashboard } from '@/services/os-pagamento.service'
import { StatusOSBadge, EstoqueBadge } from '@/components/shared/StatusBadges'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function DashboardPage() {
  const { oficinaId } = useCraft()
  const { clientes, motos, ordens, pecas, lancamentos, agendamentos } = useOficinaData()

  const mesAtual = new Date().toISOString().slice(0, 7)
  const hoje = new Date().toISOString().slice(0, 10)

  const getClienteNome = (id: string) => clientes.find((c) => c.id === id)?.nome ?? '—'

  const metricas = useMemo(() => {
    const receitasMes = lancamentos
      .filter((l) => l.tipo === 'receita' && l.data.startsWith(mesAtual))
      .reduce((acc, l) => acc + l.valor, 0)

    const despesasMes = lancamentos
      .filter((l) => l.tipo === 'despesa' && l.data.startsWith(mesAtual))
      .reduce((acc, l) => acc + l.valor, 0)

    const osAbertas = ordens.filter(
      (o) => !['finalizada', 'entregue', 'cancelada'].includes(o.status)
    ).length

    const osFinalizadas = ordens.filter(
      (o) => o.status === 'finalizada' || o.status === 'entregue'
    ).length

    const pecasBaixo = pecas.filter((p) => p.quantidade <= p.estoque_minimo)

    const agendamentosHoje = agendamentos.filter((a) => a.data === hoje)

    return {
      receitasMes,
      despesasMes,
      lucro: receitasMes - despesasMes,
      osAbertas,
      osFinalizadas,
      pecasBaixo,
      agendamentosHoje,
    }
  }, [lancamentos, ordens, pecas, agendamentos, mesAtual, hoje])

  const ordensRecentes = useMemo(
    () => [...ordens].sort((a, b) => b.numero - a.numero).slice(0, 5),
    [ordens]
  )

  const topServicos = useMemo(() => calcularTopServicos(ordens), [ordens])
  const topClientes = useMemo(
    () => calcularTopClientes(ordens, clientes),
    [ordens, clientes]
  )
  const alertas = useMemo(
    () => calcularAlertasOficina(ordens, pecas, getClienteNome),
    [ordens, pecas, clientes]
  )

  const lembretes = useMemo(
    () => lembretesService.listarLembretes(oficinaId),
    [oficinaId]
  )

  const resumoPortal = useMemo(
    () => calcularResumoPortalDashboard(clientes, ordens, lembretes),
    [clientes, ordens, lembretes]
  )

  const metricasPagamento = useMemo(
    () => calcularMetricasPagamentoDashboard(ordens, lancamentos, mesAtual),
    [ordens, lancamentos, mesAtual]
  )

  return (
    <div>
      <PageHeader titulo="Dashboard" descricao="Visão geral da oficina Craft" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          titulo="Faturamento do mês"
          valor={metricas.receitasMes}
          icone={DollarSign}
          formatarComoMoeda
          variante="success"
        />
        <StatCard
          titulo="Lucro estimado"
          valor={metricas.lucro}
          icone={TrendingUp}
          formatarComoMoeda
          descricao={`Despesas: ${formatarMoeda(metricas.despesasMes)}`}
          variante={metricas.lucro >= 0 ? 'success' : 'warning'}
        />
        <StatCard
          titulo="OS abertas"
          valor={metricas.osAbertas}
          icone={ClipboardList}
          variante="info"
        />
        <StatCard
          titulo="OS finalizadas"
          valor={metricas.osFinalizadas}
          icone={CheckCircle2}
          variante="default"
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard titulo="Clientes" valor={clientes.length} icone={Users} />
        <StatCard titulo="Motos" valor={motos.length} icone={Bike} />
        <StatCard
          titulo="Estoque baixo"
          valor={metricas.pecasBaixo.length}
          icone={Package}
          variante={metricas.pecasBaixo.length > 0 ? 'warning' : 'success'}
        />
        <StatCard
          titulo="Agendamentos hoje"
          valor={metricas.agendamentosHoje.length}
          icone={CalendarDays}
          variante="info"
        />
      </div>

      <div className="mt-4">
        <RecursoPlanoGate recurso="financeiro_completo">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              titulo="OS pendentes de pagamento"
              valor={metricasPagamento.osPendentesPagamento}
              icone={CreditCard}
              variante={metricasPagamento.osPendentesPagamento > 0 ? 'warning' : 'success'}
            />
            <StatCard
              titulo="Valor a receber"
              valor={metricasPagamento.valorAReceber}
              icone={Wallet}
              formatarComoMoeda
              variante={metricasPagamento.valorAReceber > 0 ? 'warning' : 'success'}
            />
            <StatCard
              titulo="Recebido no mês (OS)"
              valor={metricasPagamento.recebidoNoMes}
              icone={DollarSign}
              formatarComoMoeda
              variante="success"
            />
            <StatCard
              titulo="Pagamentos parciais"
              valor={metricasPagamento.pagamentosParciais}
              icone={TrendingUp}
              variante="info"
            />
          </div>
        </RecursoPlanoGate>
      </div>

      <div className="mt-6">
        <RecursoPlanoGate recurso="portal_cliente">
          <div className="mb-2">
            <h3 className="text-sm font-medium text-muted-foreground">Portal do Cliente</h3>
          </div>
          <PortalClienteDashboardCards resumo={resumoPortal} compacto />
        </RecursoPlanoGate>
      </div>

      <div className="mt-6">
        <RecursoPlanoGate recurso="lembretes">
          <LembretesRetornoCard />
        </RecursoPlanoGate>
      </div>

      <div className="mt-6">
        <RecursoPlanoGate recurso="alertas">
          <AlertasOficina alertas={alertas} />
        </RecursoPlanoGate>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <RecursoPlanoGate recurso="relatorios_avancados">
          <TopServicosCard servicos={topServicos} />
        </RecursoPlanoGate>
        <RecursoPlanoGate recurso="relatorios_avancados">
          <TopClientesCard clientes={topClientes} />
        </RecursoPlanoGate>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ordens recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OS</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordensRecentes.map((os) => (
                  <TableRow key={os.id}>
                    <TableCell className="font-medium">#{os.numero}</TableCell>
                    <TableCell>{getClienteNome(os.cliente_id)}</TableCell>
                    <TableCell>
                      <StatusOSBadge status={os.status} />
                    </TableCell>
                    <TableCell className="text-right">{formatarMoeda(os.valor_total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Peças com estoque baixo</CardTitle>
          </CardHeader>
          <CardContent>
            {metricas.pecasBaixo.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma peça abaixo do mínimo.</p>
            ) : (
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
                  {metricas.pecasBaixo.map((peca) => (
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
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Agenda de hoje</CardTitle>
        </CardHeader>
        <CardContent>
          {metricas.agendamentosHoje.length === 0 ? (
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
                {metricas.agendamentosHoje
                  .sort((a, b) => a.horario.localeCompare(b.horario))
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
    </div>
  )
}
