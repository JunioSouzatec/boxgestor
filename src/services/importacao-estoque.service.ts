import { linhasCsvParaObjetos, parseCsvTexto } from '@/lib/csv-parse'
import type { CategoriaPeca } from '@/types/peca'
import { CATEGORIAS_PECA } from '@/types/peca'
import type { Fornecedor, Peca, PecaInput } from '@/types'

export const MODELO_CSV_ESTOQUE =
  'nome,categoria,codigo,quantidade,estoque_minimo,custo,preco_venda,fornecedor,localizacao,observacao\n' +
  'Filtro de óleo,filtro,FLT-001,10,5,25.00,45.00,Auto Peças,Prateleira A1,Item de exemplo\n'

export type PoliticaDuplicadoImportacao = 'atualizar' | 'ignorar' | 'criar'

export interface LinhaImportacaoEstoque {
  linha: number
  dados: PecaInput
  erros: string[]
  avisos: string[]
  duplicadoId?: string
  duplicadoPor?: 'codigo' | 'nome'
  status: 'valido' | 'erro' | 'duplicado'
}

export interface ResumoImportacaoEstoque {
  importados: number
  atualizados: number
  ignorados: number
  erros: number
}

function parseNumero(valor: string, padrao = 0): number {
  const n = Number(String(valor).replace(',', '.').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : padrao
}

function normalizarCategoria(valor: string): CategoriaPeca {
  const v = valor.trim().toLowerCase()
  if (!v) return 'outros'
  const porValor = CATEGORIAS_PECA.find((c) => c.value === v)
  if (porValor) return porValor.value
  const porLabel = CATEGORIAS_PECA.find(
    (c) => c.label.toLowerCase() === v || c.label.toLowerCase().includes(v)
  )
  return porLabel?.value ?? 'outros'
}

function resolverFornecedorId(nome: string | undefined, fornecedores: Fornecedor[]): string | undefined {
  if (!nome?.trim()) return undefined
  const alvo = nome.trim().toLowerCase()
  return fornecedores.find((f) => f.nome.trim().toLowerCase() === alvo)?.id
}

function acharDuplicado(
  dados: PecaInput,
  pecas: Peca[]
): { id: string; por: 'codigo' | 'nome' } | undefined {
  const codigo = dados.codigo?.trim().toLowerCase()
  if (codigo) {
    const porCodigo = pecas.find((p) => p.codigo.trim().toLowerCase() === codigo)
    if (porCodigo) return { id: porCodigo.id, por: 'codigo' }
  }
  const nome = dados.nome.trim().toLowerCase()
  const porNome = pecas.find((p) => p.nome.trim().toLowerCase() === nome)
  if (porNome) return { id: porNome.id, por: 'nome' }
  return undefined
}

export function parsearCsvEstoque(
  texto: string,
  pecas: Peca[],
  fornecedores: Fornecedor[]
): LinhaImportacaoEstoque[] {
  const linhas = parseCsvTexto(texto)
  const objetos = linhasCsvParaObjetos(linhas)

  return objetos.map((row, idx) => {
    const linha = idx + 2
    const erros: string[] = []
    const avisos: string[] = []

    const nome = row.nome ?? row['nome do item'] ?? ''
    if (!nome.trim()) erros.push('Nome do item é obrigatório.')

    const categoria = normalizarCategoria(row.categoria ?? '')
    const codigo = (row.codigo ?? row.sku ?? '').trim() || `IMP-${Date.now()}-${idx}`
    const quantidade = parseNumero(row.quantidade ?? '0')
    const estoqueMinimo = parseNumero(row.estoque_minimo ?? row['estoque minimo'] ?? '5', 5)
    const custo = parseNumero(row.custo ?? '0')
    const precoVenda = parseNumero(row.preco_venda ?? row['preço de venda'] ?? row['preco de venda'] ?? '0')
    const fornecedorNome = row.fornecedor
    const fornecedorId = resolverFornecedorId(fornecedorNome, fornecedores)

    if (fornecedorNome && !fornecedorId) {
      avisos.push(`Fornecedor "${fornecedorNome}" não encontrado — item será salvo sem vínculo.`)
    }
    if (quantidade < 0) erros.push('Quantidade não pode ser negativa.')
    if (custo < 0 || precoVenda < 0) erros.push('Custo e preço de venda devem ser ≥ 0.')

    const dados: PecaInput = {
      nome: nome.trim() || 'Item sem nome',
      codigo,
      marca: '—',
      categoria,
      fornecedor_id: fornecedorId,
      custo,
      preco_venda: precoVenda,
      quantidade,
      estoque_minimo: estoqueMinimo,
      localizacao: row.localizacao?.trim() || undefined,
      observacao: row.observacao?.trim() || undefined,
      unidade: 'unidade',
      ativo: true,
    }

    const dup = erros.length === 0 ? acharDuplicado(dados, pecas) : undefined

    return {
      linha,
      dados,
      erros,
      avisos,
      duplicadoId: dup?.id,
      duplicadoPor: dup?.por,
      status: erros.length > 0 ? 'erro' : dup ? 'duplicado' : 'valido',
    }
  })
}

export function executarImportacaoEstoque(
  linhas: LinhaImportacaoEstoque[],
  politicaDuplicado: PoliticaDuplicadoImportacao,
  adicionarPeca: (p: PecaInput) => Peca,
  atualizarPeca: (id: string, p: Partial<PecaInput>) => void
): ResumoImportacaoEstoque {
  const resumo: ResumoImportacaoEstoque = {
    importados: 0,
    atualizados: 0,
    ignorados: 0,
    erros: 0,
  }

  for (const item of linhas) {
    if (item.status === 'erro') {
      resumo.erros++
      continue
    }

    if (item.status === 'duplicado' && item.duplicadoId) {
      if (politicaDuplicado === 'ignorar') {
        resumo.ignorados++
        continue
      }
      if (politicaDuplicado === 'atualizar') {
        atualizarPeca(item.duplicadoId, item.dados)
        resumo.atualizados++
        continue
      }
    }

    adicionarPeca(item.dados)
    resumo.importados++
  }

  return resumo
}
