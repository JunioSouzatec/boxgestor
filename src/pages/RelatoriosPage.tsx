import { useMemo, useState } from 'react'
import {
  DollarSign,
  TrendingUp,
  ClipboardList,
  Bike,
  Package,
  Wallet,
  FileDown,
  FileSpreadsheet,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { RecursoPlanoGate } from '@/components/plano/RecursoPlanoGate'
import {
  GraficoBarrasSimples,
  GraficoComparativoFinanceiro,
} from '@/components/relatorios/GraficoBarrasSimples'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useOficinaData } from '@/context/CraftContext'
import { exportarRelatorioCsv, exportarRelatorioPdf } from '@/lib/relatorios-export'
import { formatarMoeda, formatarData } from '@/lib/utils'
import {
  calcularIntervaloPeriodo,
  gerarRelatoriosCompletos,
  getLabelPeriodo,
  type PeriodoRelatorio,
} from '@/services/relatorios.service'
import { EstoqueBadge } from '@/components/shared/StatusBadges'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const PERIODOS: PeriodoRelatorio[] = ['dia', 'semana', 'mes', 'mes_passado', 'personalizado']

function TabelaVazia({ cols, msg }: { cols: number; msg: string }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="py-8 text-center text-muted-foreground">
        {msg}
      </TableCell>
    </TableRow>
  )
}

function RelatoriosConteudo() {
  const { clientes, motos, ordens, pecas, lancamentos, servicosCatalogo, movimentacoesEstoque } =
    useOficinaData()
  const [periodo, setPeriodo] = useState<PeriodoRelatorio>('mes')
  const hoje = new Date().toISOString().slice(0, 10)
  const [dataInicio, setDataInicio] = useState(hoje)
  const [dataFim, setDataFim] = useState(hoje)

  const intervalo = useMemo(
    () =>
      calcularIntervaloPeriodo(periodo, new Date(), { inicio: dataInicio, fim: dataFim }),
    [periodo, dataInicio, dataFim]
  )

  const relatorios = useMemo(
    () =>
      gerarRelatoriosCompletos(
        { clientes, motos, ordens, pecas, lancamentos, servicosCatalogo, movimentacoesEstoque },
        intervalo
      ),
    [clientes, motos, ordens, pecas, lancamentos, servicosCatalogo, movimentacoesEstoque, intervalo]
  )

  const {
    resumo,
    faturamento,
    os,
    clientes: relClientes,
    motos: relMotos,
    estoque,
    financeiro,
    servicosCatalogo: relServicos,
  } = relatorios

  return (
    <div>
      <PageHeader
        titulo="Relatórios"
        descricao="Acompanhe faturamento, operação e resultados da oficina"
        acoes={
          <>
            <Button variant="outline" size="sm" onClick={() => exportarRelatorioCsv(relatorios)}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportarRelatorioPdf(relatorios)}>
              <FileDown className="mr-2 h-4 w-4" />
              Exportar PDF
            </Button>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {PERIODOS.map((p) => (
          <Button
            key={p}
            variant={periodo === p ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriodo(p)}
          >
            {getLabelPeriodo(p)}
          </Button>
        ))}
        <Badge variant="outline" className="ml-auto self-center">
          {intervalo.label}: {formatarData(intervalo.inicio)} — {formatarData(intervalo.fim)}
        </Badge>
      </div>

      {periodo === 'personalizado' && (
        <div className="mb-6 flex flex-wrap items-end gap-4 rounded-md border border-border bg-muted/10 p-3">
          <div className="space-y-1">
            <Label htmlFor="rel-data-inicio">De</Label>
            <Input
              id="rel-data-inicio"
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rel-data-fim">Até</Label>
            <Input
              id="rel-data-fim"
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          titulo="Faturamento"
          valor={faturamento.receitas}
          icone={DollarSign}
          formatarComoMoeda
          variante="success"
          descricao="Pagamentos OS recebidos no período"
        />
        <StatCard
          titulo="Lucro estimado"
          valor={faturamento.lucroEstimado}
          icone={TrendingUp}
          formatarComoMoeda
          variante={faturamento.lucroEstimado >= 0 ? 'success' : 'warning'}
          descricao={`Mão de obra: ${formatarMoeda(faturamento.lucroMaoObra)} · Peças: ${formatarMoeda(faturamento.lucroPecas)}`}
        />
        <StatCard
          titulo="Pagamentos pendentes"
          valor={faturamento.pagamentosPendentesOs}
          icone={Wallet}
          formatarComoMoeda
          variante={faturamento.pagamentosPendentesOs > 0 ? 'warning' : 'success'}
        />
        <StatCard
          titulo="Ticket médio OS"
          valor={os.ticketMedio}
          icone={ClipboardList}
          formatarComoMoeda
          variante="info"
        />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Resumo financeiro
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Custo de peças (período)</span>
              <span>{formatarMoeda(faturamento.custoPecas)}</span>
            </div>
            <div className="flex justify-between">
              <span>Despesas gerais</span>
              <span>{formatarMoeda(faturamento.despesas)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Lucro das peças</span>
              <span className="text-emerald-400">{formatarMoeda(faturamento.lucroPecas)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Operação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>OS abertas</span>
              <span>{resumo.osAbertas}</span>
            </div>
            <div className="flex justify-between">
              <span>OS concluídas no período</span>
              <span>{resumo.osConcluidas}</span>
            </div>
            <div className="flex justify-between">
              <span>Tempo médio entrada → saída</span>
              <span>
                {resumo.tempoMedioDiasEntradaSaida != null
                  ? `${resumo.tempoMedioDiasEntradaSaida} dias`
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Motos atendidas</span>
              <span>{resumo.motosAtendidas}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Estoque</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Itens com estoque baixo</span>
              <span>{resumo.estoqueBaixo}</span>
            </div>
            <div className="flex justify-between">
              <span>Valor em estoque</span>
              <span>{formatarMoeda(resumo.valorEstoque)}</span>
            </div>
            <div className="flex justify-between">
              <span>Lucro potencial</span>
              <span>{formatarMoeda(resumo.lucroPotencialEstoque)}</span>
            </div>
            {resumo.topPecas[0] && (
              <div className="flex justify-between text-muted-foreground">
                <span>Peça mais usada</span>
                <span className="truncate max-w-[140px]">
                  {resumo.topPecas[0].nome} ({resumo.topPecas[0].quantidade})
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Clientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Atendidos no período</span>
              <span>{resumo.clientesAtendidos}</span>
            </div>
            <div className="flex justify-between">
              <span>Recorrentes (2+ visitas)</span>
              <span>{resumo.clientesRecorrentes}</span>
            </div>
            {resumo.topServicos[0] && (
              <div className="flex justify-between text-muted-foreground">
                <span>Serviço mais realizado</span>
                <span className="truncate max-w-[140px]">
                  {resumo.topServicos[0].servico} ({resumo.topServicos[0].quantidade})
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="faturamento" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="faturamento">Faturamento</TabsTrigger>
          <TabsTrigger value="os">Ordens de Serviço</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="motos">Motos</TabsTrigger>
          <TabsTrigger value="estoque">Estoque</TabsTrigger>
          <TabsTrigger value="servicos">Catálogo</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
        </TabsList>

        <TabsContent value="faturamento">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resumo financeiro</CardTitle>
                <CardDescription>Receitas, despesas e lucro no período</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <p className="text-xs text-muted-foreground">Receitas</p>
                  <p className="text-xl font-bold text-emerald-400">
                    {formatarMoeda(faturamento.receitas)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <p className="text-xs text-muted-foreground">Despesas</p>
                  <p className="text-xl font-bold text-red-400">
                    {formatarMoeda(faturamento.despesas)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <p className="text-xs text-muted-foreground">Lucro</p>
                  <p
                    className={cn(
                      'text-xl font-bold',
                      faturamento.lucro >= 0 ? 'text-emerald-400' : 'text-amber-400'
                    )}
                  >
                    {formatarMoeda(faturamento.lucro)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Evolução no período</CardTitle>
              </CardHeader>
              <CardContent>
                <GraficoComparativoFinanceiro
                  serie={faturamento.serie}
                  formatarValor={formatarMoeda}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="os">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resumo de OS</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <StatCard titulo="Abertas" valor={os.abertas} icone={ClipboardList} variante="info" />
                <StatCard
                  titulo="Finalizadas"
                  valor={os.finalizadas}
                  icone={ClipboardList}
                  variante="success"
                />
                <StatCard
                  titulo="Canceladas"
                  valor={os.canceladas}
                  icone={ClipboardList}
                  variante="warning"
                />
                <StatCard
                  titulo="Ticket médio"
                  valor={os.ticketMedio}
                  icone={DollarSign}
                  formatarComoMoeda
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">OS por status</CardTitle>
              </CardHeader>
              <CardContent>
                <GraficoBarrasSimples
                  itens={os.porStatus.map((s) => ({
                    label: s.label.split(' ')[0],
                    valor: s.quantidade,
                  }))}
                />
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Detalhamento por status</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {os.porStatus.length === 0 ? (
                      <TabelaVazia cols={2} msg="Nenhuma OS no período." />
                    ) : (
                      os.porStatus.map((s) => (
                        <TableRow key={s.status}>
                          <TableCell>{s.label}</TableCell>
                          <TableCell className="text-right font-medium">{s.quantidade}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="clientes">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Clientes que mais gastaram</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Visitas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {relClientes.topGastos.length === 0 ? (
                      <TabelaVazia cols={3} msg="Sem dados no período." />
                    ) : (
                      relClientes.topGastos.map((c) => (
                        <TableRow key={c.clienteId}>
                          <TableCell className="font-medium">{c.nome}</TableCell>
                          <TableCell className="text-right">{formatarMoeda(c.valorTotal)}</TableCell>
                          <TableCell className="text-right">{c.quantidade}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Clientes mais frequentes</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Visitas</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {relClientes.topFrequentes.length === 0 ? (
                      <TabelaVazia cols={3} msg="Sem dados no período." />
                    ) : (
                      relClientes.topFrequentes.map((c) => (
                        <TableRow key={c.clienteId}>
                          <TableCell className="font-medium">{c.nome}</TableCell>
                          <TableCell className="text-right">{c.quantidade}</TableCell>
                          <TableCell className="text-right">{formatarMoeda(c.valorTotal)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Sem retorno há mais de 90 dias</CardTitle>
                <CardDescription>Clientes inativos — oportunidade de reativação</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Última visita</TableHead>
                      <TableHead className="text-right">Total histórico</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {relClientes.semRetorno90.length === 0 ? (
                      <TabelaVazia cols={3} msg="Nenhum cliente inativo identificado." />
                    ) : (
                      relClientes.semRetorno90.map((c) => (
                        <TableRow key={c.clienteId}>
                          <TableCell className="font-medium">{c.nome}</TableCell>
                          <TableCell>
                            {c.ultimaVisita ? formatarData(c.ultimaVisita) : 'Nunca atendido'}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatarMoeda(c.valorTotal)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="motos">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Motos com mais serviços</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Moto</TableHead>
                      <TableHead className="text-right">Serviços</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {relMotos.maisServicos.length === 0 ? (
                      <TabelaVazia cols={3} msg="Sem serviços no período." />
                    ) : (
                      relMotos.maisServicos.map((m) => (
                        <TableRow key={m.motoId}>
                          <TableCell className="font-medium">{m.label}</TableCell>
                          <TableCell className="text-right">{m.servicos}</TableCell>
                          <TableCell className="text-right">{formatarMoeda(m.valorTotal)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Histórico por moto</CardTitle>
                <CardDescription>Maior faturamento no período</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Moto</TableHead>
                      <TableHead className="text-right">KM média OS</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {relMotos.historicoResumo.length === 0 ? (
                      <TabelaVazia cols={3} msg="Sem histórico no período." />
                    ) : (
                      relMotos.historicoResumo.map((m) => (
                        <TableRow key={m.motoId}>
                          <TableCell className="font-medium">{m.label}</TableCell>
                          <TableCell className="text-right">
                            {m.kmMedia ? `${m.kmMedia.toLocaleString('pt-BR')} km` : '—'}
                          </TableCell>
                          <TableCell className="text-right">{formatarMoeda(m.valorTotal)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardContent className="pt-6">
                <StatCard
                  titulo="Quilometragem média registrada"
                  valor={`${relMotos.kmMediaGeral.toLocaleString('pt-BR')} km`}
                  icone={Bike}
                  descricao="Média das motos cadastradas na oficina"
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="estoque">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Peças mais vendidas</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Peça</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {estoque.maisVendidas.length === 0 ? (
                      <TabelaVazia cols={3} msg="Nenhuma peça vendida no período." />
                    ) : (
                      estoque.maisVendidas.map((p) => (
                        <TableRow key={p.pecaId}>
                          <TableCell className="font-medium">{p.nome}</TableCell>
                          <TableCell className="text-right">{p.quantidade}</TableCell>
                          <TableCell className="text-right">{formatarMoeda(p.receita)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Peças com estoque baixo</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Peça</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {estoque.estoqueBaixo.length === 0 ? (
                      <TabelaVazia cols={3} msg="Estoque OK em todas as peças." />
                    ) : (
                      estoque.estoqueBaixo.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.nome}</TableCell>
                          <TableCell className="text-right">{p.quantidade}</TableCell>
                          <TableCell>
                            <EstoqueBadge quantidade={p.quantidade} minimo={p.estoque_minimo} />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <StatCard
                  titulo="Valor total em estoque"
                  valor={estoque.valorTotalEstoque}
                  icone={Package}
                  formatarComoMoeda
                  descricao="Custo × quantidade de todas as peças"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lucro estimado por peça</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Peça</TableHead>
                      <TableHead className="text-right">Lucro/un</TableHead>
                      <TableHead className="text-right">Lucro total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {estoque.lucroPorPeca.slice(0, 8).map((p) => (
                      <TableRow key={p.pecaId}>
                        <TableCell className="font-medium">{p.nome}</TableCell>
                        <TableCell className="text-right">{formatarMoeda(p.lucroUnitario)}</TableCell>
                        <TableCell className="text-right text-emerald-400">
                          {formatarMoeda(p.lucroTotal)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <StatCard
                  titulo="Entradas no período"
                  valor={estoque.entradasPeriodo.valor}
                  icone={Package}
                  formatarComoMoeda
                  descricao={`${estoque.entradasPeriodo.quantidade} unidades`}
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <StatCard
                  titulo="Saídas no período"
                  valor={estoque.saidasPeriodo.valor}
                  icone={Package}
                  formatarComoMoeda
                  descricao={`${estoque.saidasPeriodo.quantidade} unidades`}
                  variante="warning"
                />
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Fornecedores mais utilizados</CardTitle>
                <CardDescription>Entradas de estoque no período</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead className="text-right">Entradas</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {estoque.fornecedoresMaisUtilizados.length === 0 ? (
                      <TabelaVazia cols={3} msg="Nenhuma entrada com fornecedor no período." />
                    ) : (
                      estoque.fornecedoresMaisUtilizados.map((f) => (
                        <TableRow key={f.fornecedor_id}>
                          <TableCell className="font-medium">{f.nome}</TableCell>
                          <TableCell className="text-right">{f.entradas}</TableCell>
                          <TableCell className="text-right">{formatarMoeda(f.valor)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="servicos">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Serviços mais executados</CardTitle>
                <CardDescription>OS finalizadas no período</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Serviço</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {relServicos.maisExecutados.length === 0 ? (
                      <TabelaVazia cols={2} msg="Nenhum serviço registrado no período." />
                    ) : (
                      relServicos.maisExecutados.map((s) => (
                        <TableRow key={s.servicoId ?? s.nome}>
                          <TableCell className="font-medium">{s.nome}</TableCell>
                          <TableCell className="text-right">{s.quantidade}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Maior receita de mão de obra</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Serviço</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {relServicos.maisReceita.length === 0 ? (
                      <TabelaVazia cols={2} msg="Sem receita de serviços no período." />
                    ) : (
                      relServicos.maisReceita.map((s) => (
                        <TableRow key={`rec-${s.servicoId ?? s.nome}`}>
                          <TableCell className="font-medium">{s.nome}</TableCell>
                          <TableCell className="text-right">{formatarMoeda(s.receita)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Mais retorno de clientes</CardTitle>
                <CardDescription>Clientes distintos atendidos por serviço</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Serviço</TableHead>
                      <TableHead className="text-right">Clientes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {relServicos.maisRetorno.length === 0 ? (
                      <TabelaVazia cols={2} msg="Sem dados de retorno no período." />
                    ) : (
                      relServicos.maisRetorno.map((s) => (
                        <TableRow key={`ret-${s.servicoId ?? s.nome}`}>
                          <TableCell className="font-medium">{s.nome}</TableCell>
                          <TableCell className="text-right">{s.clientesUnicos}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="financeiro">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contas a receber</CardTitle>
                <CardDescription>
                  Total pendente: {formatarMoeda(financeiro.totalReceber)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {financeiro.contasReceber.length === 0 ? (
                      <TabelaVazia cols={3} msg="Nenhuma conta a receber." />
                    ) : (
                      financeiro.contasReceber.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="font-medium">{l.descricao}</TableCell>
                          <TableCell>
                            {l.vencimento ? formatarData(l.vencimento) : '—'}
                          </TableCell>
                          <TableCell className="text-right">{formatarMoeda(l.valor)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contas a pagar</CardTitle>
                <CardDescription>Total pendente: {formatarMoeda(financeiro.totalPagar)}</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {financeiro.contasPagar.length === 0 ? (
                      <TabelaVazia cols={3} msg="Nenhuma conta a pagar." />
                    ) : (
                      financeiro.contasPagar.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="font-medium">{l.descricao}</TableCell>
                          <TableCell>
                            {l.vencimento ? formatarData(l.vencimento) : '—'}
                          </TableCell>
                          <TableCell className="text-right">{formatarMoeda(l.valor)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Formas de pagamento mais usadas</CardTitle>
                <CardDescription>Receitas pagas no período</CardDescription>
              </CardHeader>
              <CardContent>
                {financeiro.formasPagamento.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem recebimentos no período.</p>
                ) : (
                  <>
                    <GraficoBarrasSimples
                      itens={financeiro.formasPagamento.map((f) => ({
                        label: f.label.split(' ')[0],
                        valor: f.valor,
                      }))}
                      formatarValor={formatarMoeda}
                    />
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Forma</TableHead>
                          <TableHead className="text-right">Transações</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {financeiro.formasPagamento.map((f) => (
                          <TableRow key={f.forma}>
                            <TableCell className="font-medium">{f.label}</TableCell>
                            <TableCell className="text-right">{f.quantidade}</TableCell>
                            <TableCell className="text-right">{formatarMoeda(f.valor)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export function RelatoriosPage() {
  return (
    <RecursoPlanoGate recurso="relatorios_avancados" pagina className="min-h-[520px]">
      <RelatoriosConteudo />
    </RecursoPlanoGate>
  )
}
