import {
  montarLinhasContatoOficina,
  montarLinhasEnderecoOficina,
} from '@/lib/oficina-format'
import { formatarData, formatarMoeda } from '@/lib/utils'
import { formatarDetalhePagamento, formatarPagamentoAVista } from '@/lib/pagamento-format'
import type { Cliente, LancamentoFinanceiro, Moto, Oficina, OrdemServico } from '@/types'

function resumirServicos(os: OrdemServico): string {
  const partes: string[] = []
  if (os.defeito_relatado?.trim()) {
    partes.push(os.defeito_relatado.trim())
  }
  if (os.servicos_executados?.trim()) {
    partes.push(os.servicos_executados.trim())
  }
  if (!partes.length && os.diagnostico?.trim()) {
    partes.push(os.diagnostico.trim())
  }
  const texto = partes.join(' — ')
  return texto.length > 280 ? `${texto.slice(0, 277)}...` : texto
}

export interface ReciboDocumentoViewModel {
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
  }
  cliente: {
    nome: string
  }
  moto: {
    marca: string
    modelo: string
    placa: string
  }
  pagamento: {
    valor: string
    forma: string
    parcelamento?: string
    pagamentoLabel?: string
    data: string
    observacao?: string
  }
  servicosResumo: string
  assinaturas: {
    clienteNome: string
    oficinaNome: string
  }
}

export function buildReciboDocumentoViewModel(
  os: OrdemServico,
  pagamento: LancamentoFinanceiro,
  cliente: Cliente,
  moto: Moto,
  oficina: Oficina
): ReciboDocumentoViewModel {
  const detalhe = formatarDetalhePagamento(pagamento)

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
    },
    cliente: {
      nome: cliente.nome,
    },
    moto: {
      marca: moto.marca,
      modelo: moto.modelo,
      placa: moto.placa,
    },
    pagamento: {
      valor: formatarMoeda(pagamento.valor),
      forma: detalhe.forma,
      parcelamento: detalhe.parcelamento,
      pagamentoLabel:
        pagamento.forma_pagamento === 'credito' && !detalhe.parcelamento
          ? formatarPagamentoAVista()
          : undefined,
      data: formatarData(pagamento.data),
      observacao: pagamento.observacao?.trim() || undefined,
    },
    servicosResumo: resumirServicos(os),
    assinaturas: {
      clienteNome: cliente.nome,
      oficinaNome: oficina.nome_fantasia?.trim() || oficina.nome,
    },
  }
}
