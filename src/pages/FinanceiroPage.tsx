import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, CheckCircle, Loader2 } from 'lucide-react'
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
import { RecursoPlanoGate } from '@/components/plano/RecursoPlanoGate'
import { ResumoParcelamentoPreview } from '@/components/shared/ResumoParcelamentoPreview'
import { ContasReceberOSTable } from '@/components/financeiro/ContasReceberOSTable'
import { listarContasReceber } from '@/services/os-pagamento.service'
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
import { DollarSign, TrendingDown, TrendingUp, Users } from 'lucide-react'
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

export function FinanceiroPage() {
  const { session } = useAuth()
  const { adicionarLancamento, atualizarLancamento, excluirLancamento } = useCraft()
  const { verificarEscrita } = usePlanoEscrita()
  const { lancamentos, ordens, clientes, motos, configuracao, perfisComissao } = useOficinaData()
  const { confirmar } = useConfirmacao()
  const { toast } = useToast()
  const { executar, salvando } = useSalvarAcao()
  const [dialogAberto, setDialogAberto] = useState(false)
  const [editando, setEditando] = useState<LancamentoFinanceiro | null>(null)
  const [form, setForm] = useState<FormLancamento>(formVazio)
  const [tipoNovo, setTipoNovo] = useState<TipoLancamento>('receita')

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

  const metricas = useMemo(() => {
    const doMes = lancamentos.filter((l) => lancamentoNoMes(l.data, mesAtual))
    const receitas = doMes.filter((l) => l.tipo === 'receita').reduce((a, l) => a + l.valor, 0)
    const despesasLancamentos = doMes
      .filter((l) => l.tipo === 'despesa')
      .reduce((a, l) => a + l.valor, 0)
    const despesasPrevistasFuncionarios = despesasFuncionarios?.total ?? 0
    const despesas = despesasLancamentos + despesasPrevistasFuncionarios
    return {
      receitas,
      despesas,
      despesasLancamentos,
      despesasPrevistasFuncionarios,
      lucro: receitas - despesas,
    }
  }, [lancamentos, mesAtual, despesasFuncionarios])

  const receitas = lancamentos.filter((l) => l.tipo === 'receita')
  const despesas = lancamentos.filter((l) => l.tipo === 'despesa')
  const contasPagar = lancamentos.filter((l) => l.tipo === 'despesa' && !l.pago)
  const contasReceber = lancamentos.filter((l) => l.tipo === 'receita' && !l.pago)

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

    atualizarLancamento(lanc.id, { pago: true })
    toast.sucesso('Pagamento registrado com sucesso.')
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

  function TabelaLancamentos({ items }: { items: LancamentoFinanceiro[] }) {
    const ordenados = [...items].sort((a, b) => b.data.localeCompare(a.data))

    return (
      <>
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Forma</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordenados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Nenhum lançamento.
                  </TableCell>
                </TableRow>
              ) : (
                ordenados.map((lanc) => (
                  <TableRow key={lanc.id}>
                    <TableCell>{formatarData(lanc.data)}</TableCell>
                    <TableCell className="font-medium">{lanc.descricao}</TableCell>
                    <TableCell>{formatarFormaPagamentoHistorico(lanc)}</TableCell>
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
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="md:hidden space-y-3">
          {ordenados.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum lançamento.</p>
          ) : (
            ordenados.map((lanc) => (
              <Card key={lanc.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{lanc.descricao}</p>
                      <p className="text-sm text-muted-foreground">{formatarData(lanc.data)}</p>
                    </div>
                    <p className="text-lg font-semibold">{formatarMoeda(lanc.valor)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">{formatarFormaPagamentoHistorico(lanc)}</span>
                    {lanc.pago ? (
                      <Badge variant="success">Pago</Badge>
                    ) : (
                      <Badge variant="warning">
                        Pendente{lanc.vencimento ? ` — ${formatarData(lanc.vencimento)}` : ''}
                      </Badge>
                    )}
                  </div>
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
              {podeGerenciarComissoes && (
                <TabsTrigger value="comissoes" className="gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Funcionários e Comissões
                </TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="receitas">
              <TabelaLancamentos items={receitas} />
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
            <TabsContent value="receber">
              <div className="mb-6">
                <h3 className="mb-3 text-sm font-semibold">Contas a receber — Ordens de Serviço</h3>
                <ContasReceberOSTable contas={contasReceberOS} />
              </div>
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                Lançamentos pendentes (geral)
              </h3>
              <TabelaLancamentos items={contasReceber} />
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
