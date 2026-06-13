import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, CheckCircle } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
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
import { RecursoPlanoGate } from '@/components/plano/RecursoPlanoGate'
import { ResumoParcelamentoPreview } from '@/components/shared/ResumoParcelamentoPreview'
import { ContasReceberOSTable } from '@/components/financeiro/ContasReceberOSTable'
import { listarContasReceber } from '@/services/os-pagamento.service'
import {
  formatarFormaPagamentoHistorico,
  OPCOES_PARCELAS,
  parcelasCreditoValidas,
} from '@/lib/pagamento-format'
import { formatarData, formatarMoeda } from '@/lib/utils'
import type { FormaPagamento, LancamentoFinanceiro, TipoLancamento } from '@/types'
import { FORMAS_PAGAMENTO } from '@/types'
import { DollarSign, TrendingDown, TrendingUp } from 'lucide-react'

type FormLancamento = Omit<LancamentoFinanceiro, 'id' | 'oficina_id'>

const formVazio: FormLancamento = {
  tipo: 'receita',
  descricao: '',
  valor: 0,
  forma_pagamento: 'pix',
  data: new Date().toISOString().slice(0, 10),
  pago: true,
  vencimento: '',
  parcelas: 1,
}

export function FinanceiroPage() {
  const { adicionarLancamento, atualizarLancamento, excluirLancamento } = useCraft()
  const { lancamentos, ordens, clientes, motos } = useOficinaData()
  const [dialogAberto, setDialogAberto] = useState(false)
  const [editando, setEditando] = useState<LancamentoFinanceiro | null>(null)
  const [form, setForm] = useState<FormLancamento>(formVazio)
  const [tipoNovo, setTipoNovo] = useState<TipoLancamento>('receita')

  const mesAtual = new Date().toISOString().slice(0, 7)

  const metricas = useMemo(() => {
    const doMes = lancamentos.filter((l) => l.data.startsWith(mesAtual))
    const receitas = doMes.filter((l) => l.tipo === 'receita').reduce((a, l) => a + l.valor, 0)
    const despesas = doMes.filter((l) => l.tipo === 'despesa').reduce((a, l) => a + l.valor, 0)
    return { receitas, despesas, lucro: receitas - despesas }
  }, [lancamentos, mesAtual])

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
    if (!form.descricao.trim() || form.valor <= 0) return

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
    setDialogAberto(false)
  }

  function marcarComoPago(lanc: LancamentoFinanceiro) {
    atualizarLancamento(lanc.id, { pago: true })
  }

  function confirmarExclusao(lanc: LancamentoFinanceiro) {
    if (window.confirm(`Excluir o lançamento "${lanc.descricao}"?`)) {
      excluirLancamento(lanc.id)
    }
  }

  function TabelaLancamentos({ items }: { items: LancamentoFinanceiro[] }) {
    return (
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
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                Nenhum lançamento.
              </TableCell>
            </TableRow>
          ) : (
            [...items]
              .sort((a, b) => b.data.localeCompare(a.data))
              .map((lanc) => (
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
    )
  }

  return (
    <RecursoPlanoGate recurso="financeiro_completo" pagina>
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
        />
        <StatCard
          titulo="Lucro estimado"
          valor={metricas.lucro}
          icone={TrendingUp}
          formatarComoMoeda
          variante={metricas.lucro >= 0 ? 'success' : 'warning'}
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="receitas">
            <TabsList>
              <TabsTrigger value="receitas">Receitas</TabsTrigger>
              <TabsTrigger value="despesas">Despesas</TabsTrigger>
              <TabsTrigger value="pagar">Contas a pagar</TabsTrigger>
              <TabsTrigger value="receber">Contas a receber</TabsTrigger>
            </TabsList>
            <TabsContent value="receitas">
              <TabelaLancamentos items={receitas} />
            </TabsContent>
            <TabsContent value="despesas">
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
              <Button onClick={salvar}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </RecursoPlanoGate>
  )
}
