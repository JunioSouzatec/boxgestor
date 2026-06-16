import { linhasCsvParaObjetos, parseCsvTexto } from '@/lib/csv-parse'
import type { Fornecedor, FornecedorInput } from '@/types'

export const MODELO_CSV_FORNECEDORES =
  'nome,cnpj_cpf,telefone,whatsapp,email,contato,endereco,cidade,estado,observacao\n' +
  'Auto Peças Ltda,12.345.678/0001-99,(11) 3333-4444,(11) 98888-7777,contato@autopecas.com.br,João Silva,Rua das Peças 100,São Paulo,SP,Fornecedor de exemplo\n'

export type PoliticaDuplicadoImportacao = 'atualizar' | 'ignorar' | 'criar'

export interface LinhaImportacaoFornecedor {
  linha: number
  dados: FornecedorInput
  erros: string[]
  avisos: string[]
  duplicadoId?: string
  duplicadoPor?: 'cnpj' | 'nome'
  status: 'valido' | 'erro' | 'duplicado'
}

export interface ResumoImportacaoFornecedores {
  importados: number
  atualizados: number
  ignorados: number
  erros: number
}

function acharDuplicadoFornecedor(
  dados: FornecedorInput,
  fornecedores: Fornecedor[]
): { id: string; por: 'cnpj' | 'nome' } | undefined {
  const cnpj = dados.cnpj?.replace(/\D/g, '')
  if (cnpj && cnpj.length >= 11) {
    const porCnpj = fornecedores.find(
      (f) => f.cnpj?.replace(/\D/g, '') === cnpj
    )
    if (porCnpj) return { id: porCnpj.id, por: 'cnpj' }
  }
  const nome = dados.nome.trim().toLowerCase()
  const porNome = fornecedores.find((f) => f.nome.trim().toLowerCase() === nome)
  if (porNome) return { id: porNome.id, por: 'nome' }
  return undefined
}

function montarObservacoes(contato: string | undefined, observacao: string | undefined): string | undefined {
  const partes: string[] = []
  if (contato?.trim()) partes.push(`Contato: ${contato.trim()}`)
  if (observacao?.trim()) partes.push(observacao.trim())
  return partes.length ? partes.join(' — ') : undefined
}

export function parsearCsvFornecedores(
  texto: string,
  fornecedores: Fornecedor[]
): LinhaImportacaoFornecedor[] {
  const linhas = parseCsvTexto(texto)
  const objetos = linhasCsvParaObjetos(linhas)

  return objetos.map((row, idx) => {
    const linha = idx + 2
    const erros: string[] = []
    const nome = row.nome ?? ''
    if (!nome.trim()) erros.push('Nome é obrigatório.')

    const email = row.email?.trim()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      erros.push('E-mail inválido.')
    }

    const dados: FornecedorInput = {
      nome: nome.trim() || 'Fornecedor sem nome',
      cnpj: (row.cnpj_cpf ?? row.cnpj ?? '').trim() || undefined,
      telefone: row.telefone?.trim() || undefined,
      whatsapp: row.whatsapp?.trim() || undefined,
      email: email || undefined,
      endereco: row.endereco?.trim() || undefined,
      cidade: row.cidade?.trim() || undefined,
      estado: row.estado?.trim() || undefined,
      observacoes: montarObservacoes(row.contato, row.observacao),
      ativo: true,
    }

    const dup = erros.length === 0 ? acharDuplicadoFornecedor(dados, fornecedores) : undefined

    return {
      linha,
      dados,
      erros,
      avisos: [],
      duplicadoId: dup?.id,
      duplicadoPor: dup?.por,
      status: erros.length > 0 ? 'erro' : dup ? 'duplicado' : 'valido',
    }
  })
}

export function executarImportacaoFornecedores(
  linhas: LinhaImportacaoFornecedor[],
  politicaDuplicado: PoliticaDuplicadoImportacao,
  adicionarFornecedor: (f: FornecedorInput) => Fornecedor,
  atualizarFornecedor: (id: string, f: Partial<FornecedorInput>) => void
): ResumoImportacaoFornecedores {
  const resumo: ResumoImportacaoFornecedores = {
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
        atualizarFornecedor(item.duplicadoId, item.dados)
        resumo.atualizados++
        continue
      }
    }

    adicionarFornecedor(item.dados)
    resumo.importados++
  }

  return resumo
}
