import {
  montarLinhasContatoOficina,
  montarLinhasEnderecoOficina,
} from '@/lib/oficina-format'
import { formatarData, formatarMoeda, formatarTelefone } from '@/lib/utils'
import {
  formatarRespostaChecklist,
  getLabelCategoriaChecklist,
  garantirChecklistPadrao,
  normalizarChecklistEntrada,
} from '@/services/checklist-modelo.service'
import { OFFICE_ID } from '@/types/base'
import type { Cliente, LancamentoFinanceiro, ModeloChecklist, Moto, Oficina, OrdemServico } from '@/types'
import {
  getLabelFormaPagamento,
  getLabelStatusOrcamento,
  getLabelStatusOS,
} from '@/types'

export interface OsDocumentoPagamento {
  formas: string[]
  status: string
}

export interface OsDocumentoChecklistItem {
  categoria: string
  item: string
  resposta: string
  observacao?: string
}

export interface OsDocumentoViewModel {
  oficina: {
    nome: string
    nomeFantasia?: string
    cnpj?: string
    enderecoLinhas: string[]
    contatoLinhas: string[]
    logoUrl?: string
  }
  os: {
    numero: number
    abertura: string
    previsao?: string
    status: string
    statusOrcamento?: string
    responsavel?: string
  }
  cliente: {
    nome: string
    telefone?: string
    whatsapp?: string
    cpf?: string
    endereco?: string
  }
  moto: {
    marca: string
    modelo: string
    ano: number
    placa: string
    cor: string
    kmEntrada?: string
    kmSaida?: string
    chassi?: string
  }
  servico: {
    defeito: string
    diagnostico?: string
    executados?: string
    checklist: OsDocumentoChecklistItem[]
    checklistObservacoes?: string
    pecas: { nome: string; qtd: number; unitario: string; subtotal: string }[]
    fotos: { url: string; tipo: string; descricao?: string }[]
  }
  valores: {
    pecas: string
    maoObra: string
    desconto: string
    total: string
    pagamento?: OsDocumentoPagamento
  }
  garantia: {
    dias?: string
    vencimento?: string
    observacoes?: string
  }
  assinaturas: {
    clienteNome: string
    oficinaNome: string
  }
}

function formatarKm(km?: number): string | undefined {
  if (km === undefined || km === null) return undefined
  return `${km.toLocaleString('pt-BR')} km`
}

function formatarTelefoneCliente(telefone?: string): string | undefined {
  if (!telefone?.trim()) return undefined
  const numeros = telefone.replace(/\D/g, '')
  return numeros ? formatarTelefone(numeros) : telefone.trim()
}

export function obterPagamentoOS(
  osId: string,
  lancamentos: LancamentoFinanceiro[]
): OsDocumentoPagamento | null {
  const receitas = lancamentos.filter(
    (l) => l.ordem_servico_id === osId && l.tipo === 'receita'
  )
  if (!receitas.length) return null

  const formas = [...new Set(receitas.map((l) => getLabelFormaPagamento(l.forma_pagamento)))]
  const todosPagos = receitas.every((l) => l.pago)
  const algumPago = receitas.some((l) => l.pago)
  const algumPendente = receitas.some((l) => !l.pago)

  let status = 'Pendente'
  if (todosPagos) status = 'Pago'
  else if (algumPago && algumPendente) status = 'Parcialmente pago'

  return { formas, status }
}

export function buildOsDocumentoViewModel(
  os: OrdemServico,
  cliente: Cliente,
  moto: Moto,
  oficina: Oficina,
  lancamentos: LancamentoFinanceiro[] = [],
  modelos: ModeloChecklist[] = [],
  officeId: string = OFFICE_ID
): OsDocumentoViewModel {
  const modelosSeguros = garantirChecklistPadrao(modelos, officeId)
  const checklistEntrada = normalizarChecklistEntrada(
    os.checklist_entrada,
    modelosSeguros,
    officeId
  )

  const checklist: OsDocumentoChecklistItem[] = checklistEntrada.itens
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
    .map((item) => ({
      categoria: getLabelCategoriaChecklist(item.categoria),
      item: item.nome,
      resposta: formatarRespostaChecklist(item),
      observacao: item.observacao,
    }))

  const pagamento = obterPagamentoOS(os.id, lancamentos)
  const telCliente = formatarTelefoneCliente(cliente.telefone)

  return {
    oficina: {
      nome: oficina.nome,
      nomeFantasia: oficina.nome_fantasia?.trim() || undefined,
      cnpj: oficina.cnpj?.trim() || undefined,
      enderecoLinhas: montarLinhasEnderecoOficina(oficina),
      contatoLinhas: montarLinhasContatoOficina(oficina),
      logoUrl: oficina.logo_url,
    },
    os: {
      numero: os.numero,
      abertura: formatarData(os.criado_em),
      previsao: os.data_previsao ? formatarData(os.data_previsao) : undefined,
      status: getLabelStatusOS(os.status),
      statusOrcamento: os.status_orcamento
        ? getLabelStatusOrcamento(os.status_orcamento)
        : undefined,
      responsavel: os.responsavel?.trim() || undefined,
    },
    cliente: {
      nome: cliente.nome,
      telefone: telCliente,
      whatsapp: telCliente,
      cpf: cliente.cpf?.trim() || undefined,
      endereco: cliente.endereco?.trim() || undefined,
    },
    moto: {
      marca: moto.marca,
      modelo: moto.modelo,
      ano: moto.ano,
      placa: moto.placa,
      cor: moto.cor,
      kmEntrada: formatarKm(os.quilometragem_entrada ?? moto.quilometragem),
      kmSaida: formatarKm(os.quilometragem_saida),
      chassi: moto.chassi?.trim() || undefined,
    },
    servico: {
      defeito: os.defeito_relatado,
      diagnostico: os.diagnostico?.trim() || undefined,
      executados: os.servicos_executados?.trim() || undefined,
      checklist,
      checklistObservacoes: checklistEntrada.observacoes_gerais?.trim() || undefined,
      pecas: os.pecas_utilizadas.map((p) => ({
        nome: p.nome,
        qtd: p.quantidade,
        unitario: formatarMoeda(p.valor_unitario),
        subtotal: formatarMoeda(p.quantidade * p.valor_unitario),
      })),
      fotos: (os.fotos ?? []).map((f) => ({
        url: f.url,
        tipo: f.tipo === 'antes' ? 'Antes' : 'Depois',
        descricao: f.descricao,
      })),
    },
    valores: {
      pecas: formatarMoeda(os.valor_pecas),
      maoObra: formatarMoeda(os.valor_mao_obra),
      desconto: formatarMoeda(os.desconto),
      total: formatarMoeda(os.valor_total),
      pagamento: pagamento ?? undefined,
    },
    garantia: {
      dias: os.dias_garantia ? `${os.dias_garantia} dias` : undefined,
      vencimento: os.data_vencimento_garantia
        ? formatarData(os.data_vencimento_garantia)
        : undefined,
      observacoes: os.observacoes_garantia?.trim() || undefined,
    },
    assinaturas: {
      clienteNome: cliente.nome,
      oficinaNome: oficina.nome_fantasia?.trim() || oficina.nome,
    },
  }
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
