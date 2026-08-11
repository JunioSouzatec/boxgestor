/**
 * F6B — Montagem de payload técnico Focus a partir da preparação (em memória).
 * Não chama API. Não gera XML/DANFE/chave/protocolo/número oficial.
 */

import { obterDadosFiscaisCliente } from '@/types/fiscal-cliente'
import { obterDadosFiscaisOficina, somenteDigitos } from '@/types/fiscal'
import type { FiscalConfigOficina } from '@/types/fiscal-config'
import type { PreparacaoNotaFiscal } from '@/types/fiscal-preparacao'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { Cliente } from '@/types/cliente'
import type {
  FocusDocumentoInterno,
  FocusPayloadTecnico,
} from './focus.types'

function resolverTipoDocumento(
  preparacao: PreparacaoNotaFiscal,
  cfg: FiscalConfigOficina
): { tipo: FocusDocumentoInterno; label: string; separados: boolean; avisos: string[] } {
  const avisos: string[] = []
  if (preparacao.tipo_sugerido === 'misto_servico_produto') {
    avisos.push(
      'OS mista: pode exigir documentos fiscais separados (NFS-e para serviços e NF-e/NFC-e para produtos).'
    )
    if (cfg.tipos_documento.os_mista_separada) {
      avisos.push('Configuração indica que OS mista deve ser tratada com documentos separados.')
    }
    return {
      tipo: 'mista_futura',
      label: 'Mista futura (produto + serviço)',
      separados: true,
      avisos,
    }
  }

  if (preparacao.tipo_sugerido === 'nfs_e') {
    return {
      tipo: 'nfse_futura',
      label: 'NFS-e futura',
      separados: false,
      avisos,
    }
  }

  // Produtos (venda balcão / OS só produtos): NFC-e se marcado, senão NF-e, senão NFC-e padrão balcão
  if (preparacao.origem === 'venda_balcao') {
    if (cfg.tipos_documento.nfce_venda_balcao) {
      return { tipo: 'nfce_futura', label: 'NFC-e futura', separados: false, avisos }
    }
    if (cfg.tipos_documento.nfe_produtos) {
      return { tipo: 'nfe_futura', label: 'NF-e futura', separados: false, avisos }
    }
    return { tipo: 'nfce_futura', label: 'NFC-e futura (orientação)', separados: false, avisos }
  }

  if (cfg.tipos_documento.nfe_produtos) {
    return { tipo: 'nfe_futura', label: 'NF-e futura', separados: false, avisos }
  }
  if (cfg.tipos_documento.nfce_venda_balcao) {
    return { tipo: 'nfce_futura', label: 'NFC-e futura', separados: false, avisos }
  }
  return { tipo: 'nfe_futura', label: 'NF-e futura (orientação)', separados: false, avisos }
}

function referenciaInterna(preparacao: PreparacaoNotaFiscal): string {
  if (preparacao.origem === 'venda_balcao') {
    return `counter-sale:${preparacao.origem_id}`
  }
  return `service-order:${preparacao.origem_id}`
}

export function buildFocusPayloadFromPreparation(input: {
  preparacao: PreparacaoNotaFiscal
  configuracao?: ConfiguracaoOficina | null
  fiscalConfig: FiscalConfigOficina
  cliente?: Cliente | null
}): FocusPayloadTecnico {
  const { preparacao, fiscalConfig, cliente } = input
  const oficina = obterDadosFiscaisOficina(input.configuracao)
  const fiscalCliente = cliente ? obterDadosFiscaisCliente(cliente) : null
  const tipo = resolverTipoDocumento(preparacao, fiscalConfig)

  const tiposDesejados: string[] = []
  if (fiscalConfig.tipos_documento.nfe_produtos) tiposDesejados.push('NF-e')
  if (fiscalConfig.tipos_documento.nfce_venda_balcao) tiposDesejados.push('NFC-e')
  if (fiscalConfig.tipos_documento.nfse_servicos) tiposDesejados.push('NFS-e')

  const totalProdutos = preparacao.produtos.reduce((a, p) => a + (p.valor_total || 0), 0)
  const totalServicos = preparacao.servicos.reduce((a, s) => a + (s.valor || 0), 0)

  return {
    schema: 'boxgestor.focus.payload.v1',
    provedor: 'focus_nfe',
    emissao_status: 'desativada',
    chamada_externa: 'desativada',
    ambiente_desejado: fiscalConfig.ambiente_desejado,
    tipo_documento_interno: tipo.tipo,
    tipo_documento_label: tipo.label,
    origem: preparacao.origem,
    referencia_interna: referenciaInterna(preparacao),
    origem_label: preparacao.origem_label,
    gerado_em: new Date().toISOString(),
    documentos_separados_sugeridos: tipo.separados,
    avisos_documento: tipo.avisos,
    emitente: {
      cnpj: somenteDigitos(oficina.cnpj) || undefined,
      razao_social: oficina.razao_social || undefined,
      nome_fantasia: oficina.nome_fantasia || undefined,
      inscricao_estadual: oficina.inscricao_estadual || undefined,
      inscricao_municipal: oficina.inscricao_municipal || undefined,
      regime_tributario: oficina.regime_tributario || undefined,
      email: oficina.email_fiscal || undefined,
      telefone: oficina.telefone_fiscal || undefined,
      endereco: {
        logradouro: oficina.endereco?.logradouro || undefined,
        numero: oficina.endereco?.numero || undefined,
        complemento: oficina.endereco?.complemento || undefined,
        bairro: oficina.endereco?.bairro || undefined,
        cidade: oficina.endereco?.cidade || undefined,
        uf: oficina.endereco?.uf || undefined,
        cep: somenteDigitos(oficina.endereco?.cep) || undefined,
        codigo_municipio_ibge: oficina.endereco?.codigo_municipio_ibge || undefined,
      },
    },
    destinatario: {
      nome: preparacao.cliente_nome || fiscalCliente?.razao_social || cliente?.nome || undefined,
      cpf: fiscalCliente ? somenteDigitos(fiscalCliente.cpf) || undefined : undefined,
      cnpj: fiscalCliente ? somenteDigitos(fiscalCliente.cnpj) || undefined : undefined,
      consumidor_nao_identificado: preparacao.consumidor_nao_identificado,
      endereco: fiscalCliente?.endereco
        ? {
            logradouro: fiscalCliente.endereco.logradouro || undefined,
            numero: fiscalCliente.endereco.numero || undefined,
            bairro: fiscalCliente.endereco.bairro || undefined,
            cidade: fiscalCliente.endereco.cidade || undefined,
            uf: fiscalCliente.endereco.uf || undefined,
            cep: somenteDigitos(fiscalCliente.endereco.cep) || undefined,
          }
        : undefined,
    },
    produtos: preparacao.produtos.map((p) => ({
      referencia: p.chave,
      descricao: (p.descricao_fiscal || p.nome || '').trim(),
      quantidade: p.quantidade,
      valor_unitario: p.valor_unitario,
      valor_total: p.valor_total,
      ncm: p.ncm || undefined,
      cfop: p.cfop_padrao_venda || undefined,
      origem: p.origem_mercadoria || undefined,
      cst_csosn: p.cst_csosn || undefined,
      unidade: p.unidade_fiscal || undefined,
      ean: p.ean || undefined,
    })),
    servicos: preparacao.servicos.map((s) => ({
      referencia: s.chave,
      descricao: (s.descricao_fiscal || s.nome || '').trim(),
      valor: s.valor,
      quantidade: s.quantidade,
      codigo_municipal: s.codigo_municipal_servico || undefined,
      item_lc116: s.item_lista_servico_lc116 || undefined,
      codigo_tributacao_municipal: s.codigo_tributacao_municipal || undefined,
      municipio_prestacao: s.municipio_prestacao_padrao || undefined,
      exigibilidade_iss: s.exigibilidade_iss || undefined,
      aliquota_iss_informada: s.aliquota_iss_informada ?? null,
    })),
    pagamento: {
      forma: preparacao.forma_pagamento,
      status_label: preparacao.status_financeiro_label,
      pagamento_pendente: preparacao.pagamento_pendente,
      valor_total: preparacao.valor_total,
      desconto: preparacao.desconto,
    },
    totais: {
      produtos: totalProdutos,
      servicos: totalServicos,
      geral: preparacao.valor_total,
    },
    series_informativas: {
      nfe_serie: fiscalConfig.series.nfe_serie || undefined,
      nfce_serie: fiscalConfig.series.nfce_serie || undefined,
      nfse_serie: fiscalConfig.series.nfse_serie || undefined,
    },
    meta: {
      token_configurado: fiscalConfig.provedor.token_configurado,
      certificado_status: fiscalConfig.certificado.status,
      empresa_id_informado: Boolean(fiscalConfig.provedor.empresa_id?.trim()),
      tipos_documento_desejados: tiposDesejados,
    },
  }
}
