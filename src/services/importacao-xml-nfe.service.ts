import { parsearXmlNfe, type NotaFiscalNfeXml, type ProdutoNfeXml } from '@/lib/nfe-xml-parse'
import {
  buscarImportacaoXmlNfeAnterior,
  registrarImportacaoXmlNfe,
  resolverOfficeIdHistoricoXml,
  type RegistroImportacaoXmlNfe,
} from '@/services/importacao-xml-nfe-historico.storage'
import { normalizarUnidadePeca } from '@/types/unidade-peca'
import type { Fornecedor, FornecedorInput, Peca, PecaInput } from '@/types'

export type AcaoImportacaoXmlNfe = 'criar' | 'atualizar' | 'ignorar'

export interface FornecedorNfeResolvido {
  cnpj?: string
  nome?: string
  fornecedorId?: string
  fornecedorExistente: boolean
  sugerirCriar: boolean
}

export interface ItemImportacaoXmlNfe {
  produto: ProdutoNfeXml
  pecaExistenteId?: string
  pecaExistenteNome?: string
  acao: AcaoImportacaoXmlNfe
  acaoSugerida: AcaoImportacaoXmlNfe
}

export interface DuplicidadeImportacaoXmlNfe {
  jaImportada: boolean
  registroAnterior?: RegistroImportacaoXmlNfe
}

export interface PreviewImportacaoXmlNfe {
  nota: NotaFiscalNfeXml
  fornecedor: FornecedorNfeResolvido
  itens: ItemImportacaoXmlNfe[]
  duplicidade: DuplicidadeImportacaoXmlNfe
}

export interface ResumoImportacaoXmlNfe {
  criados: number
  atualizados: number
  ignorados: number
  fornecedorCriado: boolean
}

export interface OpcoesExecutarImportacaoXmlNfe {
  criarFornecedor: boolean
  fornecedorId?: string
  officeId: string | null | undefined
  confirmouDuplicata?: boolean
}

export const MSG_XML_INVALIDO =
  'Não foi possível ler este XML. Verifique se o arquivo é uma NF-e válida.'

export const MSG_XML_SEM_PRODUTOS = 'Nenhum produto foi encontrado neste XML.'

export const MSG_IMPORTACAO_SUCESSO = 'Itens importados para o estoque com sucesso.'

export const MSG_NOTA_JA_IMPORTADA =
  'Esta nota fiscal já foi importada anteriormente. Importar novamente pode duplicar a entrada de estoque.'

function normalizarCnpj(cnpj?: string): string {
  return cnpj?.replace(/\D/g, '') ?? ''
}

function normalizarDescricao(desc: string): string {
  return desc.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function acharPecaSimilar(
  produto: Pick<ProdutoNfeXml, 'codigo' | 'descricao' | 'codigoBarras'>,
  pecas: Peca[]
): Peca | undefined {
  const codigo = produto.codigo.trim().toLowerCase()
  if (codigo) {
    const porCodigo = pecas.find((p) => p.codigo.trim().toLowerCase() === codigo)
    if (porCodigo) return porCodigo
  }

  const ean = produto.codigoBarras?.replace(/\D/g, '')
  if (ean && ean.length >= 8) {
    const porEan = pecas.find((p) => p.codigo_barras?.replace(/\D/g, '') === ean)
    if (porEan) return porEan
  }

  const nome = normalizarDescricao(produto.descricao)
  return pecas.find((p) => normalizarDescricao(p.nome) === nome)
}

function resolverFornecedorNfe(
  nota: NotaFiscalNfeXml,
  fornecedores: Fornecedor[]
): FornecedorNfeResolvido {
  const cnpj = nota.cnpjEmitente?.trim()
  const nome = nota.nomeEmitente?.trim()
  const cnpjNorm = normalizarCnpj(cnpj)

  if (cnpjNorm.length >= 11) {
    const existente = fornecedores.find((f) => normalizarCnpj(f.cnpj) === cnpjNorm)
    if (existente) {
      return {
        cnpj,
        nome: existente.nome,
        fornecedorId: existente.id,
        fornecedorExistente: true,
        sugerirCriar: false,
      }
    }
  }

  if (nome) {
    const porNome = fornecedores.find(
      (f) => f.nome.trim().toLowerCase() === nome.toLowerCase()
    )
    if (porNome) {
      return {
        cnpj: porNome.cnpj ?? cnpj,
        nome: porNome.nome,
        fornecedorId: porNome.id,
        fornecedorExistente: true,
        sugerirCriar: false,
      }
    }
  }

  return {
    cnpj,
    nome,
    fornecedorExistente: false,
    sugerirCriar: Boolean(cnpj || nome),
  }
}

export function montarPreviewImportacaoXmlNfe(
  conteudoXml: string,
  pecas: Peca[],
  fornecedores: Fornecedor[],
  officeId: string | null | undefined
): PreviewImportacaoXmlNfe {
  let nota: NotaFiscalNfeXml
  try {
    nota = parsearXmlNfe(conteudoXml)
  } catch (err) {
    if (err instanceof Error && err.message === 'SEM_PRODUTOS') {
      throw new Error(MSG_XML_SEM_PRODUTOS)
    }
    throw new Error(MSG_XML_INVALIDO)
  }

  const fornecedor = resolverFornecedorNfe(nota, fornecedores)

  const itens: ItemImportacaoXmlNfe[] = nota.produtos.map((produto) => {
    const pecaExistente = acharPecaSimilar(produto, pecas)
    const acaoSugerida: AcaoImportacaoXmlNfe = pecaExistente ? 'atualizar' : 'criar'
    return {
      produto,
      pecaExistenteId: pecaExistente?.id,
      pecaExistenteNome: pecaExistente?.nome,
      acao: acaoSugerida,
      acaoSugerida,
    }
  })

  const registroAnterior = buscarImportacaoXmlNfeAnterior(officeId, nota)

  return {
    nota,
    fornecedor,
    itens,
    duplicidade: {
      jaImportada: Boolean(registroAnterior),
      registroAnterior,
    },
  }
}

function produtoParaPecaInput(
  item: ItemImportacaoXmlNfe,
  fornecedorId?: string
): PecaInput {
  const { produto } = item
  const custo = produto.custoUnitario > 0 ? produto.custoUnitario : 0
  return {
    nome: produto.descricao.trim(),
    codigo: produto.codigo.trim() || `NFE-${produto.indice}`,
    codigo_barras: produto.codigoBarras,
    marca: '—',
    categoria: 'outros',
    fornecedor_id: fornecedorId,
    custo,
    preco_venda: custo > 0 ? Math.round(custo * 1.3 * 100) / 100 : 0,
    quantidade: produto.quantidade > 0 ? produto.quantidade : 0,
    estoque_minimo: 5,
    unidade: normalizarUnidadePeca(produto.unidade),
    ativo: true,
    observacao: [
      produto.ncm ? `NCM ${produto.ncm}` : '',
      produto.cfop ? `CFOP ${produto.cfop}` : '',
    ]
      .filter(Boolean)
      .join(' · ') || undefined,
  }
}

export function executarImportacaoXmlNfe(
  preview: PreviewImportacaoXmlNfe,
  pecas: Peca[],
  opcoes: OpcoesExecutarImportacaoXmlNfe,
  adicionarPeca: (p: PecaInput) => Peca,
  atualizarPeca: (id: string, p: Partial<PecaInput>) => void,
  adicionarFornecedor: (f: FornecedorInput) => Fornecedor
): ResumoImportacaoXmlNfe {
  if (preview.duplicidade.jaImportada && !opcoes.confirmouDuplicata) {
    throw new Error('CONFIRMACAO_DUPLICATA_OBRIGATORIA')
  }

  const resumo: ResumoImportacaoXmlNfe = {
    criados: 0,
    atualizados: 0,
    ignorados: 0,
    fornecedorCriado: false,
  }

  let fornecedorId = opcoes.fornecedorId ?? preview.fornecedor.fornecedorId

  if (
    !fornecedorId &&
    opcoes.criarFornecedor &&
    preview.fornecedor.sugerirCriar &&
    preview.fornecedor.nome
  ) {
    const novo = adicionarFornecedor({
      nome: preview.fornecedor.nome,
      cnpj: preview.fornecedor.cnpj,
      ativo: true,
      observacoes: preview.nota.numero
        ? `Importado da NF-e nº ${preview.nota.numero}`
        : 'Importado via XML de NF-e',
    })
    fornecedorId = novo.id
    resumo.fornecedorCriado = true
  }

  for (const item of preview.itens) {
    if (item.acao === 'ignorar') {
      resumo.ignorados++
      continue
    }

    if (item.acao === 'atualizar' && item.pecaExistenteId) {
      const pecaAtual = pecas.find((p) => p.id === item.pecaExistenteId)
      const qtdNova =
        (pecaAtual?.quantidade ?? 0) + (item.produto.quantidade > 0 ? item.produto.quantidade : 0)
      const patch: Partial<PecaInput> = {
        quantidade: qtdNova,
        fornecedor_id: fornecedorId ?? pecaAtual?.fornecedor_id,
      }
      if (item.produto.custoUnitario > 0) {
        patch.custo = item.produto.custoUnitario
      }
      atualizarPeca(item.pecaExistenteId, patch)
      resumo.atualizados++
      continue
    }

    if (item.acao === 'criar') {
      adicionarPeca(produtoParaPecaInput(item, fornecedorId))
      resumo.criados++
    }
  }

  const itensImportados = preview.itens.filter((i) => i.acao !== 'ignorar').length
  if (itensImportados > 0) {
    registrarImportacaoXmlNfe(
      resolverOfficeIdHistoricoXml(opcoes.officeId),
      preview.nota,
      {
        nome: preview.fornecedor.nome,
        cnpj: preview.fornecedor.cnpj,
      },
      itensImportados
    )
  }

  return resumo
}
