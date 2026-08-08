/**
 * F4A — monta rascunho visual de preparação de nota (em memória, sem persistir).
 * Não emite, não gera XML, não calcula imposto.
 */
import type { Cliente } from '@/types/cliente'
import { obterDadosFiscaisOficina } from '@/types/fiscal'
import { obterDadosFiscaisProduto } from '@/types/fiscal-produto'
import {
  descricaoFiscalServicoEfetiva,
  descricaoFiscalServicoParaExibir,
  labelExigibilidadeIss,
  labelIssRetido,
  obterDadosFiscaisServico,
  type DadosFiscaisServico,
} from '@/types/fiscal-servico'
import {
  labelStatusPreparacao,
  labelTipoDocumentoSugerido,
  type ItemProdutoPreparacao,
  type ItemServicoPreparacao,
  type PendenciaFiscalItem,
  type PreparacaoNotaFiscal,
  type StatusPreparacaoFiscal,
  type TipoDocumentoFiscalSugerido,
} from '@/types/fiscal-preparacao'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { Moto } from '@/types/moto'
import type { OrdemServico } from '@/types/ordem-servico'
import type { Peca } from '@/types/peca'
import type { ServicoCatalogo } from '@/types/servico-catalogo'
import type { VendaBalcao } from '@/types/venda-balcao'
import { getLabelStatusOS, getLabelStatusFinanceiroOS } from '@/types/labels'
import {
  resetSeqPendenciaFiscal,
  validarClienteParaPreparacao,
  validarOficinaParaPreparacao,
  validarProdutoFiscalParaPreparacao,
  validarServicoParaPreparacao,
} from '@/services/fiscal/fiscal-validacao.service'
import { labelFormaPagamentoPreparacaoFiscal } from '@/services/fiscal/fiscal-format.helpers'

function resolverStatus(pendencias: PendenciaFiscalItem[]): StatusPreparacaoFiscal {
  const bloqueantes = pendencias.filter((p) => p.severidade === 'bloqueante')
  if (bloqueantes.length > 0) return 'com_pendencias'
  if (pendencias.length > 0) return 'com_pendencias'
  return 'pronta_para_preparar'
}

function labelPagamentoVb(venda: VendaBalcao): { label: string; pendente: boolean } {
  if (venda.status === 'canceled' || venda.payment_status === 'canceled') {
    return { label: 'Cancelado', pendente: false }
  }
  if (venda.payment_status === 'paid' || venda.status === 'paid') {
    return { label: 'Pago', pendente: false }
  }
  if (venda.payment_status === 'pending' || venda.status === 'pending') {
    return { label: 'Pendente / A receber', pendente: true }
  }
  return { label: venda.payment_status || venda.status, pendente: true }
}

function acharPeca(pecas: Peca[], item: {
  inventory_local_id?: string
  inventory_item_id?: string
}): Peca | undefined {
  if (item.inventory_local_id) {
    const porLocal = pecas.find((p) => p.id === item.inventory_local_id)
    if (porLocal) return porLocal
  }
  if (item.inventory_item_id) {
    return pecas.find(
      (p) => p.id === item.inventory_item_id || (p as { supabase_id?: string }).supabase_id === item.inventory_item_id
    )
  }
  return undefined
}

function acharCliente(
  clientes: Cliente[],
  opts: { local_customer_id?: string; customer_id?: string; customer_name?: string }
): Cliente | undefined {
  if (opts.local_customer_id) {
    const c = clientes.find((x) => x.id === opts.local_customer_id)
    if (c) return c
  }
  if (opts.customer_id) {
    const c = clientes.find((x) => x.id === opts.customer_id)
    if (c) return c
  }
  return undefined
}

export function prepararNotaVendaBalcao(input: {
  venda: VendaBalcao
  clientes: Cliente[]
  pecas: Peca[]
  configuracao?: ConfiguracaoOficina | null
}): PreparacaoNotaFiscal {
  resetSeqPendenciaFiscal()
  const { venda, clientes, pecas, configuracao } = input
  const oficina = obterDadosFiscaisOficina(configuracao)
  const pendencias: PendenciaFiscalItem[] = [...validarOficinaParaPreparacao(oficina)]
  const avisos: string[] = [
    'Esta preparação não emite nota fiscal e não gera XML fiscal.',
    'Revise as configurações fiscais iniciais com o contador. No dia a dia, use esta prévia para conferência interna.',
  ]

  const cliente = acharCliente(clientes, {
    local_customer_id: venda.local_customer_id,
    customer_id: venda.customer_id,
    customer_name: venda.customer_name,
  })
  const consumidorNaoIdentificado = !cliente && !venda.customer_name?.trim() && !venda.customer_document?.trim()
  const cliVal = validarClienteParaPreparacao(cliente, consumidorNaoIdentificado)
  pendencias.push(...cliVal.pendencias)

  const pag = labelPagamentoVb(venda)
  if (pag.pendente) {
    pendencias.push({
      id: 'pag-vb',
      escopo: 'pagamento',
      severidade: 'aviso',
      mensagem:
        'Status financeiro pendente / a receber. A emissão futura normalmente exige venda paga — confirme a regra com o contador se houver dúvida.',
    })
  }

  const produtos: ItemProdutoPreparacao[] = []
  let produtosOk = true
  for (const item of venda.itens ?? []) {
    const peca = acharPeca(pecas, item)
    const fiscal = peca
      ? obterDadosFiscaisProduto(peca)
      : obterDadosFiscaisProduto({ nome: item.item_name, unidade: item.unit })
    const nome = fiscal.descricao_fiscal?.trim() || item.item_name || peca?.nome || 'Item'
    const chave = item.id || item.local_id || nome
    const val = validarProdutoFiscalParaPreparacao(fiscal, nome, chave)
    pendencias.push(...val.pendencias)
    if (!val.ok) produtosOk = false
    produtos.push({
      chave,
      nome,
      quantidade: item.quantity,
      valor_unitario: item.unit_price,
      valor_total: item.total,
      peca_id: peca?.id,
      descricao_fiscal: fiscal.descricao_fiscal,
      ncm: fiscal.ncm,
      unidade_fiscal: fiscal.unidade_fiscal,
      origem_mercadoria: fiscal.origem_mercadoria,
      ean: fiscal.ean,
      cfop_padrao_venda: fiscal.cfop_padrao_venda,
      cst_csosn: fiscal.cst_csosn,
      fiscal_basico_ok: val.ok,
    })
  }

  if (produtos.length === 0) {
    pendencias.push({
      id: 'vb-sem-itens',
      escopo: 'venda',
      severidade: 'bloqueante',
      mensagem: 'Venda Balcão sem itens para preparar.',
    })
    produtosOk = false
  }

  const tipo: TipoDocumentoFiscalSugerido = 'nfc_e_nf_e'
  const status = resolverStatus(pendencias)
  const num = venda.sale_number != null ? `#${venda.sale_number}` : venda.id.slice(0, 8)

  return {
    origem: 'venda_balcao',
    origem_id: venda.id,
    origem_label: `Venda Balcão ${num}`,
    cliente_nome: cliente?.nome || venda.customer_name || (consumidorNaoIdentificado ? 'Consumidor não identificado' : undefined),
    cliente_id: cliente?.id,
    consumidor_nao_identificado: consumidorNaoIdentificado,
    data: venda.sold_at || venda.created_at,
    valor_total: venda.total,
    status_financeiro_label: pag.label,
    pagamento_pendente: pag.pendente,
    forma_pagamento: labelFormaPagamentoPreparacaoFiscal({
      payment_method: venda.payment_method,
      craft_meta: venda.craft_meta,
    }),
    desconto: venda.discount_total,
    tipo_sugerido: tipo,
    tipo_sugerido_label: labelTipoDocumentoSugerido(tipo),
    status,
    status_label: labelStatusPreparacao(status),
    produtos,
    servicos: [],
    pendencias,
    avisos,
    oficina_ok: cadastroFiscalBasicoOk(oficina),
    cliente_ok: cliVal.ok,
    produtos_ok: produtosOk,
    servicos_ok: true,
  }
}

function cadastroFiscalBasicoOk(oficina: ReturnType<typeof obterDadosFiscaisOficina>): boolean {
  return validarOficinaParaPreparacao(oficina).length === 0
}

function montarItemServicoPreparacao(input: {
  chave: string
  nome: string
  valor: number
  descricao?: string
  fiscal: DadosFiscaisServico
  servico_catalogo_id?: string
  manual?: boolean
  fiscal_basico_ok: boolean
}): ItemServicoPreparacao {
  const { chave, nome, valor, descricao, fiscal, servico_catalogo_id, manual, fiscal_basico_ok } =
    input
  const codigo = fiscal.codigo_municipal_servico?.trim() || ''
  const descFiscal = descricaoFiscalServicoParaExibir(
    nome,
    descricaoFiscalServicoEfetiva(fiscal, nome, descricao)
  )
  return {
    chave,
    nome,
    valor,
    quantidade: 1,
    descricao,
    descricao_fiscal: descFiscal,
    servico_catalogo_id,
    manual,
    codigo_municipal_servico: codigo || undefined,
    item_lista_servico_lc116: fiscal.item_lista_servico_lc116?.trim() || undefined,
    codigo_tributacao_municipal: fiscal.codigo_tributacao_municipal?.trim() || undefined,
    cnae: fiscal.cnae?.trim() || undefined,
    municipio_prestacao_padrao: fiscal.municipio_prestacao_padrao?.trim() || undefined,
    aliquota_iss_informada: fiscal.aliquota_iss_informada ?? null,
    iss_retido: labelIssRetido(fiscal.iss_retido),
    exigibilidade_iss: labelExigibilidadeIss(fiscal.exigibilidade_iss),
    observacoes_fiscais: fiscal.observacoes_fiscais?.trim() || undefined,
    fiscal_basico_ok,
    codigo_servico_municipal_pendente: !codigo,
  }
}

export function prepararNotaOrdemServico(input: {
  os: OrdemServico
  clientes: Cliente[]
  pecas: Peca[]
  motos: Moto[]
  configuracao?: ConfiguracaoOficina | null
  servicosCatalogo?: ServicoCatalogo[]
}): PreparacaoNotaFiscal {
  resetSeqPendenciaFiscal()
  const { os, clientes, pecas, motos, configuracao, servicosCatalogo = [] } = input
  const oficina = obterDadosFiscaisOficina(configuracao)
  const pendencias: PendenciaFiscalItem[] = [...validarOficinaParaPreparacao(oficina)]
  const avisos: string[] = [
    'Esta preparação não emite nota fiscal e não gera XML fiscal.',
    'Dados de ISS são apenas informativos nesta fase.',
    'A emissão de NFS-e ainda não está ativa.',
  ]

  const cliente = clientes.find((c) => c.id === os.cliente_id)
  const cliVal = validarClienteParaPreparacao(cliente, !cliente)
  pendencias.push(...cliVal.pendencias)

  const moto = motos.find((m) => m.id === os.moto_id)
  const produtos: ItemProdutoPreparacao[] = []
  let produtosOk = true
  for (const linha of os.pecas_utilizadas ?? []) {
    const peca = linha.peca_id ? pecas.find((p) => p.id === linha.peca_id) : undefined
    const fiscal = peca
      ? obterDadosFiscaisProduto(peca)
      : obterDadosFiscaisProduto({ nome: linha.nome, unidade: linha.unidade })
    const nome = fiscal.descricao_fiscal?.trim() || linha.nome || peca?.nome || 'Peça'
    const chave = linha.linha_id || linha.peca_id || nome
    const val = validarProdutoFiscalParaPreparacao(fiscal, nome, chave)
    pendencias.push(...val.pendencias)
    if (!val.ok) produtosOk = false
    const qtd = linha.quantidade || 0
    const unit = linha.valor_unitario || 0
    produtos.push({
      chave,
      nome,
      quantidade: qtd,
      valor_unitario: unit,
      valor_total: qtd * unit,
      peca_id: peca?.id ?? linha.peca_id,
      descricao_fiscal: fiscal.descricao_fiscal,
      ncm: fiscal.ncm,
      unidade_fiscal: fiscal.unidade_fiscal,
      origem_mercadoria: fiscal.origem_mercadoria,
      ean: fiscal.ean,
      cfop_padrao_venda: fiscal.cfop_padrao_venda,
      cst_csosn: fiscal.cst_csosn,
      fiscal_basico_ok: val.ok,
    })
  }

  const servicos: ItemServicoPreparacao[] = []
  let servicosOk = true
  const itensServico = os.servicos_itens ?? []
  if (itensServico.length > 0) {
    for (const s of itensServico) {
      const chave = s.id || s.nome
      const catalogo = s.servico_catalogo_id
        ? servicosCatalogo.find((c) => c.id === s.servico_catalogo_id)
        : undefined
      const fiscal = catalogo
        ? obterDadosFiscaisServico(catalogo)
        : obterDadosFiscaisServico(null)
      const manual = Boolean(s.manual) || !s.servico_catalogo_id || !catalogo
      const val = validarServicoParaPreparacao({
        nome: s.nome,
        valor: s.valor_mao_obra,
        chave,
        fiscal,
        descricao: s.descricao,
        manual,
        semCatalogo: !catalogo,
      })
      pendencias.push(...val.pendencias)
      if (!val.ok) servicosOk = false
      servicos.push(
        montarItemServicoPreparacao({
          chave,
          nome: s.nome,
          valor: s.valor_mao_obra,
          descricao: s.descricao,
          fiscal,
          servico_catalogo_id: s.servico_catalogo_id,
          manual,
          fiscal_basico_ok: val.ok,
        })
      )
    }
  } else if ((os.valor_mao_obra ?? 0) > 0 || os.servicos_executados?.trim()) {
    const nome = os.servicos_executados?.trim() || 'Mão de obra'
    const chave = 'mao-obra'
    const fiscal = obterDadosFiscaisServico(null)
    const val = validarServicoParaPreparacao({
      nome,
      valor: os.valor_mao_obra ?? 0,
      chave,
      fiscal,
      manual: true,
      semCatalogo: true,
    })
    pendencias.push(...val.pendencias)
    if (!val.ok) servicosOk = false
    servicos.push(
      montarItemServicoPreparacao({
        chave,
        nome,
        valor: os.valor_mao_obra ?? 0,
        fiscal,
        manual: true,
        fiscal_basico_ok: val.ok,
      })
    )
  }

  const temProdutos = produtos.length > 0
  const temServicos = servicos.length > 0
  let tipo: TipoDocumentoFiscalSugerido = 'nfs_e'
  if (temProdutos && temServicos) tipo = 'misto_servico_produto'
  else if (temProdutos && !temServicos) tipo = 'nfc_e_nf_e'
  else tipo = 'nfs_e'

  if (tipo === 'misto_servico_produto') {
    avisos.push(
      'Serviço + Produto: pode exigir documentos separados (NFS-e para serviço e NF-e/NFC-e para produtos).'
    )
  }

  if (!temProdutos && !temServicos) {
    pendencias.push({
      id: 'os-vazia',
      escopo: 'geral',
      severidade: 'bloqueante',
      mensagem: 'OS sem serviços nem peças para preparar.',
    })
  }

  const statusFin = os.status_financeiro
    ? getLabelStatusFinanceiroOS(os.status_financeiro)
    : getLabelStatusOS(os.status)

  const status = resolverStatus(pendencias)
  const veiculoLabel = moto
    ? `${moto.marca} ${moto.modelo}${moto.placa ? ` · ${moto.placa}` : ''}`
    : undefined

  return {
    origem: 'ordem_servico',
    origem_id: os.id,
    origem_label: `OS #${os.numero}${veiculoLabel ? ` · ${veiculoLabel}` : ''}`,
    cliente_nome: cliente?.nome,
    cliente_id: cliente?.id,
    consumidor_nao_identificado: !cliente,
    data: os.atualizado_em || os.criado_em || os.updated_at || os.created_at,
    valor_total: os.valor_total,
    status_financeiro_label: statusFin,
    pagamento_pendente:
      os.status_financeiro !== 'pago' && os.status_financeiro !== 'cancelado',
    desconto: os.desconto,
    tipo_sugerido: tipo,
    tipo_sugerido_label: labelTipoDocumentoSugerido(tipo),
    status,
    status_label: labelStatusPreparacao(status),
    produtos,
    servicos,
    pendencias,
    avisos,
    oficina_ok: cadastroFiscalBasicoOk(oficina),
    cliente_ok: cliVal.ok,
    produtos_ok: !temProdutos || produtosOk,
    servicos_ok: !temServicos || servicosOk,
  }
}

/** Status rápido para listagem (sem carregar todos os detalhes de UI). */
export function statusPreparacaoResumo(prep: PreparacaoNotaFiscal): {
  status: StatusPreparacaoFiscal
  label: string
  qtdPendencias: number
} {
  return {
    status: prep.status,
    label: prep.status_label,
    qtdPendencias: prep.pendencias.filter((p) => p.severidade === 'bloqueante').length,
  }
}
