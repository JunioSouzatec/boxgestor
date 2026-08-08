/**
 * RC2 Venda Balcão Fase A2 — tela inicial, itens e baixa de estoque.
 * Sem caixa, financeiro, recibo ou nota fiscal.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Package, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { RecursoPlanoGate } from '@/components/plano/RecursoPlanoGate'
import { TelaSemPermissao } from '@/components/layout/TelaSemPermissao'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/context/AuthContext'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { podeAcessarModuloUsuario } from '@/services/auth/permissions'
import { formatarData, formatarMoeda, gerarId } from '@/lib/utils'
import { extrairDataBrasilYYYYMMDD, getDataLocalHoje } from '@/lib/data-local'
import { isUuidFormato } from '@/lib/local-id-uuid'
import type { Peca } from '@/types/peca'
import type {
  VendaBalcao,
  VendaBalcaoFormaPagamento,
} from '@/types/venda-balcao'
import {
  LABEL_FORMA_PAGAMENTO_VENDA_BALCAO,
  labelPagamentoVendaBalcao,
  labelStatusVendaBalcao,
} from '@/types/venda-balcao'
import {
  atualizarVendaBalcao,
  calcularTotaisVendaBalcao,
  criarItemVendaBalcao,
  criarVendaBalcao,
  listarVendasBalcao,
  marcarEstoqueBaixadoNaVenda,
  obterVendaBalcaoPorId,
  proximoNumeroVendaBalcao,
  resolverInventoryItemIdVendaBalcao,
  vendaBalcaoDisponivel,
} from '@/services/venda-balcao/venda-balcao.service'
import {
  type EtapaVendaBalcao,
  VendaBalcaoSaveError,
  logErroVendaBalcao,
  mensagemErroVendaBalcaoParaUsuario,
} from '@/services/venda-balcao/venda-balcao-errors'
import {
  formasRecebimentoVendaBalcao,
  receberPagamentoVendaBalcao,
  sincronizarFinanceiroCaixaVendaBalcao,
  sincronizarVendaBalcaoPagaExistente,
} from '@/services/venda-balcao/venda-balcao-pagamento.service'
import {
  formaBalcaoParaFinanceiro,
  formatarFormaBalcaoComParcelas,
  montarCraftMetaParcelamento,
  obterParcelasCraftMetaVenda,
  opcoesParcelasVendaBalcao,
} from '@/services/venda-balcao/venda-balcao-forma.helpers'
import { imprimirReciboVendaBalcao } from '@/services/venda-balcao/venda-balcao-recibo.service'
import { cancelarVendaBalcao } from '@/services/venda-balcao/venda-balcao-cancelamento.service'
import { avaliarExigenciaCaixaParaPagamento } from '@/services/caixa/pagamento-exige-caixa.service'
import { emitirDiagnosticoPendenciasAtualizado } from '@/services/persistence-status.events'
import { localCraftRepository } from '@/services/repository/local.repository'
import { hybridCraftRepository } from '@/services/repository/hybrid.repository'
import { marcarPularPersistenciaRemotaProxima } from '@/services/supabase-sync/persistencia-opcoes'

function alinharDatabaseAposFinanceiroVb(
  oficinaId: string,
  aplicarDatabase: (db: ReturnType<typeof localCraftRepository.carregar>) => void
): void {
  marcarPularPersistenciaRemotaProxima()
  hybridCraftRepository.cancelarPersistenciaRemotaAgendada(oficinaId)
  aplicarDatabase(localCraftRepository.carregar(oficinaId))
  emitirDiagnosticoPendenciasAtualizado(oficinaId)
}

interface LinhaCarrinho {
  key: string
  peca: Peca
  quantity: number
  unit_price: number
  discount: number
}

const FORMAS: VendaBalcaoFormaPagamento[] = [
  'dinheiro',
  'pix',
  'cartao_debito',
  'cartao_credito',
  'transferencia',
  'outro',
  'pendente',
]

type FiltroListaVb = 'todas' | 'pagas' | 'a_receber' | 'canceladas'

function totalLinha(l: LinhaCarrinho): number {
  return Math.max(0, Math.round((l.quantity * l.unit_price - l.discount) * 100) / 100)
}

function vendaEstaCancelada(v: VendaBalcao): boolean {
  return v.status === 'canceled' || v.payment_status === 'canceled'
}

export function VendasBalcaoPage() {
  const { session } = useAuth()
  const {
    oficinaId,
    baixarEstoqueVendaBalcao,
    estornarEstoqueVendaBalcao,
    adicionarLancamento,
    atualizarLancamento,
    aplicarDatabase,
  } = useCraft()
  const { configuracao, clientes, pecas, lancamentos } = useOficinaData()
  const user = session?.user

  const podeAcessar =
    Boolean(user) && podeAcessarModuloUsuario(user, 'vendas_balcao', configuracao)

  const [vendas, setVendas] = useState<VendaBalcao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erroLista, setErroLista] = useState<string | null>(null)

  const [novaAberta, setNovaAberta] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erroForm, setErroForm] = useState<string | null>(null)

  const [clienteId, setClienteId] = useState('')
  const [clienteAvulso, setClienteAvulso] = useState('')
  const [forma, setForma] = useState<VendaBalcaoFormaPagamento>('pix')
  const [parcelasForma, setParcelasForma] = useState(1)
  const [observacao, setObservacao] = useState('')
  const [buscaPeca, setBuscaPeca] = useState('')
  const [carrinho, setCarrinho] = useState<LinhaCarrinho[]>([])
  /** local_id estável do formulário — evita venda duplicada ao reenviar. */
  const [localSaleIdForm, setLocalSaleIdForm] = useState(() => gerarId())
  const [motivoSemCaixaNova, setMotivoSemCaixaNova] = useState('')

  const [detalhe, setDetalhe] = useState<VendaBalcao | null>(null)
  const [detalheAberto, setDetalheAberto] = useState(false)

  const [receberAberto, setReceberAberto] = useState(false)
  const [receberVenda, setReceberVenda] = useState<VendaBalcao | null>(null)
  const [receberForma, setReceberForma] = useState<VendaBalcaoFormaPagamento>('pix')
  const [receberParcelas, setReceberParcelas] = useState(1)
  const [receberObs, setReceberObs] = useState('')
  const [receberMotivoCaixa, setReceberMotivoCaixa] = useState('')
  const [receberExigeMotivo, setReceberExigeMotivo] = useState(false)
  const [recebendo, setRecebendo] = useState(false)
  const [erroReceber, setErroReceber] = useState<string | null>(null)
  const [avisoAcao, setAvisoAcao] = useState<string | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [filtroLista, setFiltroLista] = useState<FiltroListaVb>('todas')
  const [cancelarAberto, setCancelarAberto] = useState(false)
  const [cancelarMotivo, setCancelarMotivo] = useState('')
  const [cancelando, setCancelando] = useState(false)
  const [erroCancelar, setErroCancelar] = useState<string | null>(null)

  const pecasAtivas = useMemo(
    () => pecas.filter((p) => p.ativo !== false && !p.deleted_at),
    [pecas]
  )

  const carregar = useCallback(async () => {
    if (!podeAcessar || !oficinaId) return
    setCarregando(true)
    setErroLista(null)
    try {
      if (!vendaBalcaoDisponivel()) {
        setVendas([])
        setErroLista('Venda balcão requer modo Supabase ativo.')
        return
      }
      const lista = await listarVendasBalcao(oficinaId, { limite: 50 })
      setVendas(lista)
    } catch {
      setErroLista('Não foi possível carregar as vendas.')
      setVendas([])
    } finally {
      setCarregando(false)
    }
  }, [podeAcessar, oficinaId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const resumo = useMemo(() => {
    const hoje = getDataLocalHoje()
    const doHoje = vendas.filter((v) => {
      if (v.deleted_at != null || v.status === 'canceled') return false
      const instante = v.sold_at || v.created_at
      if (!instante) return false
      // Compara dia em America/Sao_Paulo — não usar toISOString/slice UTC
      return extrairDataBrasilYYYYMMDD(instante) === hoje
    })
    const totalVendido = doHoje
      .filter((v) => v.payment_status === 'paid')
      .reduce((a, v) => a + (Number(v.total) || 0), 0)
    const pendente = vendas
      .filter(
        (v) =>
          v.deleted_at == null &&
          !vendaEstaCancelada(v) &&
          v.payment_status === 'pending'
      )
      .reduce((a, v) => a + (Number(v.pending_amount) || Number(v.total) || 0), 0)
    const itensVendidos = doHoje.reduce((a, v) => {
      const n = Number(v.craft_meta?.item_qty ?? v.craft_meta?.item_count)
      return a + (Number.isFinite(n) ? n : 0)
    }, 0)
    return {
      vendasHoje: doHoje.length,
      totalVendido,
      pendente,
      itensVendidos,
    }
  }, [vendas])

  const vendasFiltradas = useMemo(() => {
    return vendas.filter((v) => {
      if (v.deleted_at != null) return false
      if (filtroLista === 'todas') return true
      if (filtroLista === 'canceladas') return vendaEstaCancelada(v)
      if (vendaEstaCancelada(v)) return false
      if (filtroLista === 'pagas') return v.payment_status === 'paid'
      if (filtroLista === 'a_receber') return v.payment_status === 'pending'
      return true
    })
  }, [vendas, filtroLista])

  const pecasFiltradas = useMemo(() => {
    const q = buscaPeca.trim().toLowerCase()
    if (!q) return pecasAtivas.slice(0, 12)
    return pecasAtivas
      .filter(
        (p) =>
          p.nome.toLowerCase().includes(q) ||
          p.codigo?.toLowerCase().includes(q) ||
          p.codigo_barras?.toLowerCase().includes(q)
      )
      .slice(0, 20)
  }, [pecasAtivas, buscaPeca])

  const totaisCarrinho = useMemo(() => {
    return calcularTotaisVendaBalcao(
      carrinho.map((l) => ({
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount: l.discount,
        total: totalLinha(l),
      })),
      {
        payment_status: forma === 'pendente' ? 'pending' : 'paid',
        paid_amount: forma === 'pendente' ? 0 : undefined,
      }
    )
  }, [carrinho, forma])

  function resetForm() {
    setClienteId('')
    setClienteAvulso('')
    setForma('pix')
    setParcelasForma(1)
    setObservacao('')
    setBuscaPeca('')
    setCarrinho([])
    setErroForm(null)
    setMotivoSemCaixaNova('')
    setLocalSaleIdForm(gerarId())
  }

  async function abrirReceber(venda: VendaBalcao) {
    setErroReceber(null)
    setReceberObs('')
    setReceberMotivoCaixa('')
    setReceberForma('pix')
    setReceberParcelas(1)
    setReceberVenda(venda)
    setReceberAberto(true)
    const formaFin = formaBalcaoParaFinanceiro('pix')
    if (formaFin && oficinaId) {
      const exig = await avaliarExigenciaCaixaParaPagamento({
        officeId: oficinaId,
        configuracao,
        user,
        formaPagamento: formaFin,
        pago: true,
      })
      setReceberExigeMotivo(exig.status === 'pedir_motivo')
    } else {
      setReceberExigeMotivo(false)
    }
  }

  async function confirmarRecebimento() {
    if (!oficinaId || !user || !receberVenda) return
    setErroReceber(null)
    setRecebendo(true)
    try {
      const r = await receberPagamentoVendaBalcao({
        officeId: oficinaId,
        venda: receberVenda,
        forma: receberForma,
        parcelas: receberForma === 'cartao_credito' ? receberParcelas : undefined,
        observacao: receberObs,
        lancamentos,
        adicionarLancamento,
        atualizarLancamento,
        user,
        configuracao,
        motivoSemCaixa: receberMotivoCaixa,
      })
      // Alinha React state com localStorage (persistência dedicada pós-recebimento).
      alinharDatabaseAposFinanceiroVb(oficinaId, aplicarDatabase)
      setReceberAberto(false)
      setReceberVenda(null)
      setDetalhe(r.venda)
      setAvisoAcao(r.avisoCaixa ?? 'Pagamento recebido com sucesso.')
      await carregar()
    } catch (e) {
      setErroReceber(mensagemErroVendaBalcaoParaUsuario('desconhecida', e))
    } finally {
      setRecebendo(false)
    }
  }

  async function sincronizarFinCaixaDetalhe() {
    if (!oficinaId || !detalhe || !user) return
    setSincronizando(true)
    setAvisoAcao(null)
    try {
      const r = await sincronizarVendaBalcaoPagaExistente({
        officeId: oficinaId,
        venda: detalhe,
        lancamentos,
        adicionarLancamento,
        atualizarLancamento,
        user,
      })
      alinharDatabaseAposFinanceiroVb(oficinaId, aplicarDatabase)
      setDetalhe(r.venda)
      setAvisoAcao(
        r.avisoCaixa ??
          (r.financeiro === 'ja_existia' && r.caixa === 'ja_existia'
            ? 'Financeiro e caixa já estavam sincronizados.'
            : 'Financeiro/caixa sincronizados.')
      )
      await carregar()
    } catch (e) {
      setAvisoAcao(mensagemErroVendaBalcaoParaUsuario('desconhecida', e))
    } finally {
      setSincronizando(false)
    }
  }

  function imprimirReciboDetalhe() {
    if (!detalhe) return
    try {
      // Somente leitura — não altera venda/estoque/caixa/financeiro.
      // Abrir no clique síncrono evita bloqueio de popup do navegador.
      imprimirReciboVendaBalcao({ venda: detalhe, configuracao })
    } catch (e) {
      const msg =
        e instanceof Error && e.message.trim()
          ? e.message
          : 'Não foi possível abrir o recibo. Verifique se o navegador bloqueou pop-ups.'
      setAvisoAcao(msg)
    }
  }

  function abrirCancelar(venda: VendaBalcao) {
    if (vendaEstaCancelada(venda)) return
    setErroCancelar(null)
    setCancelarMotivo('')
    setDetalhe(venda)
    setDetalheAberto(true)
    setCancelarAberto(true)
  }

  async function confirmarCancelar() {
    if (!oficinaId || !user || !detalhe) return
    const motivo = cancelarMotivo.trim()
    if (!motivo) {
      setErroCancelar('Informe o motivo do cancelamento.')
      return
    }
    setCancelando(true)
    setErroCancelar(null)
    try {
      const r = await cancelarVendaBalcao({
        officeId: oficinaId,
        vendaId: detalhe.id,
        motivo,
        user,
        lancamentos,
        atualizarLancamento,
        estornarEstoque: estornarEstoqueVendaBalcao,
      })
      alinharDatabaseAposFinanceiroVb(oficinaId, aplicarDatabase)
      setDetalhe(r.venda)
      setCancelarAberto(false)
      setCancelarMotivo('')
      const partes = [
        r.status === 'ja_cancelada' ? 'Venda já estava cancelada.' : 'Venda cancelada.',
        r.caixa.aviso,
        r.avisoFiscalRascunho,
      ].filter(Boolean)
      setAvisoAcao(partes.join(' '))
      await carregar()
    } catch (e) {
      setErroCancelar(mensagemErroVendaBalcaoParaUsuario('desconhecida', e))
    } finally {
      setCancelando(false)
    }
  }

  function adicionarPeca(peca: Peca) {
    setErroForm(null)
    if ((Number(peca.quantidade) || 0) <= 0) {
      setErroForm('Quantidade indisponível em estoque.')
      return
    }
    setCarrinho((prev) => {
      const existente = prev.find((l) => l.peca.id === peca.id)
      if (existente) {
        const novaQtd = existente.quantity + 1
        if (novaQtd > peca.quantidade) {
          setErroForm('Quantidade indisponível em estoque.')
          return prev
        }
        return prev.map((l) =>
          l.peca.id === peca.id ? { ...l, quantity: novaQtd } : l
        )
      }
      return [
        ...prev,
        {
          key: gerarId(),
          peca,
          quantity: 1,
          unit_price: Number(peca.preco_venda) || 0,
          discount: 0,
        },
      ]
    })
  }

  function atualizarLinha(key: string, patch: Partial<LinhaCarrinho>) {
    setErroForm(null)
    setCarrinho((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l
        const next = { ...l, ...patch }
        if (!(next.quantity > 0)) {
          setErroForm('Quantidade deve ser maior que zero.')
          next.quantity = 1
        }
        if (next.quantity > l.peca.quantidade) {
          setErroForm('Quantidade indisponível em estoque.')
          next.quantity = l.peca.quantidade
        }
        if (next.discount < 0) next.discount = 0
        if (next.unit_price < 0) next.unit_price = 0
        return next
      })
    )
  }

  async function salvarVenda() {
    if (!oficinaId || !user) return
    setErroForm(null)
    let etapa: EtapaVendaBalcao = 'validacao'

    if (carrinho.length === 0) {
      setErroForm('Adicione pelo menos uma peça à venda.')
      return
    }
    for (const l of carrinho) {
      if (!(l.quantity > 0)) {
        setErroForm('Quantidade deve ser maior que zero.')
        return
      }
      if (l.unit_price < 0 || l.discount < 0) {
        setErroForm('Preço e desconto não podem ser negativos.')
        return
      }
      if (l.quantity > l.peca.quantidade) {
        setErroForm('Quantidade indisponível em estoque.')
        return
      }
    }

    setSalvando(true)
    let vendaCriada: VendaBalcao | null = null
    try {
      const cliente = clientes.find((c) => c.id === clienteId)
      const pendente = forma === 'pendente'
      const totais = totaisCarrinho
      const saleNumber = await proximoNumeroVendaBalcao(oficinaId)
      const localSaleId = localSaleIdForm
      const sellerUserId = isUuidFormato(user.id) ? user.id : undefined

      if (!pendente) {
        const formaFin = formaBalcaoParaFinanceiro(forma)
        if (formaFin) {
          const exig = await avaliarExigenciaCaixaParaPagamento({
            officeId: oficinaId,
            configuracao,
            user,
            formaPagamento: formaFin,
            pago: true,
          })
          if (exig.status === 'bloquear') {
            throw new VendaBalcaoSaveError('validacao', new Error(exig.mensagem), exig.mensagem)
          }
          if (exig.status === 'pedir_motivo' && !motivoSemCaixaNova.trim()) {
            throw new VendaBalcaoSaveError(
              'validacao',
              new Error('motivo_caixa'),
              'Informe o motivo para vender sem caixa aberto.'
            )
          }
        }
      }

      etapa = 'criar_counter_sales'
      const venda = await criarVendaBalcao(oficinaId, {
        local_id: localSaleId,
        sale_number: saleNumber,
        customer_id: undefined,
        local_customer_id: cliente?.id,
        customer_name: cliente?.nome?.trim() || clienteAvulso.trim() || undefined,
        customer_document: cliente?.cpf || undefined,
        status: pendente ? 'pending' : 'paid',
        payment_status: pendente ? 'pending' : 'paid',
        payment_method: forma,
        subtotal: totais.subtotal,
        discount_total: totais.discount_total,
        total: totais.total,
        paid_amount: pendente ? 0 : totais.total,
        pending_amount: pendente ? totais.total : 0,
        notes: observacao.trim() || undefined,
        seller_user_id: sellerUserId,
        seller_name: user.nome,
        sold_at: new Date().toISOString(),
        craft_meta: montarCraftMetaParcelamento({
          forma,
          parcelas: forma === 'cartao_credito' ? parcelasForma : undefined,
          metaAtual: {
            origem: 'vendas_balcao_ui',
            item_count: carrinho.length,
            item_qty: carrinho.reduce((a, l) => a + l.quantity, 0),
          },
        }),
      })
      vendaCriada = venda

      etapa = 'criar_counter_sale_items'
      const itensExistentes = await obterVendaBalcaoPorId(oficinaId, venda.id, true)
      const jaTemItens = (itensExistentes?.itens?.length ?? 0) > 0
      const itensCriados: Array<{
        linha: LinhaCarrinho
        item: Awaited<ReturnType<typeof criarItemVendaBalcao>>
      }> = []

      if (jaTemItens && itensExistentes?.itens) {
        for (const item of itensExistentes.itens) {
          const linha = carrinho.find(
            (l) =>
              l.peca.id === item.inventory_local_id ||
              l.peca.nome === item.item_name
          )
          if (linha) itensCriados.push({ linha, item })
        }
      } else {
        for (const l of carrinho) {
          const inventoryItemId = await resolverInventoryItemIdVendaBalcao(
            oficinaId,
            l.peca.id
          )
          const item = await criarItemVendaBalcao(oficinaId, venda.id, {
            local_id: `${localSaleId}-item-${l.peca.id}`,
            inventory_item_id: inventoryItemId,
            inventory_local_id: l.peca.id,
            item_name: l.peca.nome,
            sku: l.peca.codigo || undefined,
            quantity: l.quantity,
            unit: l.peca.unidade || undefined,
            unit_price: l.unit_price,
            discount: l.discount,
            total: totalLinha(l),
            cost_price_snapshot: l.peca.custo,
            sale_price_snapshot: l.unit_price,
          })
          itensCriados.push({ linha: l, item })
        }
      }

      if (itensCriados.length === 0) {
        throw new VendaBalcaoSaveError(
          'criar_counter_sale_items',
          new Error('Nenhum item criado'),
          'Não foi possível salvar a venda: falha ao registrar item da venda.'
        )
      }

      etapa = 'baixar_estoque'
      const baixa = await baixarEstoqueVendaBalcao({
        saleId: venda.id,
        saleNumber: venda.sale_number ?? saleNumber,
        itens: itensCriados.map(({ linha, item }) => ({
          peca_id: linha.peca.id,
          peca_nome: linha.peca.nome,
          quantity: linha.quantity,
          unit_price: linha.unit_price,
          sale_item_id: item.id,
        })),
      })

      if (!baixa.ok) {
        etapa = 'baixar_estoque'
        try {
          await atualizarVendaBalcao(oficinaId, venda.id, {
            craft_meta: {
              ...venda.craft_meta,
              stock_error: baixa.erro ?? 'Falha na baixa',
              save_stage: 'baixar_estoque',
            },
          })
        } catch (metaErr) {
          logErroVendaBalcao({
            etapa: 'atualizar_craft_meta',
            erro: metaErr,
            payload: { sale_id: venda.id },
          })
        }
        logErroVendaBalcao({
          etapa: 'baixar_estoque',
          erro: new Error(baixa.erro || 'Falha ao baixar estoque'),
          payload: { sale_id: venda.id, itens: itensCriados.length },
        })
        throw new VendaBalcaoSaveError(
          'baixar_estoque',
          new Error(baixa.erro || 'Falha ao baixar estoque'),
          'Não foi possível salvar a venda: falha ao baixar estoque.'
        )
      }

      etapa = 'atualizar_craft_meta'
      await marcarEstoqueBaixadoNaVenda(
        oficinaId,
        venda.id,
        baixa.itens.map((i) => ({
          peca_id: i.peca_id,
          stock_before: i.stock_before,
          stock_after: i.stock_after,
          sale_item_id: itensCriados.find((c) => c.linha.peca.id === i.peca_id)?.item
            .id,
        }))
      )

      // Financeiro: pendente → 1 receita Pendente; paga → 1 receita Pago + caixa.
      // Não baixa estoque de novo.
      const vendaAtual = await obterVendaBalcaoPorId(oficinaId, venda.id, true)
      if (vendaAtual) {
        const sync = await sincronizarFinanceiroCaixaVendaBalcao({
          officeId: oficinaId,
          venda: vendaAtual,
          forma,
          pago: !pendente,
          parcelas: forma === 'cartao_credito' ? parcelasForma : undefined,
          lancamentos,
          adicionarLancamento,
          atualizarLancamento,
          user,
          observacao: observacao.trim() || undefined,
          motivoSemCaixa: motivoSemCaixaNova,
        })
        alinharDatabaseAposFinanceiroVb(oficinaId, aplicarDatabase)
        if (sync.avisoCaixa) setAvisoAcao(sync.avisoCaixa)
      }

      setNovaAberta(false)
      resetForm()
      await carregar()
    } catch (e) {
      const etapaErro =
        e instanceof VendaBalcaoSaveError ? e.etapa : etapa
      logErroVendaBalcao({
        etapa: etapaErro,
        erro: e,
        payload: {
          sale_id: vendaCriada?.id ?? null,
          local_id: localSaleIdForm,
          itens: carrinho.length,
        },
      })

      if (vendaCriada && etapaErro === 'criar_counter_sale_items') {
        try {
          await atualizarVendaBalcao(oficinaId, vendaCriada.id, {
            craft_meta: {
              ...vendaCriada.craft_meta,
              save_error: 'falha_itens',
              save_stage: etapaErro,
            },
          })
        } catch {
          /* diagnóstico já logado */
        }
      }

      setErroForm(mensagemErroVendaBalcaoParaUsuario(etapaErro, e))
    } finally {
      setSalvando(false)
    }
  }

  async function abrirDetalhe(venda: VendaBalcao) {
    try {
      const full = await obterVendaBalcaoPorId(oficinaId, venda.id, true)
      setDetalhe(full ?? venda)
      setDetalheAberto(true)
    } catch {
      setDetalhe(venda)
      setDetalheAberto(true)
    }
  }

  if (!user || !podeAcessar) {
    return <TelaSemPermissao tituloPagina="Vendas Balcão" />
  }

  return (
    <RecursoPlanoGate recurso="financeiro_basico" pagina>
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <ShoppingBag className="h-6 w-6 text-primary" />
              Vendas Balcão
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Venda peças e produtos sem abrir uma OS.
            </p>
          </div>
          <Button
            type="button"
            className="gap-1.5"
            onClick={() => {
              resetForm()
              setNovaAberta(true)
            }}
            disabled={pecasAtivas.length === 0}
          >
            <Plus className="h-4 w-4" />
            Nova venda
          </Button>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Vendas de hoje
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold tabular-nums">
              {resumo.vendasHoje}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total vendido (hoje)
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold tabular-nums">
              {formatarMoeda(resumo.totalVendido)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                A receber
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold tabular-nums text-amber-300">
              {formatarMoeda(resumo.pendente)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Itens vendidos (hoje)
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold tabular-nums">
              {resumo.itensVendidos}
            </CardContent>
          </Card>
        </section>

        {pecasAtivas.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/10 px-4 py-10 text-center text-sm text-muted-foreground">
            Cadastre peças no estoque antes de vender pelo balcão.
          </div>
        ) : null}

        {avisoAcao ? (
          <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
            {avisoAcao}
          </p>
        ) : null}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Últimas vendas
            </h2>
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              value={filtroLista}
              onChange={(e) => setFiltroLista(e.target.value as FiltroListaVb)}
              aria-label="Filtrar vendas"
            >
              <option value="todas">Todas</option>
              <option value="pagas">Pagas</option>
              <option value="a_receber">A receber</option>
              <option value="canceladas">Canceladas</option>
            </select>
          </div>
          {carregando ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : erroLista ? (
            <p className="text-sm text-amber-300">{erroLista}</p>
          ) : vendasFiltradas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/10 px-4 py-10 text-center text-sm text-muted-foreground">
              {vendas.length === 0
                ? 'Você ainda não registrou nenhuma venda balcão.'
                : 'Nenhuma venda neste filtro.'}
            </div>
          ) : (
            <ul className="space-y-2">
              {vendasFiltradas.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-card/70 px-3 py-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/20"
                    onClick={() => void abrirDetalhe(v)}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {v.sale_number != null ? `Venda #${v.sale_number}` : 'Venda'}
                        {v.customer_name ? ` · ${v.customer_name}` : ' · Cliente não informado'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatarData(v.sold_at || v.created_at)}
                        {Number(v.craft_meta?.item_count) > 0
                          ? ` · ${Number(v.craft_meta?.item_count)} item(ns)`
                          : ''}
                        {v.payment_method
                          ? ` · ${formatarFormaBalcaoComParcelas(
                              v.payment_method,
                              obterParcelasCraftMetaVenda(v)
                            )}`
                          : ''}
                        {v.seller_name ? ` · ${v.seller_name}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-semibold tabular-nums">
                        {formatarMoeda(v.total)}
                      </span>
                      {vendaEstaCancelada(v) ? (
                        <Badge variant="destructive">Cancelada</Badge>
                      ) : (
                        <Badge variant="outline">
                          {labelPagamentoVendaBalcao(v.payment_status)}
                        </Badge>
                      )}
                      {v.payment_status === 'pending' && !vendaEstaCancelada(v) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            void abrirReceber(v)
                          }}
                        >
                          Receber pagamento
                        </Button>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Dialog
          open={novaAberta}
          onOpenChange={(o) => {
            if (!salvando) {
              setNovaAberta(o)
              if (!o) resetForm()
            }
          }}
        >
          <DialogContent className="flex max-h-[min(96dvh,900px)] w-[min(100vw-1rem,42rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 lg:max-w-2xl">
            <DialogHeader className="shrink-0 border-b border-border px-4 py-4 pr-12 text-left sm:px-6">
              <DialogTitle>Nova venda balcão</DialogTitle>
              <DialogDescription>
                Selecione peças do estoque. A baixa ocorre ao salvar.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
              {erroForm ? (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                  {erroForm}
                </p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="vb-cliente">Cliente (opcional)</Label>
                  <select
                    id="vb-cliente"
                    className="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                    value={clienteId}
                    onChange={(e) => setClienteId(e.target.value)}
                  >
                    <option value="">Sem cliente cadastrado</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vb-avulso">Nome avulso (opcional)</Label>
                  <Input
                    id="vb-avulso"
                    value={clienteAvulso}
                    onChange={(e) => setClienteAvulso(e.target.value)}
                    placeholder="Ex.: Cliente balcão"
                    disabled={Boolean(clienteId)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="vb-forma">Forma de pagamento</Label>
                <select
                  id="vb-forma"
                  className="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                  value={forma}
                  onChange={(e) => {
                    const f = e.target.value as VendaBalcaoFormaPagamento
                    setForma(f)
                    if (f !== 'cartao_credito') setParcelasForma(1)
                  }}
                >
                  {FORMAS.map((f) => (
                    <option key={f} value={f}>
                      {LABEL_FORMA_PAGAMENTO_VENDA_BALCAO[f]}
                      {f === 'pendente' ? ' / A receber' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {forma === 'cartao_credito' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="vb-parcelas">Parcelamento</Label>
                  <select
                    id="vb-parcelas"
                    className="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                    value={parcelasForma}
                    onChange={(e) => setParcelasForma(Number(e.target.value))}
                  >
                    {opcoesParcelasVendaBalcao().map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="vb-obs">Observação</Label>
                <Input
                  id="vb-obs"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Opcional"
                />
              </div>

              {forma !== 'pendente' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="vb-motivo-caixa">
                    Motivo sem caixa (só se a configuração exigir e o caixa estiver fechado)
                  </Label>
                  <Input
                    id="vb-motivo-caixa"
                    value={motivoSemCaixaNova}
                    onChange={(e) => setMotivoSemCaixaNova(e.target.value)}
                    placeholder="Opcional na maioria dos casos"
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="vb-busca">Buscar peça no estoque</Label>
                <Input
                  id="vb-busca"
                  value={buscaPeca}
                  onChange={(e) => setBuscaPeca(e.target.value)}
                  placeholder="Nome, código ou código de barras"
                />
                <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-1">
                  {pecasFiltradas.length === 0 ? (
                    <li className="px-2 py-3 text-center text-xs text-muted-foreground">
                      Nenhuma peça encontrada.
                    </li>
                  ) : (
                    pecasFiltradas.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/40"
                          onClick={() => adicionarPeca(p)}
                        >
                          <span className="min-w-0 truncate">
                            <span className="font-medium">{p.nome}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              Est. {p.quantidade}
                              {p.unidade ? ` ${p.unidade}` : ''}
                            </span>
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {formatarMoeda(p.preco_venda)}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold">Itens da venda</p>
                {carrinho.length === 0 ? (
                  <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-6 text-sm text-muted-foreground">
                    <Package className="h-4 w-4" />
                    Nenhum item adicionado.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {carrinho.map((l) => (
                      <li
                        key={l.key}
                        className="rounded-xl border border-border/60 bg-muted/10 p-3"
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{l.peca.nome}</p>
                            <p className="text-xs text-muted-foreground">
                              Disponível: {l.peca.quantidade}
                              {l.peca.unidade ? ` ${l.peca.unidade}` : ''}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={() =>
                              setCarrinho((prev) => prev.filter((x) => x.key !== l.key))
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[11px]">Qtd</Label>
                            <Input
                              type="number"
                              min={0.001}
                              step={1}
                              value={l.quantity}
                              onChange={(e) =>
                                atualizarLinha(l.key, {
                                  quantity: Number(e.target.value) || 0,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px]">Preço</Label>
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              value={l.unit_price}
                              onChange={(e) =>
                                atualizarLinha(l.key, {
                                  unit_price: Number(e.target.value) || 0,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px]">Desconto</Label>
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              value={l.discount}
                              onChange={(e) =>
                                atualizarLinha(l.key, {
                                  discount: Number(e.target.value) || 0,
                                })
                              }
                            />
                          </div>
                        </div>
                        <p className="mt-2 text-right text-sm font-semibold tabular-nums">
                          {formatarMoeda(totalLinha(l))}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="tabular-nums">{formatarMoeda(totaisCarrinho.subtotal)}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-muted-foreground">Descontos</span>
                  <span className="tabular-nums">
                    {formatarMoeda(totaisCarrinho.discount_total)}
                  </span>
                </div>
                <div className="mt-2 flex justify-between text-base font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatarMoeda(totaisCarrinho.total)}</span>
                </div>
                {forma === 'pendente' ? (
                  <p className="mt-2 text-xs text-amber-200">
                    Esta venda ficará como Pendente / A receber.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="shrink-0 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={salvando}
                  onClick={() => {
                    setNovaAberta(false)
                    resetForm()
                  }}
                >
                  Cancelar
                </Button>
                <Button type="button" disabled={salvando} onClick={() => void salvarVenda()}>
                  {salvando ? 'Salvando…' : 'Salvar venda'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={detalheAberto} onOpenChange={setDetalheAberto}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {detalhe?.sale_number != null
                  ? `Venda #${detalhe.sale_number}`
                  : 'Detalhe da venda'}
              </DialogTitle>
              <DialogDescription>
                {detalhe
                  ? `${labelStatusVendaBalcao(detalhe.status)} · ${labelPagamentoVendaBalcao(detalhe.payment_status)}`
                  : 'Somente leitura'}
              </DialogDescription>
            </DialogHeader>
            {detalhe ? (
              <div className="space-y-3 text-sm">
                {vendaEstaCancelada(detalhe) ? (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
                    <Badge variant="destructive" className="mb-1">
                      Cancelada
                    </Badge>
                    {detalhe.cancel_reason ? (
                      <p className="text-muted-foreground">
                        Motivo: {detalhe.cancel_reason}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Esta venda foi cancelada. Revise ou exclua o rascunho fiscal
                      relacionado, se houver.
                    </p>
                  </div>
                ) : null}
                <p>
                  <span className="text-muted-foreground">Cliente: </span>
                  {detalhe.customer_name || 'Não informado'}
                </p>
                <p>
                  <span className="text-muted-foreground">Forma: </span>
                  {detalhe.payment_method
                    ? formatarFormaBalcaoComParcelas(
                        detalhe.payment_method,
                        obterParcelasCraftMetaVenda(detalhe)
                      )
                    : '—'}
                </p>
                <p>
                  <span className="text-muted-foreground">Total: </span>
                  <span className="font-semibold tabular-nums">
                    {formatarMoeda(detalhe.total)}
                  </span>
                </p>
                {detalhe.payment_status === 'pending' && !vendaEstaCancelada(detalhe) ? (
                  <p className="text-amber-200">
                    A receber: {formatarMoeda(detalhe.pending_amount || detalhe.total)}
                  </p>
                ) : null}
                <ul className="space-y-2">
                  {(detalhe.itens ?? []).map((i) => (
                    <li
                      key={i.id}
                      className="flex justify-between gap-2 rounded-lg border border-border/50 px-3 py-2"
                    >
                      <span>
                        {i.item_name}{' '}
                        <span className="text-muted-foreground">
                          · {i.quantity}
                          {i.unit ? ` ${i.unit}` : 'x'}
                        </span>
                      </span>
                      <span className="tabular-nums">{formatarMoeda(i.total)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap">
                  {detalhe.payment_status === 'pending' && !vendaEstaCancelada(detalhe) ? (
                    <Button
                      type="button"
                      onClick={() => void abrirReceber(detalhe)}
                    >
                      Receber pagamento
                    </Button>
                  ) : null}
                  {detalhe.payment_status === 'paid' && !vendaEstaCancelada(detalhe) ? (
                    <>
                      <Button type="button" variant="outline" onClick={imprimirReciboDetalhe}>
                        Imprimir recibo
                      </Button>
                      {!detalhe.craft_meta?.financeiro_lancado ||
                      !detalhe.craft_meta?.caixa_registrado ? (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={sincronizando}
                          onClick={() => void sincronizarFinCaixaDetalhe()}
                        >
                          {sincronizando
                            ? 'Sincronizando…'
                            : 'Sincronizar financeiro/caixa'}
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                  {vendaEstaCancelada(detalhe) ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={imprimirReciboDetalhe}
                    >
                      Recibo (venda cancelada)
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => abrirCancelar(detalhe)}
                    >
                      Cancelar venda
                    </Button>
                  )}
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog
          open={cancelarAberto}
          onOpenChange={(o) => {
            if (!cancelando) {
              setCancelarAberto(o)
              if (!o) {
                setCancelarMotivo('')
                setErroCancelar(null)
              }
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Cancelar venda</DialogTitle>
              <DialogDescription>
                Cancelar esta venda irá devolver os itens ao estoque e ajustar
                financeiro/caixa quando aplicável. Esta ação não emite nota fiscal e
                não cancela nota fiscal.
              </DialogDescription>
            </DialogHeader>
            {detalhe ? (
              <div className="space-y-3">
                {erroCancelar ? (
                  <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                    {erroCancelar}
                  </p>
                ) : null}
                <p className="text-sm">
                  Venda{' '}
                  {detalhe.sale_number != null
                    ? `#${detalhe.sale_number}`
                    : detalhe.id.slice(0, 8)}{' '}
                  · {formatarMoeda(detalhe.total)} ·{' '}
                  {labelPagamentoVendaBalcao(detalhe.payment_status)}
                </p>
                <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  <li>Estoque será devolvido</li>
                  <li>Financeiro será estornado/arquivado</li>
                  <li>Caixa será ajustado, se aplicável</li>
                </ul>
                <div className="space-y-1.5">
                  <Label htmlFor="vb-cancel-motivo">Motivo (obrigatório)</Label>
                  <Input
                    id="vb-cancel-motivo"
                    value={cancelarMotivo}
                    onChange={(e) => setCancelarMotivo(e.target.value)}
                    placeholder="Ex.: Cliente desistiu / item errado"
                    disabled={cancelando}
                  />
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={cancelando}
                    onClick={() => setCancelarAberto(false)}
                  >
                    Voltar
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={cancelando || !cancelarMotivo.trim()}
                    onClick={() => void confirmarCancelar()}
                  >
                    {cancelando ? 'Cancelando…' : 'Confirmar cancelamento'}
                  </Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog
          open={receberAberto}
          onOpenChange={(o) => {
            if (!recebendo) {
              setReceberAberto(o)
              if (!o) setReceberVenda(null)
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Receber pagamento</DialogTitle>
              <DialogDescription>
                Registra o recebimento total da venda balcão. Não altera estoque nem itens.
              </DialogDescription>
            </DialogHeader>
            {receberVenda ? (
              <div className="space-y-3">
                {erroReceber ? (
                  <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                    {erroReceber}
                  </p>
                ) : null}
                <p className="text-sm">
                  Venda{' '}
                  {receberVenda.sale_number != null
                    ? `#${receberVenda.sale_number}`
                    : ''}{' '}
                  · Pendente / A receber
                </p>
                <p className="text-lg font-semibold tabular-nums">
                  Valor a receber:{' '}
                  {formatarMoeda(
                    Number(receberVenda.pending_amount) || Number(receberVenda.total) || 0
                  )}
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="vb-rec-forma">Forma de pagamento</Label>
                  <select
                    id="vb-rec-forma"
                    className="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                    value={receberForma}
                    onChange={(e) => {
                      const f = e.target.value as VendaBalcaoFormaPagamento
                      setReceberForma(f)
                      if (f !== 'cartao_credito') setReceberParcelas(1)
                    }}
                  >
                    {formasRecebimentoVendaBalcao().map((f) => (
                      <option key={f} value={f}>
                        {LABEL_FORMA_PAGAMENTO_VENDA_BALCAO[f]}
                      </option>
                    ))}
                  </select>
                </div>
                {receberForma === 'cartao_credito' ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="vb-rec-parcelas">Parcelamento</Label>
                    <select
                      id="vb-rec-parcelas"
                      className="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                      value={receberParcelas}
                      onChange={(e) => setReceberParcelas(Number(e.target.value))}
                    >
                      {opcoesParcelasVendaBalcao().map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="vb-rec-obs">Observação</Label>
                  <Input
                    id="vb-rec-obs"
                    value={receberObs}
                    onChange={(e) => setReceberObs(e.target.value)}
                    placeholder="Opcional"
                  />
                </div>
                {receberExigeMotivo ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="vb-rec-motivo">Motivo sem caixa aberto</Label>
                    <Input
                      id="vb-rec-motivo"
                      value={receberMotivoCaixa}
                      onChange={(e) => setReceberMotivoCaixa(e.target.value)}
                      placeholder="Obrigatório neste caso"
                    />
                  </div>
                ) : null}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={recebendo}
                    onClick={() => setReceberAberto(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    disabled={recebendo}
                    onClick={() => void confirmarRecebimento()}
                  >
                    {recebendo ? 'Confirmando…' : 'Confirmar recebimento'}
                  </Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </RecursoPlanoGate>
  )
}
