import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Pencil, Trash2, ArrowDownToLine, SlidersHorizontal, Package, TrendingUp, AlertTriangle, MinusCircle, BarChart3, Loader2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { usePlanoEscrita } from '@/hooks/usePlanoEscrita'
import { PageHeader } from '@/components/layout/PageHeader'
import { AjudaTooltip } from '@/components/shared/AjudaTooltip'
import { BuscaInput } from '@/components/shared/BuscaInput'
import { EstoqueBadge } from '@/components/shared/StatusBadges'
import { StatCard } from '@/components/shared/StatCard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Textarea } from '@/components/ui/textarea'
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
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import { useToast } from '@/context/ToastContext'
import { useSalvarAcao } from '@/hooks/useSalvarAcao'
import { RecursoPlanoGate } from '@/components/plano/RecursoPlanoGate'
import {
  podeGerenciarEstoque,
  podeEditarPrecosEstoque,
} from '@/services/auth/permissions'
import { calcularResumoEstoque } from '@/services/estoque.service'
import { cn, formatarMoeda, formatarData } from '@/lib/utils'
import type { Peca, PecaInput } from '@/types'
import {
  CATEGORIAS_PECA,
  calcularMargemLucroPeca,
  calcularPrecoVendaPorMargem,
  getLabelCategoriaPeca,
} from '@/types/peca'
import {
  MOTIVOS_AJUSTE_ESTOQUE,
  getLabelTipoMovimentacao,
  type MotivoAjusteEstoque,
} from '@/types/movimentacao-estoque'
import {
  UNIDADES_PECA_OS,
  normalizarUnidadePeca,
  type UnidadePecaOS,
} from '@/types/unidade-peca'

type FormPeca = PecaInput

const formVazio: FormPeca = {
  nome: '',
  codigo: '',
  codigo_barras: '',
  marca: '',
  categoria: 'outros',
  fornecedor_id: undefined,
  custo: 0,
  preco_venda: 0,
  quantidade: 0,
  estoque_minimo: 5,
  localizacao: '',
  observacao: '',
  unidade: 'unidade' as UnidadePecaOS,
  ativo: true,
}

const entradaVazia = {
  peca_id: '',
  fornecedor_id: '',
  quantidade: '1',
  custo_unitario: 0,
  data_compra: new Date().toISOString().slice(0, 10),
  numero_nota: '',
  observacao: '',
}

const ajusteVazio = {
  peca_id: '',
  quantidade_nova: '0',
  motivo: MOTIVOS_AJUSTE_ESTOQUE[0] as MotivoAjusteEstoque,
  observacao: '',
}

export function EstoquePage() {
  const { session } = useAuth()
  const { verificarEscrita } = usePlanoEscrita()
  const {
    adicionarPeca,
    atualizarPeca,
    excluirPeca,
    registrarEntradaEstoque,
    registrarAjusteEstoque,
  } = useCraft()
  const { pecas, fornecedores, movimentacoesEstoque, ordens } = useOficinaData()
  const papel = session?.user.papel ?? 'recepcao'
  const podeGerenciar = podeGerenciarEstoque(papel)
  const podeEditarPrecos = podeEditarPrecosEstoque(papel)
  const { confirmar } = useConfirmacao()
  const { toast } = useToast()
  const { executar: executarPeca, salvando: salvandoPeca } = useSalvarAcao()
  const { executar: executarEntrada, salvando: salvandoEntrada } = useSalvarAcao()
  const { executar: executarAjuste, salvando: salvandoAjuste } = useSalvarAcao()

  const [searchParams] = useSearchParams()
  const filtrarBaixo = searchParams.get('baixo') === '1'

  const [busca, setBusca] = useState('')
  const [aba, setAba] = useState('pecas')
  const [dialogPeca, setDialogPeca] = useState(false)
  const [dialogEntrada, setDialogEntrada] = useState(false)
  const [dialogAjuste, setDialogAjuste] = useState(false)
  const [editando, setEditando] = useState<Peca | null>(null)
  const [form, setForm] = useState<FormPeca>(formVazio)
  const [entrada, setEntrada] = useState(entradaVazia)
  const [ajuste, setAjuste] = useState(ajusteVazio)
  const [modoMargem, setModoMargem] = useState(false)
  const [margemPct, setMargemPct] = useState('30')

  useEffect(() => {
    if (filtrarBaixo) {
      setBusca('')
    }
  }, [filtrarBaixo])

  const resumo = useMemo(
    () => calcularResumoEstoque(pecas, movimentacoesEstoque, ordens),
    [pecas, movimentacoesEstoque, ordens]
  )

  const fornecedorNome = (id?: string) =>
    fornecedores.find((f) => f.id === id)?.nome ?? '—'

  const pecasFiltradas = pecas.filter((p) => {
    if (filtrarBaixo && p.quantidade > p.estoque_minimo) return false
    return (
      p.nome.toLowerCase().includes(busca.toLowerCase()) ||
      p.codigo.toLowerCase().includes(busca.toLowerCase()) ||
      p.marca.toLowerCase().includes(busca.toLowerCase()) ||
      (p.codigo_barras?.includes(busca) ?? false)
    )
  })

  const movimentacoesOrdenadas = useMemo(
    () =>
      [...movimentacoesEstoque].sort(
        (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
      ),
    [movimentacoesEstoque]
  )

  const margemForm = calcularMargemLucroPeca(form.custo, form.preco_venda)

  function abrirNova() {
    setEditando(null)
    setForm(formVazio)
    setModoMargem(false)
    setMargemPct('30')
    setDialogPeca(true)
  }

  function abrirEditar(peca: Peca) {
    setEditando(peca)
    setForm({
      nome: peca.nome,
      codigo: peca.codigo,
      codigo_barras: peca.codigo_barras ?? '',
      marca: peca.marca,
      categoria: peca.categoria ?? 'outros',
      fornecedor_id: peca.fornecedor_id,
      custo: peca.custo,
      preco_venda: peca.preco_venda,
      quantidade: peca.quantidade,
      estoque_minimo: peca.estoque_minimo,
      localizacao: peca.localizacao ?? '',
      observacao: peca.observacao ?? '',
      unidade: normalizarUnidadePeca(peca.unidade),
      ativo: peca.ativo ?? true,
    })
    setModoMargem(false)
    setMargemPct(String(Math.round(calcularMargemLucroPeca(peca.custo, peca.preco_venda))))
    setDialogPeca(true)
  }

  function salvarPeca() {
    if (!verificarEscrita()) return
    void executarPeca({
      validar: () => {
        if (!form.nome.trim()) {
          return 'Informe o nome da peça/produto.'
        }
        return null
      },
      acao: () => {
        const codigo =
          form.codigo.trim() ||
          `P-${Date.now().toString(36).slice(-6).toUpperCase()}`
        const dados: PecaInput = {
          ...form,
          nome: form.nome.trim(),
          codigo,
          codigo_barras: form.codigo_barras?.trim() || undefined,
          marca: form.marca.trim() || '—',
          localizacao: form.localizacao?.trim() || undefined,
          observacao: form.observacao?.trim() || undefined,
          fornecedor_id: form.fornecedor_id || undefined,
          unidade: normalizarUnidadePeca(form.unidade),
        }
        if (editando) {
          const patch = { ...dados }
          if (!podeGerenciar) delete (patch as Partial<PecaInput>).quantidade
          if (!podeEditarPrecos) {
            patch.custo = editando.custo
            patch.preco_venda = editando.preco_venda
          }
          atualizarPeca(editando.id, patch)
        } else {
          adicionarPeca(dados)
        }
      },
      sucesso: editando ? 'Dados salvos com sucesso.' : 'Item adicionado com sucesso.',
      onSuccess: () => setDialogPeca(false),
    })
  }

  async function confirmarExclusao(peca: Peca) {
    const ok = await confirmar({
      titulo: 'Excluir peça',
      mensagem: `Tem certeza que deseja excluir a peça "${peca.nome}"?`,
      confirmarTexto: 'Excluir',
      destrutivo: true,
    })
    if (ok) {
      excluirPeca(peca.id)
      toast.sucesso('Peça excluída com sucesso.')
    }
  }

  function aplicarMargem() {
    const pct = parseFloat(margemPct.replace(',', '.')) || 0
    setForm({
      ...form,
      preco_venda: calcularPrecoVendaPorMargem(form.custo, pct),
    })
  }

  function salvarEntrada() {
    if (!verificarEscrita()) return
    void executarEntrada({
      validar: () => {
        if (!entrada.peca_id || !entrada.quantidade) {
          return 'Selecione a peça e a quantidade.'
        }
        return null
      },
      acao: () => {
        const qtd = Math.max(1, parseInt(entrada.quantidade.replace(/\D/g, ''), 10) || 1)
        registrarEntradaEstoque({
          peca_id: entrada.peca_id,
          fornecedor_id: entrada.fornecedor_id || undefined,
          quantidade: qtd,
          custo_unitario: entrada.custo_unitario,
          data_compra: entrada.data_compra,
          numero_nota: entrada.numero_nota.trim() || undefined,
          observacao: entrada.observacao.trim() || undefined,
        })
        setEntrada(entradaVazia)
      },
      sucesso: 'Estoque atualizado com sucesso.',
      onSuccess: () => setDialogEntrada(false),
    })
  }

  function salvarAjuste() {
    if (!verificarEscrita()) return
    void executarAjuste({
      validar: () => {
        if (!ajuste.peca_id || !ajuste.motivo.trim()) {
          return 'Selecione a peça e informe o motivo do ajuste.'
        }
        return null
      },
      acao: () => {
        const qtdNova = Math.max(0, parseInt(ajuste.quantidade_nova.replace(/\D/g, ''), 10) || 0)
        registrarAjusteEstoque({
          peca_id: ajuste.peca_id,
          quantidade_nova: qtdNova,
          motivo: ajuste.motivo,
          observacao: ajuste.observacao.trim() || undefined,
        })
        setAjuste(ajusteVazio)
      },
      sucesso: 'Estoque atualizado com sucesso.',
      onSuccess: () => setDialogAjuste(false),
    })
  }

  function abrirEntrada(peca?: Peca) {
    const pecaSel = peca ?? pecas.find((p) => p.id === entrada.peca_id)
    setEntrada({
      ...entradaVazia,
      peca_id: peca?.id ?? '',
      custo_unitario: pecaSel?.custo ?? 0,
      fornecedor_id: pecaSel?.fornecedor_id ?? '',
    })
    setDialogEntrada(true)
  }

  function abrirAjuste(peca?: Peca) {
    setAjuste({
      ...ajusteVazio,
      peca_id: peca?.id ?? '',
      quantidade_nova: String(peca?.quantidade ?? 0),
    })
    setDialogAjuste(true)
  }

  return (
    <RecursoPlanoGate recurso="estoque" pagina>
      <div>
        <PageHeader
          titulo={
            <span className="inline-flex items-center gap-2">
              Estoque
              <AjudaTooltip texto="As peças usadas na OS podem baixar automaticamente do estoque." />
            </span>
          }
          descricao="Controle profissional de peças, entradas e movimentações"
          acoes={
            podeGerenciar ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => abrirEntrada()}>
                  <ArrowDownToLine className="h-4 w-4" />
                  Adicionar entrada
                </Button>
                <Button variant="secondary" onClick={() => abrirAjuste()}>
                  <SlidersHorizontal className="h-4 w-4" />
                  Ajuste manual
                </Button>
                <Button onClick={abrirNova}>
                  <Plus className="h-4 w-4" />
                  Nova peça
                </Button>
              </div>
            ) : undefined
          }
        />

        {filtrarBaixo && (
          <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100/90">
            Exibindo apenas itens com estoque baixo (quantidade ≤ mínimo).
          </div>
        )}

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            titulo="Valor em estoque"
            valor={resumo.valorTotalEstoque}
            icone={Package}
            formatarComoMoeda
          />
          <StatCard
            titulo="Lucro estimado"
            valor={resumo.lucroEstimadoEstoque}
            icone={TrendingUp}
            formatarComoMoeda
            variante="success"
          />
          <StatCard
            titulo="Estoque baixo"
            valor={resumo.pecasBaixo.length}
            icone={AlertTriangle}
            variante={resumo.pecasBaixo.length > 0 ? 'warning' : 'default'}
          />
          <StatCard
            titulo="Peças zeradas"
            valor={resumo.pecasZeradas.length}
            icone={MinusCircle}
            variante={resumo.pecasZeradas.length > 0 ? 'warning' : 'default'}
          />
          <StatCard
            titulo="Mais usadas (top)"
            valor={resumo.pecasMaisUsadas[0]?.nome ?? '—'}
            icone={BarChart3}
            descricao={
              resumo.pecasMaisUsadas[0]
                ? `${resumo.pecasMaisUsadas[0].quantidade} saídas`
                : 'Sem movimentação'
            }
          />
        </div>

        <Tabs value={aba} onValueChange={setAba}>
          <TabsList className="mb-4">
            <TabsTrigger value="pecas">Peças</TabsTrigger>
            <TabsTrigger value="movimentacoes">Histórico de movimentações</TabsTrigger>
          </TabsList>

          <TabsContent value="pecas">
            <Card>
              <CardContent className="pt-6">
                <BuscaInput
                  valor={busca}
                  onChange={setBusca}
                  placeholder="Buscar por nome, código, marca ou código de barras..."
                  className="mb-4 max-w-md"
                />

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Fornecedor</TableHead>
                        <TableHead className="text-right">Custo</TableHead>
                        <TableHead className="text-right">Venda</TableHead>
                        <TableHead className="text-right">Margem</TableHead>
                        <TableHead>Qtd</TableHead>
                        <TableHead>Mín.</TableHead>
                        <TableHead>Local</TableHead>
                        <TableHead>Status</TableHead>
                        {podeGerenciar && (
                          <TableHead className="text-right">Ações</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pecasFiltradas.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={podeGerenciar ? 12 : 11}
                            className="text-center text-muted-foreground"
                          >
                            Nenhuma peça encontrada.
                          </TableCell>
                        </TableRow>
                      ) : (
                        pecasFiltradas.map((peca) => {
                          const margem = calcularMargemLucroPeca(peca.custo, peca.preco_venda)
                          return (
                            <TableRow
                              key={peca.id}
                              className={cn(
                                !peca.ativo && 'opacity-50',
                                peca.quantidade <= 0 && 'bg-red-950/20',
                                peca.quantidade > 0 &&
                                  peca.quantidade <= peca.estoque_minimo &&
                                  'bg-amber-950/20'
                              )}
                            >
                              <TableCell className="font-medium">{peca.nome}</TableCell>
                              <TableCell>{peca.codigo}</TableCell>
                              <TableCell>
                                {getLabelCategoriaPeca(peca.categoria ?? 'outros')}
                              </TableCell>
                              <TableCell>{fornecedorNome(peca.fornecedor_id)}</TableCell>
                              <TableCell className="text-right">
                                {formatarMoeda(peca.custo)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatarMoeda(peca.preco_venda)}
                              </TableCell>
                              <TableCell className="text-right text-emerald-400">
                                {margem.toFixed(1)}%
                              </TableCell>
                              <TableCell>{peca.quantidade}</TableCell>
                              <TableCell>{peca.estoque_minimo}</TableCell>
                              <TableCell className="text-xs">{peca.localizacao || '—'}</TableCell>
                              <TableCell>
                                <EstoqueBadge
                                  quantidade={peca.quantidade}
                                  minimo={peca.estoque_minimo}
                                />
                              </TableCell>
                              {podeGerenciar && (
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      title="Entrada"
                                      onClick={() => abrirEntrada(peca)}
                                    >
                                      <ArrowDownToLine className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => abrirEditar(peca)}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => confirmarExclusao(peca)}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="movimentacoes">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Histórico de movimentações</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Peça</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>OS</TableHead>
                        <TableHead>Usuário</TableHead>
                        <TableHead>Observação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movimentacoesOrdenadas.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground">
                            Nenhuma movimentação registrada.
                          </TableCell>
                        </TableRow>
                      ) : (
                        movimentacoesOrdenadas.map((mov) => (
                          <TableRow key={mov.id}>
                            <TableCell>{formatarData(mov.data)}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  mov.tipo === 'entrada' || mov.tipo === 'devolucao'
                                    ? 'default'
                                    : mov.tipo === 'saida'
                                      ? 'destructive'
                                      : 'secondary'
                                }
                              >
                                {getLabelTipoMovimentacao(mov.tipo)}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">{mov.peca_nome}</TableCell>
                            <TableCell className="text-right">{mov.quantidade}</TableCell>
                            <TableCell className="text-right">
                              {formatarMoeda(mov.valor_total)}
                            </TableCell>
                            <TableCell>
                              {mov.ordem_servico_numero
                                ? `#${mov.ordem_servico_numero}`
                                : '—'}
                            </TableCell>
                            <TableCell>{mov.usuario_nome ?? '—'}</TableCell>
                            <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                              {[mov.motivo, mov.observacao, mov.fornecedor_nome]
                                .filter(Boolean)
                                .join(' · ') || '—'}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Dialog peça */}
        <Dialog open={dialogPeca} onOpenChange={setDialogPeca}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editando ? 'Editar peça' : 'Nova peça'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label>Nome da peça/produto *</Label>
                <Input
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Código / SKU</Label>
                <Input
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                  placeholder="Opcional — gerado automaticamente se vazio"
                />
              </div>
              <div className="grid gap-2">
                <Label>Código de barras</Label>
                <Input
                  value={form.codigo_barras}
                  onChange={(e) => setForm({ ...form, codigo_barras: e.target.value })}
                  placeholder="Opcional"
                />
              </div>
              <div className="grid gap-2">
                <Label>Marca</Label>
                <Input
                  value={form.marca}
                  onChange={(e) => setForm({ ...form, marca: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Categoria</Label>
                <Select
                  value={form.categoria ?? 'outros'}
                  onValueChange={(v) =>
                    setForm({ ...form, categoria: v as FormPeca['categoria'] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS_PECA.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label>Fornecedor principal</Label>
                <Select
                  value={form.fornecedor_id ?? 'nenhum'}
                  onValueChange={(v) =>
                    setForm({ ...form, fornecedor_id: v === 'nenhum' ? undefined : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar fornecedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Nenhum</SelectItem>
                    {fornecedores
                      .filter((f) => f.ativo)
                      .map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.nome}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Custo unitário</Label>
                <MoneyInput
                  value={form.custo}
                  disabled={!podeEditarPrecos}
                  onChange={(custo) => {
                    const next = { ...form, custo }
                    if (modoMargem) {
                      const pct = parseFloat(margemPct.replace(',', '.')) || 0
                      next.preco_venda = calcularPrecoVendaPorMargem(custo, pct)
                    }
                    setForm(next)
                  }}
                />
              </div>
              <div className="grid gap-2">
                <Label>Preço de venda</Label>
                <MoneyInput
                  value={form.preco_venda}
                  disabled={!podeEditarPrecos || modoMargem}
                  onChange={(preco_venda) => setForm({ ...form, preco_venda })}
                />
              </div>
              <div className="grid gap-2 sm:col-span-2 rounded-md border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm">Margem de lucro automática</Label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={modoMargem}
                      disabled={!podeEditarPrecos}
                      onChange={(e) => {
                        setModoMargem(e.target.checked)
                        if (e.target.checked) aplicarMargem()
                      }}
                    />
                    Calcular preço pela margem
                  </label>
                </div>
                {modoMargem ? (
                  <div className="flex gap-2">
                    <Input
                      inputMode="decimal"
                      value={margemPct}
                      disabled={!podeEditarPrecos}
                      onChange={(e) => setMargemPct(e.target.value)}
                      className="w-24"
                    />
                    <span className="flex items-center text-sm">%</span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!podeEditarPrecos}
                      onClick={aplicarMargem}
                    >
                      Aplicar
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-emerald-400">
                    Margem atual: {margemForm.toFixed(1)}%
                  </p>
                )}
              </div>
              {!editando && podeGerenciar && (
                <div className="grid gap-2">
                  <Label>Quantidade inicial</Label>
                  <Input
                    inputMode="numeric"
                    value={form.quantidade}
                    onChange={(e) => {
                      const v = parseInt(e.target.value.replace(/\D/g, ''), 10) || 0
                      setForm({ ...form, quantidade: v })
                    }}
                  />
                </div>
              )}
              {editando && (
                <div className="grid gap-2">
                  <Label>Quantidade atual</Label>
                  <div className="flex h-10 items-center rounded-md border border-border bg-muted/30 px-3 text-sm">
                    {editando.quantidade}
                    <span className="ml-2 text-xs text-muted-foreground">
                      (use Ajuste manual para alterar)
                    </span>
                  </div>
                </div>
              )}
              <div className="grid gap-2">
                <Label>Estoque mínimo</Label>
                <Input
                  inputMode="numeric"
                  value={form.estoque_minimo}
                  disabled={!podeGerenciar}
                  onChange={(e) => {
                    const v = parseInt(e.target.value.replace(/\D/g, ''), 10) || 0
                    setForm({ ...form, estoque_minimo: v })
                  }}
                />
              </div>
              <div className="grid gap-2">
                <Label>Localização na oficina</Label>
                <Input
                  value={form.localizacao}
                  onChange={(e) => setForm({ ...form, localizacao: e.target.value })}
                  placeholder="Ex: Prateleira A3"
                />
              </div>
              <div className="grid gap-2">
                <Label>Unidade de medida</Label>
                <Select
                  value={normalizarUnidadePeca(form.unidade)}
                  onValueChange={(v) =>
                    setForm({ ...form, unidade: normalizarUnidadePeca(v) as UnidadePecaOS })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIDADES_PECA_OS.map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label>Observação</Label>
                <Textarea
                  rows={2}
                  value={form.observacao ?? ''}
                  onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                  placeholder="Notas sobre a peça/produto (opcional)"
                />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select
                  value={form.ativo ? 'ativo' : 'inativo'}
                  onValueChange={(v) => setForm({ ...form, ativo: v === 'ativo' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {podeGerenciar && (
                <div className="flex justify-end gap-2 sm:col-span-2">
                  <Button variant="outline" onClick={() => setDialogPeca(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={salvarPeca} disabled={salvandoPeca}>
                    {salvandoPeca ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Salvando…
                      </>
                    ) : (
                      'Salvar'
                    )}
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog entrada */}
        <Dialog open={dialogEntrada} onOpenChange={setDialogEntrada}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Adicionar entrada de estoque</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Peça *</Label>
                <Select
                  value={entrada.peca_id || 'none'}
                  onValueChange={(v) => {
                    const peca = pecas.find((p) => p.id === v)
                    setEntrada({
                      ...entrada,
                      peca_id: v === 'none' ? '' : v,
                      custo_unitario: peca?.custo ?? entrada.custo_unitario,
                      fornecedor_id: peca?.fornecedor_id ?? entrada.fornecedor_id,
                    })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar peça" />
                  </SelectTrigger>
                  <SelectContent>
                    {pecas
                      .filter((p) => p.ativo !== false)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome} ({p.codigo})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Fornecedor</Label>
                <Select
                  value={entrada.fornecedor_id || 'none'}
                  onValueChange={(v) =>
                    setEntrada({ ...entrada, fornecedor_id: v === 'none' ? '' : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar fornecedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {fornecedores
                      .filter((f) => f.ativo)
                      .map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.nome}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Quantidade *</Label>
                <Input
                  inputMode="numeric"
                  value={entrada.quantidade}
                  onChange={(e) => setEntrada({ ...entrada, quantidade: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Custo unitário *</Label>
                <MoneyInput
                  value={entrada.custo_unitario}
                  onChange={(custo_unitario) => setEntrada({ ...entrada, custo_unitario })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Data da compra *</Label>
                <Input
                  type="date"
                  value={entrada.data_compra}
                  onChange={(e) => setEntrada({ ...entrada, data_compra: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Número da nota</Label>
                <Input
                  value={entrada.numero_nota}
                  onChange={(e) => setEntrada({ ...entrada, numero_nota: e.target.value })}
                  placeholder="Opcional"
                />
              </div>
              <div className="grid gap-2">
                <Label>Observação</Label>
                <Textarea
                  value={entrada.observacao}
                  onChange={(e) => setEntrada({ ...entrada, observacao: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogEntrada(false)}>
                  Cancelar
                </Button>
                <Button onClick={salvarEntrada} disabled={salvandoEntrada}>
                  {salvandoEntrada ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando…
                    </>
                  ) : (
                    'Registrar entrada'
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog ajuste */}
        <Dialog open={dialogAjuste} onOpenChange={setDialogAjuste}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Ajuste manual de estoque</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Peça *</Label>
                <Select
                  value={ajuste.peca_id || 'none'}
                  onValueChange={(v) => {
                    const peca = pecas.find((p) => p.id === v)
                    setAjuste({
                      ...ajuste,
                      peca_id: v === 'none' ? '' : v,
                      quantidade_nova: String(peca?.quantidade ?? 0),
                    })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar peça" />
                  </SelectTrigger>
                  <SelectContent>
                    {pecas.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome} — qtd atual: {p.quantidade}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Nova quantidade *</Label>
                <Input
                  inputMode="numeric"
                  value={ajuste.quantidade_nova}
                  onChange={(e) => setAjuste({ ...ajuste, quantidade_nova: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Motivo *</Label>
                <Select
                  value={ajuste.motivo}
                  onValueChange={(v) =>
                    setAjuste({ ...ajuste, motivo: v as MotivoAjusteEstoque })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOTIVOS_AJUSTE_ESTOQUE.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Observação</Label>
                <Textarea
                  value={ajuste.observacao}
                  onChange={(e) => setAjuste({ ...ajuste, observacao: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogAjuste(false)}>
                  Cancelar
                </Button>
                <Button onClick={salvarAjuste} disabled={salvandoAjuste}>
                  {salvandoAjuste ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando…
                    </>
                  ) : (
                    'Confirmar ajuste'
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
