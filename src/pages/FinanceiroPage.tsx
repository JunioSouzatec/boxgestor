import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, CheckCircle, Loader2, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePlanoEscrita } from '@/hooks/usePlanoEscrita'
import { StatCard } from '@/components/shared/StatCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import { useToast } from '@/context/ToastContext'
import { useSalvarAcao } from '@/hooks/useSalvarAcao'
import { marcarLancamentoComoPagoPersistindo } from '@/services/financeiro/marcar-lancamento-pago.service'
import {
  classificarOrigemLancamento,
  filtrarVendasBalcaoPendentes,
  isReceitaSomenteExibicaoCounterSale,
  labelNumeroVendaBalcao,
  labelOrigemFinanceiro,
  listarLancamentosGeraisPendentes,
  listarLancamentosVbPendentesSemVenda,
  listarReceitasRecebidasUnificadas,
  tituloExibicaoLancamento,
  type FiltroOrigemFinanceiro,
} from '@/services/financeiro/financeiro-listagem.helpers'
import { marcarPularPersistenciaRemotaProxima } from '@/services/supabase-sync/persistencia-opcoes'
import { RecursoPlanoGate } from '@/components/plano/RecursoPlanoGate'
import { ResumoParcelamentoPreview } from '@/components/shared/ResumoParcelamentoPreview'
import { ContasReceberOSTable } from '@/components/financeiro/ContasReceberOSTable'
import { CaixaSection } from '@/components/financeiro/CaixaSection'
import { listarContasReceber } from '@/services/os-pagamento.service'
import { listarVendasBalcao } from '@/services/venda-balcao/venda-balcao.service'
import {
  formatarFormaPagamentoHistorico,
  OPCOES_PARCELAS,
  parcelasCreditoValidas,
} from '@/lib/pagamento-format'
import { calcularDespesasPrevistasFuncionariosMes } from '@/services/financeiro/despesas-funcionarios.service'
import { formatarData, formatarMoeda, getDataLocalHoje, getMesLocalAtual, cn } from '@/lib/utils'
import { lancamentoNoMes } from '@/lib/dados-legados'
import type { FormaPagamento, LancamentoFinanceiro, TipoLancamento } from '@/types'
import { FORMAS_PAGAMENTO } from '@/types'
import { textoSemFiadoVisivel } from '@/types/labels'
import type { VendaBalcao } from '@/types/venda-balcao'
import {
  formatarFormaBalcaoComParcelas,
  obterParcelasCraftMetaVenda,
} from '@/services/venda-balcao/venda-balcao-forma.helpers'
import { DollarSign, TrendingDown, TrendingUp, Users, Wallet } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { FuncionariosComissoesSection } from '@/components/financeiro/FuncionariosComissoesSection'
import { MinhaComissaoSection } from '@/components/financeiro/MinhaComissaoSection'
import {
  modoFinanceiroOperacionalApenas,
  podeGerenciarComissoesFuncionarios,
  podeVerDespesasInternas,
  podeVerFinanceiroCompleto,
  podeVerLucroReal,
  podeVerMinhaComissao,
} from '@/services/auth/permissions'
import { obterComissoesConfig } from '@/types/comissoes'

type FormLancamento = Omit<LancamentoFinanceiro, 'id' | 'oficina_id'>

const LIMITE_INICIAL = 30

const formVazio: FormLancamento = {
  tipo: 'receita',
  descricao: '',
  valor: 0,
  forma_pagamento: 'pix',
  data: getDataLocalHoje(),
  pago: true,
  vencimento: '',
  parcelas: 1,
}

function BadgeOrigem({ origem }: { origem: ReturnType<typeof classificarOrigemLancamento> }) {
  const label = labelOrigemFinanceiro(origem)
  const variante =
    origem === 'os' ? 'secondary' : origem === 'venda_balcao' ? 'default' : 'outline'
  return <Badge variant={variante}>{label}</Badge>
}

export function FinanceiroPage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const { adicionarLancamento, atualizarLancamento, excluirLancamento, oficinaId, aplicarDatabase } =
    useCraft()
  const { verificarEscrita } = usePlanoEscrita()
  const { lancamentos, ordens, clientes, motos, configuracao, perfisComissao } = useOficinaData()
  const { confirmar } = useConfirmacao()
  const { toast } = useToast()
  const { executar, salvando } = useSalvarAcao()
  const [dialogAberto, setDialogAberto] = useState(false)
  const [editando, setEditando] = useState<LancamentoFinanceiro | null>(null)
  const [form, setForm] = useState<FormLancamento>(formVazio)
  const [tipoNovo, setTipoNovo] = useState<TipoLancamento>('receita')
  const [filtroReceitas, setFiltroReceitas] = useState<FiltroOrigemFinanceiro>('todas')
  const [filtroReceber, setFiltroReceber] = useState<'todos' | 'venda_balcao' | 'os' | 'geral'>(
    'todos'
  )
  const [limiteReceitas, setLimiteReceitas] = useState(LIMITE_INICIAL)
  const [vendasBalcao, setVendasBalcao] = useState<VendaBalcao[]>([])
  const [carregandoVb, setCarregandoVb] = useState(false)

  const mesAtual = getMesLocalAtual()

  const comissoesConfig = obterComissoesConfig(configuracao)
  const user = session?.user
  const modoCompleto = podeVerFinanceiroCompleto(user, configuracao)
  const modoOperacional = modoFinanceiroOperacionalApenas(user, configuracao)
  const podeVerLucro = podeVerLucroReal(user, configuracao)
  const podeVerDespesas = podeVerDespesasInternas(user, configuracao)
  const podeGerenciarComissoes = podeGerenciarComissoesFuncionarios(user, configuracao)
  const modoMinhaComissao =
    !podeGerenciarComissoes && !modoCompleto && !modoOperacional &&
    podeVerMinhaComissao(user, configuracao)

  useEffect(() => {
    if (!oficinaId || modoMinhaComissao) return
    let cancelado = false
    setCarregandoVb(true)
    void listarVendasBalcao(oficinaId, { limite: 500 })
      .then((lista) => {
        if (cancelado) return
        setVendasBalcao(lista)
      })
      .catch(() => {
        if (!cancelado) setVendasBalcao([])
      })
      .finally(() => {
        if (!cancelado) setCarregandoVb(false)
      })
    return () => {
      cancelado = true
    }
  }, [oficinaId, modoMinhaComissao, lancamentos])

  const vendasPendentes = useMemo(
    () => filtrarVendasBalcaoPendentes(vendasBalcao),
    [vendasBalcao]
  )

  const despesasFuncionarios = useMemo(() => {
    if (!podeGerenciarComissoes) return null
    return calcularDespesasPrevistasFuncionariosMes(
      perfisComissao,
      ordens,
      lancamentos,
      mesAtual,
      comissoesConfig
    )
  }, [podeGerenciarComissoes, perfisComissao, ordens, lancamentos, mesAtual, comissoesConfig])

  const receitasParaFaturamento = useMemo(
    () => listarReceitasRecebidasUnificadas(lancamentos, vendasBalcao, 'todas', oficinaId),
    [lancamentos, vendasBalcao, oficinaId]
  )

  const receitasRecebidas = useMemo(() => {
    if (filtroReceitas === 'todas') return receitasParaFaturamento
    return receitasParaFaturamento.filter(
      (l) => classificarOrigemLancamento(l) === filtroReceitas
    )
  }, [receitasParaFaturamento, filtroReceitas])
  const receitasVisiveis = receitasRecebidas.slice(0, limiteReceitas)

  const metricas = useMemo(() => {
    const doMes = receitasParaFaturamento.filter(
      (l) => lancamentoNoMes(l.data, mesAtual) && Boolean(l.pago)
    )
    const receitas = doMes.reduce((a, l) => a + (Number(l.valor) || 0), 0)
    const despesasDoMes = lancamentos.filter(
      (l) =>
        lancamentoNoMes(l.data, mesAtual) &&
        !l.cancelado &&
        !l.sync_arquivado &&
        Boolean(l.pago) &&
        l.tipo === 'despesa'
    )
    const despesasLancamentos = despesasDoMes.reduce((a, l) => a + l.valor, 0)
    const despesasPrevistasFuncionarios = despesasFuncionarios?.total ?? 0
    const despesas = despesasLancamentos + despesasPrevistasFuncionarios
    return {
      receitas,
      despesas,
      despesasLancamentos,
      despesasPrevistasFuncionarios,
      lucro: receitas - despesas,
    }
  }, [receitasParaFaturamento, lancamentos, mesAtual, despesasFuncionarios])

  const despesas = lancamentos.filter(
    (l) => l.tipo === 'despesa' && !l.cancelado && !l.sync_arquivado
  )
  const contasPagar = lancamentos.filter(
    (l) => l.tipo === 'despesa' && !l.pago && !l.cancelado && !l.sync_arquivado
  )
  const geraisPendentes = useMemo(
    () => listarLancamentosGeraisPendentes(lancamentos),
    [lancamentos]
  )
  const vbLancamentosOrfaos = useMemo(
    () => listarLancamentosVbPendentesSemVenda(lancamentos, vendasPendentes),
    [lancamentos, vendasPendentes]
  )

  const getClienteNome = (id: string) => clientes.find((c) => c.id === id)?.nome ?? '—'
  const getMotoLabel = (id: string) => {
    const m = motos.find((mo) => mo.id === id)
    return m ? `${m.marca} ${m.modelo} (${m.placa})` : '—'
  }

  const contasReceberOS = useMemo(
    () => listarContasReceber(ordens, lancamentos, getClienteNome, getMotoLabel),
    [ordens, lancamentos, clientes, motos]
  )

  function abrirNovo(tipo: TipoLancamento) {
    setTipoNovo(tipo)
    setEditando(null)
    setForm({ ...formVazio, tipo })
    setDialogAberto(true)
  }

  function abrirEditar(lanc: LancamentoFinanceiro) {
    setEditando(lanc)
    setForm({
      tipo: lanc.tipo,
      descricao: lanc.descricao,
      valor: lanc.valor,
      forma_pagamento: lanc.forma_pagamento,
      data: lanc.data,
      pago: lanc.pago,
      vencimento: lanc.vencimento ?? '',
      parcelas:
        lanc.forma_pagamento === 'credito'
          ? parcelasCreditoValidas(lanc.parcelas)
          : undefined,
    })
    setDialogAberto(true)
  }

  function salvar() {
    if (!verificarEscrita()) return
    void executar({
      validar: () => {
        if (!form.descricao.trim() || form.valor <= 0) {
          return 'Verifique os campos obrigatórios (descrição e valor).'
        }
        return null
      },
      acao: () => {
        const dados = {
          ...form,
          vencimento: form.vencimento || undefined,
          parcelas:
            form.tipo === 'receita' && form.forma_pagamento === 'credito'
              ? parcelasCreditoValidas(form.parcelas)
              : undefined,
        }
        if (editando) {
          atualizarLancamento(editando.id, dados)
        } else {
          adicionarLancamento(dados)
        }
      },
      sucesso: editando ? 'Lançamento salvo com sucesso.' : 'Pagamento registrado com sucesso.',
      onSuccess: () => setDialogAberto(false),
    })
  }

  async function marcarComoPago(lanc: LancamentoFinanceiro) {
    const os = lanc.ordem_servico_id
      ? ordens.find((o) => o.id === lanc.ordem_servico_id)
      : undefined
    const clienteNome = os
      ? clientes.find((c) => c.id === os.cliente_id)?.nome
      : undefined
    const contexto: string[] = []
    if (os) contexto.push(`OS #${os.numero}`)
    if (clienteNome) contexto.push(clienteNome)
    const sufixoContexto = contexto.length > 0 ? ` (${contexto.join(' — ')})` : ''

    const ok = await confirmar({
      titulo: 'Confirmar recebimento?',
      mensagem: `Você confirma que recebeu este pagamento de ${formatarMoeda(lanc.valor)}${sufixoContexto}? Essa ação marcará o lançamento como pago.`,
      confirmarTexto: 'Confirmar recebimento',
      cancelarTexto: 'Cancelar',
    })
    if (!ok) return

    void executar({
      acao: async () => {
        const resultado = await marcarLancamentoComoPagoPersistindo(oficinaId, lanc.id)
        if (resultado.database) {
          marcarPularPersistenciaRemotaProxima()
          aplicarDatabase(resultado.database)
        }
        if (!resultado.ok) {
          throw new Error(
            resultado.mensagem?.trim() ||
              'Não foi possível marcar como pago. Tente novamente.'
          )
        }
      },
      sucesso: 'Pagamento registrado com sucesso.',
    })
  }

  async function confirmarExclusao(lanc: LancamentoFinanceiro) {
    const ok = await confirmar({
      titulo: 'Excluir lançamento',
      mensagem: `Tem certeza que deseja excluir o lançamento "${lanc.descricao}"?`,
      confirmarTexto: 'Excluir',
      destrutivo: true,
    })
    if (ok) {
      excluirLancamento(lanc.id)
      toast.sucesso('Lançamento excluído com sucesso.')
    }
  }

  function TabelaLancamentos({
    items,
    mostrarOrigem = false,
    vazio = 'Nenhum lançamento.',
  }: {
    items: LancamentoFinanceiro[]
    mostrarOrigem?: boolean
    vazio?: string
  }) {
    const ordenados = [...items].sort((a, b) => b.data.localeCompare(a.data))
    const colunas = mostrarOrigem ? 7 : 6

    return (
      <>
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                {mostrarOrigem && <TableHead>Origem</TableHead>}
                <TableHead>{mostrarOrigem ? 'Descrição' : 'Descrição'}</TableHead>
                <TableHead>Forma</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordenados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colunas} className="text-center text-muted-foreground">
                    {vazio}
                  </TableCell>
                </TableRow>
              ) : (
                ordenados.map((lanc) => {
                  const origem = classificarOrigemLancamento(lanc)
                  const somenteExibicao = isReceitaSomenteExibicaoCounterSale(lanc)
                  return (
                    <TableRow key={lanc.id}>
                      <TableCell>{formatarData(lanc.data)}</TableCell>
                      {mostrarOrigem && (
                        <TableCell>
                          <BadgeOrigem origem={origem} />
                        </TableCell>
                      )}
                      <TableCell className="font-medium">
                        {mostrarOrigem
                          ? tituloExibicaoLancamento(lanc)
                          : textoSemFiadoVisivel(lanc.descricao)}
                      </TableCell>
                      <TableCell>
                        {(typeof lanc.craft_meta?.payment_method_label === 'string' &&
                          lanc.craft_meta.payment_method_label.trim()) ||
                          formatarFormaPagamentoHistorico(lanc)}
                      </TableCell>
                      <TableCell>
                        {lanc.pago ? (
                          <Badge variant="success">Pago</Badge>
                        ) : (
                          <Badge variant="warning">
                            Pendente{lanc.vencimento ? ` — ${formatarData(lanc.vencimento)}` : ''}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{formatarMoeda(lanc.valor)}</TableCell>
                      <TableCell className="text-right">
                        {somenteExibicao ? (
                          <span className="text-xs text-muted-foreground">Venda Balcão</span>
                        ) : (
                          <div className="flex justify-end gap-1">
                            {!lanc.pago && (
                              <Button variant="ghost" size="icon" onClick={() => marcarComoPago(lanc)}>
                                <CheckCircle className="h-4 w-4 text-emerald-400" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => abrirEditar(lanc)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => confirmarExclusao(lanc)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="md:hidden space-y-3">
          {ordenados.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{vazio}</p>
          ) : (
            ordenados.map((lanc) => {
              const somenteExibicao = isReceitaSomenteExibicaoCounterSale(lanc)
              return (
              <Card key={lanc.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      {mostrarOrigem && (
                        <BadgeOrigem origem={classificarOrigemLancamento(lanc)} />
                      )}
                      <p className="font-semibold">
                        {mostrarOrigem
                          ? tituloExibicaoLancamento(lanc)
                          : textoSemFiadoVisivel(lanc.descricao)}
                      </p>
                      <p className="text-sm text-muted-foreground">{formatarData(lanc.data)}</p>
                    </div>
                    <p className="text-lg font-semibold">{formatarMoeda(lanc.valor)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">
                      {(typeof lanc.craft_meta?.payment_method_label === 'string' &&
                        lanc.craft_meta.payment_method_label.trim()) ||
                        formatarFormaPagamentoHistorico(lanc)}
                    </span>
                    {lanc.pago ? (
                      <Badge variant="success">Pago</Badge>
                    ) : (
                      <Badge variant="warning">
                        Pendente{lanc.vencimento ? ` — ${formatarData(lanc.vencimento)}` : ''}
                      </Badge>
                    )}
                  </div>
                  {somenteExibicao ? (
                    <p className="text-xs text-muted-foreground">
                      Origem: Venda Balcão (counter_sales)
                    </p>
                  ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {!lanc.pago && (
                      <Button variant="outline" size="lg" className="h-11" onClick={() => marcarComoPago(lanc)}>
                        <CheckCircle className="mr-2 h-4 w-4 text-emerald-400" />
                        Marcar pago
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="lg"
                      className={cn('h-11', lanc.pago && 'col-span-2')}
                      onClick={() => abrirEditar(lanc)}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="lg"
                      className="h-11 text-destructive"
                      onClick={() => confirmarExclusao(lanc)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Excluir
                    </Button>
                  </div>
                  )}
                </CardContent>
              </Card>
              )
            })
          )}
        </div>
      </>
    )
  }

  function TabelaVendasBalcaoPendentes({ vendas }: { vendas: VendaBalcao[] }) {
    return (
      <>
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Forma</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Nenhuma venda balcão pendente.
                  </TableCell>
                </TableRow>
              ) : (
                vendas.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>{formatarData(v.sold_at || v.created_at)}</TableCell>
                    <TableCell>
                      <BadgeOrigem origem="venda_balcao" />
                    </TableCell>
                    <TableCell className="font-medium">{labelNumeroVendaBalcao(v)}</TableCell>
                    <TableCell>{v.customer_name?.trim() || '—'}</TableCell>
                    <TableCell>
                      {v.payment_method && v.payment_method !== 'pendente'
                        ? formatarFormaBalcaoComParcelas(
                            v.payment_method,
                            obterParcelasCraftMetaVenda(v)
                          )
                        : 'A receber'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="warning">A receber</Badge>
                    </TableCell>
                    <TableCell className="text-right text-amber-400">
                      {formatarMoeda(Number(v.pending_amount) || Number(v.total) || 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="gap-1.5"
                        onClick={() => navigate('/vendas-balcao')}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Receber
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="md:hidden space-y-3">
          {vendas.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhuma venda balcão pendente.
            </p>
          ) : (
            vendas.map((v) => (
              <Card key={v.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <BadgeOrigem origem="venda_balcao" />
                      <p className="font-semibold">{labelNumeroVendaBalcao(v)}</p>
                      <p className="text-sm text-muted-foreground">
                        {v.customer_name?.trim() || 'Cliente não informado'} ·{' '}
                        {formatarData(v.sold_at || v.created_at)}
                      </p>
                    </div>
                    <p className="text-lg font-semibold text-amber-400">
                      {formatarMoeda(Number(v.pending_amount) || Number(v.total) || 0)}
                    </p>
                  </div>
                  <Badge variant="warning">A receber</Badge>
                  <Button className="h-11 w-full" onClick={() => navigate('/vendas-balcao')}>
                    Receber pagamento
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </>
    )
  }

  if (modoMinhaComissao) {
    return (
      <RecursoPlanoGate recurso="financeiro_basico" pagina>
        <MinhaComissaoSection />
      </RecursoPlanoGate>
    )
  }

  if (modoOperacional) {
    return (
      <RecursoPlanoGate recurso="financeiro_basico" pagina>
        <div>
          <PageHeader
            titulo="Financeiro operacional"
            descricao="Pagamentos de OS e recebimentos do dia — sem lucro, salários ou comissões."
          />
          <Card>
            <CardContent className="pt-6">
              <ContasReceberOSTable contas={contasReceberOS} />
            </CardContent>
          </Card>
        </div>
      </RecursoPlanoGate>
    )
  }

  return (
    <RecursoPlanoGate recurso="financeiro_basico" pagina>
      <div>
      <PageHeader
        titulo="Financeiro"
        descricao="Receitas, despesas e fluxo de caixa"
        acoes={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => abrirNovo('despesa')}>
              <Plus className="h-4 w-4" />
              Nova despesa
            </Button>
            <Button onClick={() => abrirNovo('receita')}>
              <Plus className="h-4 w-4" />
              Nova receita
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {podeVerLucro && (
          <>
            <StatCard
              titulo="Faturamento do mês"
              valor={metricas.receitas}
              icone={DollarSign}
              formatarComoMoeda
              variante="success"
            />
            <StatCard
              titulo="Despesas do mês"
              valor={metricas.despesas}
              icone={TrendingDown}
              formatarComoMoeda
              variante="warning"
              descricao={
                podeVerDespesas && metricas.despesasPrevistasFuncionarios > 0
                  ? `Inclui ${formatarMoeda(metricas.despesasPrevistasFuncionarios)} previstos (salários/comissões)`
                  : undefined
              }
            />
            <StatCard
              titulo="Lucro estimado"
              valor={metricas.lucro}
              icone={TrendingUp}
              formatarComoMoeda
              variante={metricas.lucro >= 0 ? 'success' : 'warning'}
            />
          </>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="receitas">
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="receitas">Receitas</TabsTrigger>
              <TabsTrigger value="despesas">Despesas</TabsTrigger>
              <TabsTrigger value="pagar">Contas a pagar</TabsTrigger>
              <TabsTrigger value="receber">Contas a receber</TabsTrigger>
              <TabsTrigger value="caixa" className="gap-1.5">
                <Wallet className="h-3.5 w-3.5" />
                Caixa
              </TabsTrigger>
              {podeGerenciarComissoes && (
                <TabsTrigger value="comissoes" className="gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Funcionários e Comissões
                </TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="receitas" className="space-y-4 pt-2">
              <div>
                <h3 className="text-base font-semibold">Receitas recebidas</h3>
                <p className="text-sm text-muted-foreground">
                  Entradas já pagas/recebidas. Pendentes ficam em Contas a receber.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['todas', 'Todas'],
                    ['os', 'OS'],
                    ['venda_balcao', 'Venda Balcão'],
                    ['manual', 'Manual'],
                  ] as const
                ).map(([valor, label]) => (
                  <Button
                    key={valor}
                    type="button"
                    size="sm"
                    variant={filtroReceitas === valor ? 'default' : 'outline'}
                    onClick={() => {
                      setFiltroReceitas(valor)
                      setLimiteReceitas(LIMITE_INICIAL)
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <TabelaLancamentos
                items={receitasVisiveis}
                mostrarOrigem
                vazio="Nenhuma receita recebida neste filtro."
              />
              {receitasRecebidas.length > limiteReceitas && (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLimiteReceitas((n) => n + LIMITE_INICIAL)}
                  >
                    Ver mais ({receitasRecebidas.length - limiteReceitas} restantes)
                  </Button>
                </div>
              )}
            </TabsContent>
            <TabsContent value="despesas">
              {podeGerenciarComissoes && despesasFuncionarios && despesasFuncionarios.total > 0 && (
                <div className="mb-6 space-y-3">
                  <h3 className="text-sm font-semibold">Despesas previstas — funcionários</h3>
                  <p className="text-xs text-muted-foreground">
                    Valores calculados com base no cadastro de Funcionários e Comissões. Não duplicam
                    lançamentos manuais — registre o pagamento quando quiser.
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Categoria</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...despesasFuncionarios.salarios, ...despesasFuncionarios.comissoes].map(
                          (d) => (
                            <TableRow key={d.id}>
                              <TableCell>{d.descricao}</TableCell>
                              <TableCell>
                                {d.categoria === 'salarios_funcionarios'
                                  ? 'Salários/Funcionários'
                                  : 'Comissões'}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatarMoeda(d.valor)}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary">Prevista</Badge>
                              </TableCell>
                            </TableRow>
                          )
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Lançamentos registrados</h3>
              <TabelaLancamentos items={despesas} />
            </TabsContent>
            <TabsContent value="pagar">
              <TabelaLancamentos items={contasPagar} />
            </TabsContent>
            <TabsContent value="receber" className="space-y-6 pt-2">
              <div>
                <h3 className="text-base font-semibold">Contas a receber</h3>
                <p className="text-sm text-muted-foreground">
                  Valores pendentes de recebimento: vendas balcão, ordens de serviço e lançamentos
                  gerais.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['todos', 'Todos'],
                    ['venda_balcao', 'Vendas Balcão'],
                    ['os', 'OS'],
                    ['geral', 'Gerais'],
                  ] as const
                ).map(([valor, label]) => (
                  <Button
                    key={valor}
                    type="button"
                    size="sm"
                    variant={filtroReceber === valor ? 'default' : 'outline'}
                    onClick={() => setFiltroReceber(valor)}
                  >
                    {label}
                  </Button>
                ))}
              </div>

              {(filtroReceber === 'todos' || filtroReceber === 'venda_balcao') && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold">Vendas Balcão pendentes</h4>
                    {carregandoVb && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Atualizando…
                      </span>
                    )}
                  </div>
                  <TabelaVendasBalcaoPendentes vendas={vendasPendentes} />
                  {vbLancamentosOrfaos.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Lançamentos de venda balcão pendentes (legado):
                      </p>
                      <TabelaLancamentos
                        items={vbLancamentosOrfaos}
                        mostrarOrigem
                        vazio="Nenhum lançamento legado."
                      />
                    </div>
                  )}
                </div>
              )}

              {(filtroReceber === 'todos' || filtroReceber === 'os') && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Ordens de Serviço pendentes</h4>
                  <ContasReceberOSTable contas={contasReceberOS} />
                </div>
              )}

              {(filtroReceber === 'todos' || filtroReceber === 'geral') && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Lançamentos pendentes gerais</h4>
                  <TabelaLancamentos
                    items={geraisPendentes}
                    mostrarOrigem
                    vazio="Nenhuma conta a receber geral."
                  />
                </div>
              )}
            </TabsContent>
            <TabsContent value="caixa" className="pt-2">
              <CaixaSection />
            </TabsContent>
            {podeGerenciarComissoes && (
              <TabsContent value="comissoes" className="pt-4">
                <FuncionariosComissoesSection />
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editando
                ? 'Editar lançamento'
                : tipoNovo === 'receita'
                  ? 'Nova receita'
                  : 'Nova despesa'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="desc">Descrição *</Label>
              <Input
                id="desc"
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="valor">Valor *</Label>
              <MoneyInput
                id="valor"
                value={form.valor}
                onChange={(valor) => setForm({ ...form, valor })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Forma de pagamento</Label>
              <Select
                value={form.forma_pagamento}
                onValueChange={(v) => {
                  const forma = v as FormaPagamento
                  setForm({
                    ...form,
                    forma_pagamento: forma,
                    parcelas: forma === 'credito' ? parcelasCreditoValidas(form.parcelas) : undefined,
                  })
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMAS_PAGAMENTO.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.tipo === 'receita' && form.forma_pagamento === 'credito' && (
              <div className="grid gap-2">
                <Label>Quantidade de parcelas</Label>
                <Select
                  value={String(parcelasCreditoValidas(form.parcelas))}
                  onValueChange={(v) => setForm({ ...form, parcelas: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPCOES_PARCELAS.map((opcao) => (
                      <SelectItem key={opcao.value} value={String(opcao.value)}>
                        {opcao.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.tipo === 'receita' &&
              form.forma_pagamento === 'credito' &&
              form.valor > 0 && (
                <ResumoParcelamentoPreview
                  valor={form.valor}
                  formaPagamento={form.forma_pagamento}
                  parcelas={form.parcelas}
                />
              )}
            <div className="grid gap-2">
              <Label htmlFor="data">Data</Label>
              <Input
                id="data"
                type="date"
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="venc">Vencimento (se pendente)</Label>
              <Input
                id="venc"
                type="date"
                value={form.vencimento}
                onChange={(e) => setForm({ ...form, vencimento: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="pago"
                checked={form.pago}
                onChange={(e) => setForm({ ...form, pago: e.target.checked })}
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="pago">Já pago / recebido</Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogAberto(false)}>
                Cancelar
              </Button>
              <Button onClick={salvar} disabled={salvando}>
                {salvando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando…
                  </>
                ) : (
                  'Salvar'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </RecursoPlanoGate>
  )
}
