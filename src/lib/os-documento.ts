import { obterLogoOficinaDocumento } from '@/lib/oficina-logo'
import {
  montarLinhasContatoOficina,
  montarLinhasEnderecoOficina,
} from '@/lib/oficina-format'
import { formatarData, formatarMoeda, formatarTelefone } from '@/lib/utils'
import { formatarLinhaPecaPdf } from '@/lib/peca-documento-format'
import {
  montarHistoricoPagamentosDocumento,
  type PagamentoRegistradoDocumento,
} from '@/lib/pagamentos-documento'
import {
  formatarRespostaChecklist,
  getLabelCategoriaChecklist,
  garantirChecklistPadrao,
  normalizarChecklistEntrada,
} from '@/services/checklist-modelo.service'
import { ehItemCombustivelChecklist } from '@/lib/combustivel-checklist'
import { obterTermosOficina } from '@/lib/termos-oficina'
import { ehDocumentoOrcamento, tituloDocumentoOS } from '@/lib/os-modo-documento'
import { OFFICE_ID } from '@/types/base'
import type { Cliente, LancamentoFinanceiro, ModeloChecklist, Moto, Oficina, OrdemServico } from '@/types'
import { getLabelStatusFinanceiroOS, getLabelStatusOrcamento, getLabelStatusOS } from '@/types'
import { formatarDetalhePagamento, formatarPagamentoAVista } from '@/lib/pagamento-format'
import {
  calcularResumoFinanceiroOS,
} from '@/services/os-financeiro.service'
import { osModoEhCompleta } from '@/lib/os-modo'
import {
  logPagamentosDocumentoDev,
  listarPagamentosOsEstrito,
} from '@/lib/pagamentos-os-vinculo'
import { obterDataEntradaOS, obterDataSaidaOS } from '@/services/os-datas.service'

export interface OsDocumentoPagamentoItem {
  forma: string
  parcelamento?: string
  pagamento?: string
  total: string
}

export interface OsDocumentoPagamento {
  itens: OsDocumentoPagamentoItem[]
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
    entrada: string
    previsao?: string
    saida?: string
    /** @deprecated use entrada */
    abertura: string
    status: string
    statusOrcamento?: string
    responsavel?: string
    tituloDocumento: string
    rotuloNumero: string
    ehOrcamento: boolean
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
    servicos: { nome: string; descricao?: string; maoObra: string }[]
    checklist: OsDocumentoChecklistItem[]
    checklistObservacoes?: string
    pecas: { nome: string; codigo?: string; linha: string; subtotal: string; observacao?: string }[]
    fotos: { url: string; tipo: string; descricao?: string }[]
  }
  valores: {
    pecas: string
    maoObra: string
    adicional: string
    desconto: string
    total: string
    valorPago: string
    valorPendente: string
    temAdicional: boolean
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
  /** Dados da moto | Dados do veículo */
  secaoVeiculoTitulo: string
  pagamentosRegistrados: PagamentoRegistradoDocumento[]
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
  os: OrdemServico,
  lancamentos: LancamentoFinanceiro[]
): OsDocumentoPagamento | null {
  const receitas = listarPagamentosOsEstrito(os, lancamentos)
  if (!receitas.length && !os.status_financeiro) return null

  const itens: OsDocumentoPagamentoItem[] = receitas.map((l) => {
    const detalhe = formatarDetalhePagamento(l)
    return {
      forma: detalhe.forma,
      parcelamento: detalhe.parcelamento,
      pagamento:
        l.forma_pagamento === 'credito' && !detalhe.parcelamento
          ? formatarPagamentoAVista()
          : undefined,
      total: detalhe.total,
    }
  })

  const resumo = calcularResumoFinanceiroOS(os, lancamentos)

  return {
    itens,
    status: getLabelStatusFinanceiroOS(resumo.statusFinanceiroEfetivo),
  }
}

function checklistTemRespostas(itens: OsDocumentoChecklistItem[]): boolean {
  return itens.some((item) => item.resposta !== '—' || Boolean(item.observacao?.trim()))
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
      observacao: ehItemCombustivelChecklist(item) ? undefined : item.observacao,
    }))

  const modoCompleta = osModoEhCompleta(oficina.preferencias)
  const checklistVisivel = modoCompleta || checklistTemRespostas(checklist)

  const pagamento = obterPagamentoOS(os, lancamentos)
  const resumoFinanceiro = calcularResumoFinanceiroOS(os, lancamentos)
  const pagamentosOs = listarPagamentosOsEstrito(os, lancamentos)
  const pagamentosRegistrados = montarHistoricoPagamentosDocumento(pagamentosOs)
  logPagamentosDocumentoDev('os', os, pagamentosOs)
  const telCliente = formatarTelefoneCliente(cliente.telefone)
  const termos = obterTermosOficina(oficina.tipo_oficina)

  return {
    oficina: {
      nome: oficina.nome,
      nomeFantasia: oficina.nome_fantasia?.trim() || undefined,
      cnpj: oficina.cnpj?.trim() || undefined,
      enderecoLinhas: montarLinhasEnderecoOficina(oficina),
      contatoLinhas: montarLinhasContatoOficina(oficina),
      logoUrl: obterLogoOficinaDocumento(oficina),
    },
    os: {
      numero: os.numero,
      entrada: formatarData(obterDataEntradaOS(os)),
      previsao: os.data_previsao ? formatarData(os.data_previsao) : undefined,
      saida: (() => {
        const s = obterDataSaidaOS(os)
        return s ? formatarData(s) : undefined
      })(),
      abertura: formatarData(obterDataEntradaOS(os)),
      status: getLabelStatusOS(os.status),
      statusOrcamento: os.status_orcamento
        ? getLabelStatusOrcamento(os.status_orcamento)
        : undefined,
      responsavel: os.responsavel?.trim() || undefined,
      tituloDocumento: ehDocumentoOrcamento(os) ? 'Orçamento' : 'Ordem de Serviço',
      rotuloNumero: tituloDocumentoOS(os),
      ehOrcamento: ehDocumentoOrcamento(os),
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
      servicos: os.servicos_itens?.length
        ? os.servicos_itens.map((s) => ({
            nome: s.nome,
            descricao: s.descricao?.trim() || undefined,
            maoObra: formatarMoeda(s.valor_mao_obra),
          }))
        : os.servicos_executados?.trim()
          ? [{ nome: os.servicos_executados.trim(), maoObra: formatarMoeda(os.valor_mao_obra) }]
          : [],
      checklist: checklistVisivel ? checklist : [],
      checklistObservacoes: checklistEntrada.observacoes_gerais?.trim() || undefined,
      pecas: (os.pecas_utilizadas ?? []).map((p) => {
        const fmt = formatarLinhaPecaPdf({
          nome: p.nome,
          quantidade: p.quantidade,
          unidade: p.unidade,
          valor_unitario: p.valor_unitario,
          codigo: p.codigo,
          observacao: p.observacao,
        })
        return {
          nome: p.nome,
          codigo: p.codigo,
          linha: fmt.linha,
          subtotal: formatarMoeda(fmt.subtotal),
          observacao: p.observacao,
        }
      }),
      fotos: (os.fotos ?? []).map((f) => ({
        url: f.url,
        tipo: f.tipo === 'antes' ? 'Antes' : 'Depois',
        descricao: f.descricao,
      })),
    },
    valores: {
      pecas: formatarMoeda(resumoFinanceiro.totalPecasProdutos),
      maoObra: formatarMoeda(resumoFinanceiro.totalMaoDeObra),
      adicional: formatarMoeda(resumoFinanceiro.totalAdicionaisAprovados),
      desconto: formatarMoeda(resumoFinanceiro.totalDescontos),
      total: formatarMoeda(resumoFinanceiro.totalGeral),
      valorPago: formatarMoeda(resumoFinanceiro.valorPago),
      valorPendente: formatarMoeda(resumoFinanceiro.valorPendente),
      temAdicional: resumoFinanceiro.totalAdicionaisAprovados > 0,
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
    secaoVeiculoTitulo: termos.dadosVeiculo,
    pagamentosRegistrados,
  }
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
