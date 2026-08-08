/**
 * F5B — Checklist de prontidão fiscal da oficina (somente conferência).
 * Não emite nota. Não gera XML/DANFE. Não calcula imposto. Sem migration.
 */
import { entidadeFoiExcluida } from '@/lib/entidade-ativa'
import {
  cadastroFiscalBasicoPreenchido,
  obterDadosFiscaisOficina,
  somenteDigitos,
  ufFiscalValida,
  type DadosFiscaisOficina,
} from '@/types/fiscal'
import {
  cadastroFiscalClienteBasicoPreenchido,
  obterDadosFiscaisCliente,
} from '@/types/fiscal-cliente'
import {
  cadastroFiscalProdutoBasicoPreenchido,
  normalizarNcm,
  obterDadosFiscaisProduto,
} from '@/types/fiscal-produto'
import {
  cadastroFiscalServicoBasicoPreenchido,
  obterDadosFiscaisServico,
} from '@/types/fiscal-servico'
import type { Cliente } from '@/types/cliente'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { Peca } from '@/types/peca'
import type { ServicoCatalogo } from '@/types/servico-catalogo'

export type StatusBlocoProntidao = 'completo' | 'atencao' | 'incompleto' | 'nao_ativo'

export type StatusGeralProntidao =
  | 'nao_configurado'
  | 'incompleto'
  | 'quase_pronto'
  | 'pronto_homologacao'

export interface ItemPendenciaProntidao {
  id: string
  nome: string
  motivo: string
}

export interface ContagemCampoProntidao {
  rotulo: string
  preenchidos: number
  total: number
}

export interface BlocoOficinaProntidao {
  status: StatusBlocoProntidao
  itens: Array<{ rotulo: string; ok: boolean }>
  qtdOk: number
  qtdTotal: number
}

export interface BlocoEntidadeProntidao {
  status: StatusBlocoProntidao
  total: number
  prontos: number
  pendentes: number
  percent: number
  campos: ContagemCampoProntidao[]
  pendencias: ItemPendenciaProntidao[]
}

export interface ItemOperacaoProntidao {
  rotulo: string
  ativo: boolean
  detalhe: string
}

export interface ChecklistProntidaoFiscal {
  status_geral: StatusGeralProntidao
  status_geral_label: string
  percent: number
  oficina: BlocoOficinaProntidao
  produtos: BlocoEntidadeProntidao
  servicos: BlocoEntidadeProntidao
  clientes: BlocoEntidadeProntidao
  operacao: ItemOperacaoProntidao[]
  proximos_passos: Array<{ texto: string; feito: boolean }>
}

function statusBlocoDePercent(percent: number, total: number): StatusBlocoProntidao {
  if (total <= 0) return 'incompleto'
  if (percent >= 90) return 'completo'
  if (percent >= 50) return 'atencao'
  return 'incompleto'
}

function avaliarOficina(oficina: DadosFiscaisOficina): BlocoOficinaProntidao {
  const itensUi = [
    { rotulo: 'CNPJ', ok: somenteDigitos(oficina.cnpj).length === 14 },
    { rotulo: 'Razão social', ok: Boolean(oficina.razao_social?.trim()) },
    { rotulo: 'Nome fantasia', ok: Boolean(oficina.nome_fantasia?.trim()) },
    { rotulo: 'Regime tributário', ok: Boolean(oficina.regime_tributario) },
    {
      rotulo: 'Endereço fiscal',
      ok: Boolean(oficina.endereco?.logradouro?.trim()),
    },
    { rotulo: 'Cidade', ok: Boolean(oficina.endereco?.cidade?.trim()) },
    {
      rotulo: 'UF',
      ok: Boolean(
        oficina.endereco?.uf &&
          ufFiscalValida(oficina.endereco.uf) &&
          oficina.endereco.uf.length === 2
      ),
    },
    {
      rotulo: 'CEP',
      ok: somenteDigitos(oficina.endereco?.cep).length === 8,
    },
    {
      rotulo: 'Telefone ou e-mail',
      ok: Boolean(oficina.telefone_fiscal?.trim() || oficina.email_fiscal?.trim()),
    },
    {
      rotulo: 'Inscrição estadual (se houver)',
      ok: Boolean(oficina.inscricao_estadual?.trim()),
    },
    {
      rotulo: 'Inscrição municipal (se houver)',
      ok: Boolean(oficina.inscricao_municipal?.trim()),
    },
  ]

  const obrigatorios = itensUi.filter(
    (i) => !i.rotulo.includes('(se houver)') && i.rotulo !== 'Nome fantasia'
  )
  const qtdOk = obrigatorios.filter((i) => i.ok).length
  const qtdTotal = obrigatorios.length
  const basico = cadastroFiscalBasicoPreenchido(oficina)
  const percent = qtdTotal ? Math.round((qtdOk / qtdTotal) * 100) : 0
  let status: StatusBlocoProntidao = statusBlocoDePercent(percent, qtdTotal)
  if (basico && percent >= 85) status = 'completo'
  else if (basico) status = 'atencao'
  else status = 'incompleto'

  return { status, itens: itensUi, qtdOk, qtdTotal }
}

function avaliarProdutos(pecas: Peca[]): BlocoEntidadeProntidao {
  const ativos = pecas.filter((p) => !entidadeFoiExcluida(p) && p.ativo !== false)
  const total = ativos.length
  let ncm = 0
  let cfop = 0
  let origem = 0
  let cst = 0
  let unidade = 0
  let cest = 0
  let ean = 0
  let prontos = 0
  const pendencias: ItemPendenciaProntidao[] = []

  for (const p of ativos) {
    const f = obterDadosFiscaisProduto(p)
    const temNcm = normalizarNcm(f.ncm).length === 8
    const temCfop = Boolean((f.cfop_padrao_venda ?? '').replace(/\D/g, '').length === 4)
    const temOrigem = Boolean(f.origem_mercadoria?.trim())
    const temCst = Boolean(f.cst_csosn?.trim())
    const temUnidade = Boolean(f.unidade_fiscal?.trim())
    const temCest = Boolean(f.cest?.trim())
    const temEan = Boolean(f.ean?.trim())
    if (temNcm) ncm++
    if (temCfop) cfop++
    if (temOrigem) origem++
    if (temCst) cst++
    if (temUnidade) unidade++
    if (temCest) cest++
    if (temEan) ean++
    const ok = cadastroFiscalProdutoBasicoPreenchido(f, p.nome)
    if (ok) {
      prontos++
    } else if (pendencias.length < 10) {
      const faltas: string[] = []
      if (!temNcm) faltas.push('NCM')
      if (!temUnidade) faltas.push('unidade')
      if (!temOrigem) faltas.push('origem')
      pendencias.push({
        id: p.id,
        nome: p.nome || 'Produto',
        motivo: faltas.length ? `Falta: ${faltas.join(', ')}` : 'Fiscal incompleto',
      })
    }
  }

  const pendentes = Math.max(0, total - prontos)
  const percent = total ? Math.round((prontos / total) * 100) : 0

  return {
    status: statusBlocoDePercent(percent, total),
    total,
    prontos,
    pendentes,
    percent,
    campos: [
      { rotulo: 'NCM', preenchidos: ncm, total },
      { rotulo: 'CFOP padrão', preenchidos: cfop, total },
      { rotulo: 'Origem', preenchidos: origem, total },
      { rotulo: 'CST/CSOSN', preenchidos: cst, total },
      { rotulo: 'Unidade fiscal', preenchidos: unidade, total },
      { rotulo: 'CEST (quando preenchido)', preenchidos: cest, total },
      { rotulo: 'EAN (quando houver)', preenchidos: ean, total },
    ],
    pendencias,
  }
}

function avaliarServicos(servicos: ServicoCatalogo[]): BlocoEntidadeProntidao {
  // Soft-deleted não conta; inativo (ativo=false) também fora do checklist operacional.
  const ativos = servicos.filter((s) => !s.deleted_at && s.ativo !== false)
  const total = ativos.length
  let desc = 0
  let codMun = 0
  let lc116 = 0
  let trib = 0
  let municipio = 0
  let exig = 0
  let issInfo = 0
  let prontos = 0
  const pendencias: ItemPendenciaProntidao[] = []

  for (const s of ativos) {
    const f = obterDadosFiscaisServico(s)
    const temDesc = Boolean(f.descricao_fiscal?.trim() || s.nome?.trim())
    const temCod = Boolean(f.codigo_municipal_servico?.trim())
    const temLc = Boolean(f.item_lista_servico_lc116?.trim())
    const temTrib = Boolean(f.codigo_tributacao_municipal?.trim())
    const temMun = Boolean(f.municipio_prestacao_padrao?.trim())
    const temExig = Boolean(f.exigibilidade_iss && f.exigibilidade_iss !== 'nao_informado')
    const temIss = f.aliquota_iss_informada != null && Number.isFinite(f.aliquota_iss_informada)
    if (temDesc) desc++
    if (temCod) codMun++
    if (temLc) lc116++
    if (temTrib) trib++
    if (temMun) municipio++
    if (temExig) exig++
    if (temIss) issInfo++
    const ok = cadastroFiscalServicoBasicoPreenchido(f, s.nome)
    if (ok) {
      prontos++
    } else if (pendencias.length < 10) {
      const faltas: string[] = []
      if (!temCod) faltas.push('código municipal')
      if (!temDesc) faltas.push('descrição')
      pendencias.push({
        id: s.id,
        nome: s.nome || 'Serviço',
        motivo: faltas.length ? `Falta: ${faltas.join(', ')}` : 'Fiscal incompleto',
      })
    }
  }

  const pendentes = Math.max(0, total - prontos)
  const percent = total ? Math.round((prontos / total) * 100) : 0

  return {
    status: statusBlocoDePercent(percent, total),
    total,
    prontos,
    pendentes,
    percent,
    campos: [
      { rotulo: 'Descrição fiscal', preenchidos: desc, total },
      { rotulo: 'Código municipal', preenchidos: codMun, total },
      { rotulo: 'Item LC 116', preenchidos: lc116, total },
      { rotulo: 'Tributação municipal', preenchidos: trib, total },
      { rotulo: 'Município de prestação', preenchidos: municipio, total },
      { rotulo: 'Exigibilidade ISS', preenchidos: exig, total },
      { rotulo: 'ISS informado (conferência)', preenchidos: issInfo, total },
    ],
    pendencias,
  }
}

function avaliarClientes(clientes: Cliente[]): BlocoEntidadeProntidao {
  const ativos = clientes.filter((c) => !entidadeFoiExcluida(c))
  const total = ativos.length
  let doc = 0
  let endereco = 0
  let cidadeUf = 0
  let cep = 0
  let ie = 0
  let prontos = 0
  const pendencias: ItemPendenciaProntidao[] = []

  for (const c of ativos) {
    const f = obterDadosFiscaisCliente(c)
    const temDoc =
      somenteDigitos(f.cpf).length === 11 || somenteDigitos(f.cnpj).length === 14
    const temEnd = Boolean(f.endereco?.logradouro?.trim())
    const temCidUf =
      Boolean(f.endereco?.cidade?.trim()) &&
      Boolean(f.endereco?.uf && ufFiscalValida(f.endereco.uf))
    const temCep = somenteDigitos(f.endereco?.cep).length === 8
    const temIe = Boolean(f.indicador_ie || f.inscricao_estadual?.trim())
    if (temDoc) doc++
    if (temEnd) endereco++
    if (temCidUf) cidadeUf++
    if (temCep) cep++
    if (temIe) ie++
    const ok = cadastroFiscalClienteBasicoPreenchido(f, c.nome)
    if (ok) {
      prontos++
    } else if (pendencias.length < 10) {
      const faltas: string[] = []
      if (!temDoc) faltas.push('CPF/CNPJ')
      if (!temCidUf) faltas.push('cidade/UF')
      pendencias.push({
        id: c.id,
        nome: c.nome || 'Cliente',
        motivo: faltas.length ? `Falta: ${faltas.join(', ')}` : 'Fiscal incompleto',
      })
    }
  }

  const pendentes = Math.max(0, total - prontos)
  const percent = total ? Math.round((prontos / total) * 100) : 0

  return {
    status: statusBlocoDePercent(percent, total),
    total,
    prontos,
    pendentes,
    percent,
    campos: [
      { rotulo: 'CPF/CNPJ fiscal', preenchidos: doc, total },
      { rotulo: 'Endereço fiscal', preenchidos: endereco, total },
      { rotulo: 'Cidade/UF', preenchidos: cidadeUf, total },
      { rotulo: 'CEP', preenchidos: cep, total },
      { rotulo: 'Indicador IE (quando aplicável)', preenchidos: ie, total },
    ],
    pendencias,
  }
}

function resolverStatusGeral(input: {
  oficina: BlocoOficinaProntidao
  produtos: BlocoEntidadeProntidao
  servicos: BlocoEntidadeProntidao
  clientes: BlocoEntidadeProntidao
  oficinaBasica: boolean
}): { status: StatusGeralProntidao; label: string; percent: number } {
  const { oficina, produtos, servicos, clientes, oficinaBasica } = input
  const temCnpjOuRazao = oficina.itens.some(
    (i) => (i.rotulo === 'CNPJ' || i.rotulo === 'Razão social') && i.ok
  )
  const ofPercent = oficina.qtdTotal
    ? Math.round((oficina.qtdOk / oficina.qtdTotal) * 100)
    : 0

  const blocosEntidade = [produtos, servicos, clientes].filter((b) => b.total > 0)
  const mediaEnt =
    blocosEntidade.length > 0
      ? Math.round(
          blocosEntidade.reduce((acc, b) => acc + b.percent, 0) / blocosEntidade.length
        )
      : 0

  const percent = Math.round(ofPercent * 0.35 + mediaEnt * 0.65)

  if (!temCnpjOuRazao || (!oficinaBasica && mediaEnt < 15)) {
    return {
      status: 'nao_configurado',
      label: 'Não configurado',
      percent: Math.min(percent, 25),
    }
  }

  const produtosOk = produtos.total === 0 || produtos.percent >= 70
  const servicosOk = servicos.total === 0 || servicos.percent >= 70
  const clientesOk = clientes.total === 0 || clientes.percent >= 50
  const oficinaOk = oficina.status === 'completo' || oficinaBasica

  if (oficinaOk && produtosOk && servicosOk && clientesOk && percent >= 75) {
    return {
      status: 'pronto_homologacao',
      label: 'Pronto para iniciar homologação fiscal',
      percent: Math.max(percent, 75),
    }
  }

  if (oficinaBasica && percent >= 50) {
    return {
      status: 'quase_pronto',
      label: 'Quase pronto',
      percent,
    }
  }

  return {
    status: 'incompleto',
    label: 'Incompleto',
    percent,
  }
}

export function montarChecklistProntidaoFiscal(input: {
  configuracao?: ConfiguracaoOficina | null
  pecas?: Peca[]
  clientes?: Cliente[]
  servicosCatalogo?: ServicoCatalogo[]
}): ChecklistProntidaoFiscal {
  const oficinaDados = obterDadosFiscaisOficina(input.configuracao)
  const oficina = avaliarOficina(oficinaDados)
  const produtos = avaliarProdutos(input.pecas ?? [])
  const servicos = avaliarServicos(input.servicosCatalogo ?? [])
  const clientes = avaliarClientes(input.clientes ?? [])
  const oficinaBasica = cadastroFiscalBasicoPreenchido(oficinaDados)

  const geral = resolverStatusGeral({
    oficina,
    produtos,
    servicos,
    clientes,
    oficinaBasica,
  })

  const operacao: ItemOperacaoProntidao[] = [
    { rotulo: 'Preparar nota', ativo: true, detalhe: 'Ativo — conferência interna' },
    { rotulo: 'Rascunhos fiscais', ativo: true, detalhe: 'Ativo' },
    { rotulo: 'Espelho fiscal', ativo: true, detalhe: 'Ativo — sem validade fiscal' },
    { rotulo: 'Emissão real', ativo: false, detalhe: 'Não ativa' },
    { rotulo: 'XML autorizado', ativo: false, detalhe: 'Não ativo' },
    { rotulo: 'DANFE oficial', ativo: false, detalhe: 'Não ativo' },
    { rotulo: 'Provedor fiscal', ativo: false, detalhe: 'Não configurado' },
    { rotulo: 'Certificado A1', ativo: false, detalhe: 'Não configurado' },
    { rotulo: 'Homologação', ativo: false, detalhe: 'Não ativa' },
    { rotulo: 'Produção fiscal', ativo: false, detalhe: 'Não ativa' },
  ]

  const proximos_passos = [
    {
      texto: 'Completar dados fiscais da oficina',
      feito: oficinaBasica && oficina.status !== 'incompleto',
    },
    {
      texto: 'Completar produtos mais vendidos',
      feito: produtos.total > 0 && produtos.percent >= 70,
    },
    {
      texto: 'Completar serviços mais usados',
      feito: servicos.total === 0 || servicos.percent >= 70,
    },
    {
      texto: 'Revisar clientes que pedem nota',
      feito: clientes.total > 0 && clientes.percent >= 50,
    },
    { texto: 'Escolher provedor fiscal', feito: false },
    { texto: 'Configurar certificado A1', feito: false },
    { texto: 'Fazer homologação', feito: false },
    { texto: 'Testar emissão (fase futura)', feito: false },
    { texto: 'Ativar produção fiscal no futuro', feito: false },
  ]

  return {
    status_geral: geral.status,
    status_geral_label: geral.label,
    percent: geral.percent,
    oficina,
    produtos,
    servicos,
    clientes,
    operacao,
    proximos_passos,
  }
}
