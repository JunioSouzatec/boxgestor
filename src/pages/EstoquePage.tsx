import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Pencil, Trash2, ArrowDownToLine, SlidersHorizontal, Package, TrendingUp, AlertTriangle, MinusCircle, BarChart3, Loader2, Upload, FileCode2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { usePlanoEscrita } from '@/hooks/usePlanoEscrita'
import { PageHeader } from '@/components/layout/PageHeader'
import { AjudaTooltip } from '@/components/shared/AjudaTooltip'
import { BuscaInput } from '@/components/shared/BuscaInput'
import { EstoqueBadge } from '@/components/shared/StatusBadges'
import { StatCard } from '@/components/shared/StatCard'
import { FiltroAtivoBanner } from '@/components/shared/FiltroAtivoBanner'
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
import {
  estoqueModoSupabase,
  refreshEstoqueDoSupabase,
} from '@/services/estoque/estoque-sync.service'
import { logDiagnosticoEstoque } from '@/services/estoque/estoque-diagnostico'
import { cn, formatarMoeda, formatarData, getDataLocalHoje } from '@/lib/utils'
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
import { ImportacaoCsvDialog } from '@/components/importacao/ImportacaoCsvDialog'
import { ImportacaoXmlNfeDialog } from '@/components/estoque/ImportacaoXmlNfeDialog'
import type { ResumoImportacaoXmlNfe } from '@/services/importacao-xml-nfe.service'
import {
  MODELO_CSV_ESTOQUE,
  executarImportacaoEstoque,
  parsearCsvEstoque,
  type LinhaImportacaoEstoque,
  type PoliticaDuplicadoImportacao,
} from '@/services/importacao-estoque.service'

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
  data_compra: getDataLocalHoje(),
  numero_nota: '',
  observacao: '',
}

const ajusteVazio = {
  peca_id: '',
  quantidade_nova: '0',
  motivo: MOTIVOS_AJUSTE_ESTOQUE[0] as MotivoAjusteEstoque,
  observacao: '',
}

type FiltroRapidoEstoque = 'valor' | 'margem' | 'baixo' | 'zerado' | 'top'

function filtroRapidoFromSearchParams(params: URLSearchParams): FiltroRapidoEstoque {
  if (params.get('aba') === 'movimentacoes') return 'top'
  if (params.get('baixo') === '1' || params.get('filtro') === 'baixo') return 'baixo'
  if (params.get('zerado') === '1') return 'zerado'
  if (params.get('ordenar') === 'margem') return 'margem'
  return 'valor'
}

const MENSAGEM_FILTRO_ESTOQUE: Record<Exclude<FiltroRapidoEstoque, 'valor'>, string> = {
  baixo: 'Exibindo apenas itens com estoque baixo (quantidade ≤ mínimo).',
  zerado: 'Exibindo apenas peças com quantidade zerada.',
  margem: 'Exibindo todas as peças, ordenadas por maior acréscimo sobre o custo.',
  top: 'Histórico de movimentações — consulte as saídas mais frequentes.',
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
    adicionarFornecedor,
    oficinaId,
  } = useCraft()
  const { pecas, fornecedores, movimentacoesEstoque, ordens, configuracao } = useOficinaData()
  const papel = session?.user.papel ?? 'recepcao'
  const podeGerenciar = podeGerenciarEstoque(session?.user ?? papel, configuracao)
  const podeEditarPrecos = podeEditarPrecosEstoque(papel)
  const { confirmar } = useConfirmacao()
  const { toast } = useToast()
  const { executar: executarPeca, salvando: salvandoPeca } = useSalvarAcao()
  const { executar: executarEntrada, salvando: salvandoEntrada } = useSalvarAcao()
  const { executar: executarAjuste, salvando: salvandoAjuste } = useSalvarAcao()

  const [searchParams, setSearchParams] = useSearchParams()
  const filtroRapido = filtroRapidoFromSearchParams(searchParams)
  const filtrarBaixo = filtroRapido === 'baixo'
  const filtrarZerado = filtroRapido === 'zerado'
  const ordenarMargem = filtroRapido === 'margem'

  const [busca, setBusca] = useState('')
  const [aba, setAba] = useState(() =>
    searchParams.get('aba') === 'movimentacoes' ? 'movimentacoes' : 'pecas'
  )
  const [dialogPeca, setDialogPeca] = useState(false)
  const [dialogEntrada, setDialogEntrada] = useState(false)
  const [dialogAjuste, setDialogAjuste] = useState(false)
  const [dialogImportacao, setDialogImportacao] = useState(false)
  const [dialogImportacaoXml, setDialogImportacaoXml] = useState(false)
  const [editando, setEditando] = useState<Peca | null>(null)
  const [form, setForm] = useState<FormPeca>(formVazio)
  const [entrada, setEntrada] = useState(entradaVazia)
  const [ajuste, setAjuste] = useState(ajusteVazio)
  const [modoMargem, setModoMargem] = useState(false)
  const [margemPct, setMargemPct] = useState('30')

  // RC1: celular/PC — sempre reconciliar catálogo remoto ao abrir Estoque
  useEffect(() => {
    if (!estoqueModoSupabase()) return
    logDiagnosticoEstoque('estoque_page_mount', oficinaId)
    void refreshEstoqueDoSupabase(oficinaId).then((ok) => {
      logDiagnosticoEstoque('estoque_page_apos_refresh', oficinaId, { ok })
    })
  }, [oficinaId])
  useEffect(() => {
    if (!estoqueModoSupabase() || !oficinaId) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    void refreshEstoqueDoSupabase(oficinaId)
  }, [oficinaId])

  useEffect(() => {
    if (searchParams.get('aba') === 'movimentacoes') {
      setAba('movimentacoes')
    } else if (filtroRapido !== 'top') {
      setAba('pecas')
    }
  }, [searchParams.get('aba'), filtroRapido])

  useEffect(() => {
    if (filtrarBaixo || filtrarZerado || ordenarMargem) {
      setBusca('')
    }
  }, [filtrarBaixo, filtrarZerado, ordenarMargem])

  const resumo = useMemo(
    () => calcularResumoEstoque(pecas, movimentacoesEstoque, ordens),
    [pecas, movimentacoesEstoque, ordens]
  )

  const fornecedorNome = (id?: string) =>
    fornecedores.find((f) => f.id === id)?.nome ?? '—'

  const pecasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    let lista = pecas.filter((p) => {
      if (filtrarBaixo && p.quantidade > p.estoque_minimo) return false
      if (filtrarZerado && p.quantidade !== 0) return false
      if (!q) return true
      return (
        p.nome.toLowerCase().includes(q) ||
        p.codigo.toLowerCase().includes(q) ||
        p.marca.toLowerCase().includes(q) ||
        (p.codigo_barras?.includes(q) ?? false)
      )
    })

    if (ordenarMargem) {
      lista = [...lista].sort(
        (a, b) =>
          calcularMargemLucroPeca(b.custo, b.preco_venda) -
          calcularMargemLucroPeca(a.custo, a.preco_venda)
      )
    }

    return lista
  }, [pecas, busca, filtrarBaixo, filtrarZerado, ordenarMargem])

  function limparFiltrosEstoque() {
    setBusca('')
    setAba('pecas')
    setSearchParams({}, { replace: true })
  }

  function aplicarFiltroEstoque(tipo: FiltroRapidoEstoque) {
    setBusca('')
    switch (tipo) {
      case 'valor':
        limparFiltrosEstoque()
        return
      case 'margem':
        setAba('pecas')
        setSearchParams({ ordenar: 'margem' }, { replace: true })
        return
      case 'baixo':
        setAba('pecas')
        setSearchParams({ baixo: '1' }, { replace: true })
        return
      case 'zerado':
        setAba('pecas')
        setSearchParams({ zerado: '1' }, { replace: true })
        return
      case 'top':
        setAba('movimentacoes')
        setSearchParams({ aba: 'movimentacoes' }, { replace: true })
        return
    }
  }

  const movimentacoesOrdenadas = useMemo(
    () =>
      [...movimentacoesEstoque].sort(
        (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
      ),
    [movimentacoesEstoque]
  )

  const margemForm = calcularMargemLucroPeca(form.custo, form.preco_venda)

  function handleImportacaoXmlSucesso(resumo: ResumoImportacaoXmlNfe) {
    const tinhaFiltro = filtroRapido !== 'valor'
    setBusca('')
    setAba('pecas')
    if (tinhaFiltro) {
      setSearchParams({}, { replace: true })
      toast.sucesso(
        'Itens importados com sucesso. Filtros removidos para exibir os novos itens.'
      )
      return
    }
    const partes = [
      resumo.criados > 0 ? `${resumo.criados} criado(s)` : '',
      resumo.atualizados > 0 ? `${resumo.atualizados} atualizado(s)` : '',
    ].filter(Boolean)
    toast.sucesso(
      partes.length > 0
        ? `Itens importados com sucesso: ${partes.join(', ')}.`
        : 'Itens importados com sucesso.'
    )
  }

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
      acao: async () => {
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
          const r = await atualizarPeca(editando.id, patch)
          if (r && r.pendente && !r.remoto) {
            return 'Salvo localmente. Aguardando sincronização com o servidor.'
          }
          if (r && !r.ok && !r.pendente) {
            throw new Error(r.erro ?? 'Não foi possível salvar no servidor.')
          }
          return 'Dados salvos com sucesso.'
        }
        adicionarPeca(dados)
        return 'Item adicionado com sucesso.'
      },
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
      acao: async () => {
        const qtd = Math.max(1, parseInt(entrada.quantidade.replace(/\D/g, ''), 10) || 1)
        const r = await registrarEntradaEstoque({
          peca_id: entrada.peca_id,
          fornecedor_id: entrada.fornecedor_id || undefined,
          quantidade: qtd,
          custo_unitario: entrada.custo_unitario,
          data_compra: entrada.data_compra,
          numero_nota: entrada.numero_nota.trim() || undefined,
          observacao: entrada.observacao.trim() || undefined,
        })
        setEntrada(entradaVazia)
        if (r && r.pendente && !r.remoto) {
          return 'Entrada salva localmente. Aguardando sincronização com o servidor.'
        }
        if (r && !r.ok && !r.pendente) {
          throw new Error(r.erro ?? 'Não foi possível salvar a quantidade no servidor.')
        }
        return 'Estoque atualizado com sucesso.'
      },
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
      acao: async () => {
        const qtdNova = Math.max(0, parseInt(ajuste.quantidade_nova.replace(/\D/g, ''), 10) || 0)
        const r = await registrarAjusteEstoque({
          peca_id: ajuste.peca_id,
          quantidade_nova: qtdNova,
          motivo: ajuste.motivo,
          observacao: ajuste.observacao.trim() || undefined,
        })
        setAjuste(ajusteVazio)
        if (r && r.pendente && !r.remoto) {
          return 'Ajuste salvo localmente. Aguardando sincronização com o servidor.'
        }
        if (r && !r.ok && !r.pendente) {
          throw new Error(r.erro ?? 'Não foi possível salvar a quantidade no servidor.')
        }
        return 'Estoque atualizado com sucesso.'
      },
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
                <Button variant="outline" onClick={() => setDialogImportacaoXml(true)}>
                  <FileCode2 className="h-4 w-4" />
                  Importar XML de Nota Fiscal
                </Button>
                <Button variant="outline" onClick={() => setDialogImportacao(true)}>
                  <Upload className="h-4 w-4" />
                  Importar estoque
                </Button>
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

        {filtroRapido !== 'valor' && (
          <FiltroAtivoBanner
            mensagem={MENSAGEM_FILTRO_ESTOQUE[filtroRapido]}
            onLimpar={limparFiltrosEstoque}
          />
        )}

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            titulo="Valor em estoque"
            valor={resumo.valorTotalEstoque}
            icone={Package}
            formatarComoMoeda
            onClick={() => aplicarFiltroEstoque('valor')}
            ativo={filtroRapido === 'valor'}
            ariaLabel="Ver todas as peças"
          />
          <StatCard
            titulo="Lucro estimado"
            valor={resumo.lucroEstimadoEstoque}
            icone={TrendingUp}
            formatarComoMoeda
            variante="success"
            onClick={() => aplicarFiltroEstoque('margem')}
            ativo={filtroRapido === 'margem'}
            ariaLabel="Ver peças ordenadas por acréscimo"
          />
          <StatCard
            titulo="Estoque baixo"
            valor={resumo.pecasBaixo.length}
            icone={AlertTriangle}
            variante={resumo.pecasBaixo.length > 0 ? 'warning' : 'default'}
            onClick={() => aplicarFiltroEstoque('baixo')}
            ativo={filtroRapido === 'baixo'}
            ariaLabel="Filtrar estoque baixo"
          />
          <StatCard
            titulo="Peças zeradas"
            valor={resumo.pecasZeradas.length}
            icone={MinusCircle}
            variante={resumo.pecasZeradas.length > 0 ? 'warning' : 'default'}
            onClick={() => aplicarFiltroEstoque('zerado')}
            ativo={filtroRapido === 'zerado'}
            ariaLabel="Filtrar peças zeradas"
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
            onClick={() => aplicarFiltroEstoque('top')}
            ativo={filtroRapido === 'top'}
            ariaLabel="Ver histórico de movimentações"
          />
        </div>

        <Tabs
          value={aba}
          onValueChange={(value) => {
            setAba(value)
            if (value === 'movimentacoes') {
              setSearchParams({ aba: 'movimentacoes' }, { replace: true })
            } else if (filtroRapido === 'top') {
              limparFiltrosEstoque()
            } else if (searchParams.get('aba') === 'movimentacoes') {
              const next = new URLSearchParams(searchParams)
              next.delete('aba')
              setSearchParams(next, { replace: true })
            }
          }}
        >
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
                        <TableHead className="text-right">Acréscimo</TableHead>
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
                {resumo.pecasMaisUsadas.length > 0 && (
                  <div className="mb-4 rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Peças mais usadas
                    </p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {resumo.pecasMaisUsadas.map((item) => (
                        <li key={item.peca_id} className="flex justify-between gap-2">
                          <span className="truncate">{item.nome}</span>
                          <span className="shrink-0 text-muted-foreground">{item.quantidade} saídas</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
                  <Label className="text-sm">Acréscimo sobre custo (%)</Label>
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
                    Calcular preço pelo acréscimo
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
                    Acréscimo atual: {margemForm.toFixed(1)}%
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
                      .filter((p) => p.ativo !== false && !p.deleted_at)
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

        <ImportacaoXmlNfeDialog
          aberto={dialogImportacaoXml}
          onFechar={() => setDialogImportacaoXml(false)}
          officeId={oficinaId}
          pecas={pecas}
          fornecedores={fornecedores}
          adicionarPeca={adicionarPeca}
          atualizarPeca={atualizarPeca}
          adicionarFornecedor={adicionarFornecedor}
          onSucesso={handleImportacaoXmlSucesso}
          onErro={(msg) => toast.erro(msg)}
        />

        <ImportacaoCsvDialog<LinhaImportacaoEstoque>
          aberto={dialogImportacao}
          onFechar={() => setDialogImportacao(false)}
          titulo="Importar estoque"
          descricao="Envie um arquivo CSV com os itens do estoque. Baixe o modelo, preencha e importe para a oficina atual."
          nomeModelo="modelo-estoque-boxgestor.csv"
          conteudoModelo={MODELO_CSV_ESTOQUE}
          colunasPreview={[
            { key: 'nome', label: 'Item', render: (i) => i.dados.nome },
            { key: 'codigo', label: 'Código', render: (i) => i.dados.codigo },
            { key: 'qtd', label: 'Qtd', render: (i) => String(i.dados.quantidade) },
            { key: 'preco', label: 'Preço', render: (i) => formatarMoeda(i.dados.preco_venda) },
          ]}
          parsear={(texto) => parsearCsvEstoque(texto, pecas, fornecedores)}
          onConfirmar={(linhas, politica: PoliticaDuplicadoImportacao) => {
            const resumo = executarImportacaoEstoque(
              linhas,
              politica,
              adicionarPeca,
              atualizarPeca
            )
            toast.sucesso('Importação concluída com sucesso.')
            return resumo
          }}
        />
      </div>
    </RecursoPlanoGate>
  )
}
