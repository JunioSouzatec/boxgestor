/**
 * F6B — Validação técnica pré-homologação Focus (sem chamada API).
 */

import { cadastroFiscalBasicoPreenchido, obterDadosFiscaisOficina, somenteDigitos } from '@/types/fiscal'
import {
  certificadoInformado,
  type FiscalConfigOficina,
} from '@/types/fiscal-config'
import { obterDadosFiscaisCliente } from '@/types/fiscal-cliente'
import { normalizarNcm } from '@/types/fiscal-produto'
import type { PreparacaoNotaFiscal } from '@/types/fiscal-preparacao'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { Cliente } from '@/types/cliente'
import type {
  FiscalValidacaoTecnicaResultado,
  ItemValidacaoTecnica,
} from '../fiscal-provider.types'
import type { FocusPayloadTecnico } from './focus.types'

function item(
  id: string,
  escopo: ItemValidacaoTecnica['escopo'],
  severidade: ItemValidacaoTecnica['severidade'],
  mensagem: string
): ItemValidacaoTecnica {
  return { id, escopo, severidade, mensagem }
}

export function validarFocusAntesDeEnviar(input: {
  payload: FocusPayloadTecnico
  preparacao: PreparacaoNotaFiscal
  fiscalConfig: FiscalConfigOficina
  configuracao?: ConfiguracaoOficina | null
  cliente?: Cliente | null
}): FiscalValidacaoTecnicaResultado {
  const { payload, preparacao, fiscalConfig, cliente } = input
  const oficina = obterDadosFiscaisOficina(input.configuracao)
  const bloqueios: ItemValidacaoTecnica[] = []
  const alertas: ItemValidacaoTecnica[] = []
  const informativos: ItemValidacaoTecnica[] = []

  informativos.push(
    item(
      'info-emissao',
      'geral',
      'informativo',
      'Emissão fiscal desativada nesta fase. Esta validação é apenas técnica/interna.'
    )
  )

  // --- Configuração ---
  if (fiscalConfig.provedor.nome !== 'focus_nfe') {
    bloqueios.push(
      item(
        'cfg-provedor',
        'config',
        'bloqueante',
        'Provedor precisa ser Focus NFe para esta prévia técnica.'
      )
    )
  }
  if (fiscalConfig.ambiente_desejado !== 'homologacao') {
    alertas.push(
      item(
        'cfg-ambiente',
        'config',
        'alerta',
        'Ambiente desejado não é Homologação. Produção só após testes em homologação.'
      )
    )
  }
  if (!certificadoInformado(fiscalConfig)) {
    bloqueios.push(
      item(
        'cfg-cert',
        'config',
        'bloqueante',
        'Certificado A1 precisa estar marcado como configurado fora do BoxGestor ou no provedor.'
      )
    )
  }
  if (!fiscalConfig.provedor.token_configurado) {
    bloqueios.push(
      item(
        'cfg-token',
        'config',
        'bloqueante',
        'Token precisa estar marcado como configurado (sem valor real salvo nesta fase).'
      )
    )
  }

  const precisaNfe =
    payload.tipo_documento_interno === 'nfe_futura' ||
    payload.tipo_documento_interno === 'mista_futura'
  const precisaNfce =
    payload.tipo_documento_interno === 'nfce_futura' ||
    payload.tipo_documento_interno === 'mista_futura'
  const precisaNfse =
    payload.tipo_documento_interno === 'nfse_futura' ||
    payload.tipo_documento_interno === 'mista_futura'

  if (precisaNfe && !fiscalConfig.tipos_documento.nfe_produtos && payload.produtos.length > 0) {
    alertas.push(
      item(
        'cfg-tipo-nfe',
        'config',
        'alerta',
        'Documento de produto sugerido, mas NF-e não está marcada nos tipos desejados.'
      )
    )
  }
  if (
    precisaNfce &&
    preparacao.origem === 'venda_balcao' &&
    !fiscalConfig.tipos_documento.nfce_venda_balcao &&
    !fiscalConfig.tipos_documento.nfe_produtos
  ) {
    alertas.push(
      item(
        'cfg-tipo-nfce',
        'config',
        'alerta',
        'Venda balcão sem NFC-e/NF-e marcados nos tipos de documento desejados.'
      )
    )
  }
  if (precisaNfse && !fiscalConfig.tipos_documento.nfse_servicos && payload.servicos.length > 0) {
    alertas.push(
      item(
        'cfg-tipo-nfse',
        'config',
        'alerta',
        'Há serviços, mas NFS-e não está marcada nos tipos desejados.'
      )
    )
  }

  // --- Oficina ---
  if (somenteDigitos(oficina.cnpj).length !== 14) {
    bloqueios.push(item('of-cnpj', 'oficina', 'bloqueante', 'Oficina sem CNPJ válido (14 dígitos).'))
  }
  if (!oficina.razao_social?.trim()) {
    bloqueios.push(item('of-razao', 'oficina', 'bloqueante', 'Oficina sem razão social.'))
  }
  if (!oficina.regime_tributario) {
    bloqueios.push(item('of-regime', 'oficina', 'bloqueante', 'Oficina sem regime tributário.'))
  }
  if (!oficina.endereco?.logradouro?.trim()) {
    bloqueios.push(item('of-end', 'oficina', 'bloqueante', 'Oficina sem endereço fiscal.'))
  }
  if (!oficina.endereco?.cidade?.trim() || !oficina.endereco?.uf?.trim()) {
    bloqueios.push(item('of-cidade', 'oficina', 'bloqueante', 'Oficina sem cidade/UF.'))
  }
  if (somenteDigitos(oficina.endereco?.cep).length !== 8) {
    bloqueios.push(item('of-cep', 'oficina', 'bloqueante', 'Oficina sem CEP válido.'))
  }
  if ((precisaNfe || precisaNfce) && !oficina.inscricao_estadual?.trim()) {
    alertas.push(
      item(
        'of-ie',
        'oficina',
        'alerta',
        'Inscrição estadual não informada (pode ser exigida para NF-e/NFC-e).'
      )
    )
  }
  if (precisaNfse && !oficina.inscricao_municipal?.trim()) {
    alertas.push(
      item(
        'of-im',
        'oficina',
        'alerta',
        'Inscrição municipal não informada (pode ser exigida para NFS-e).'
      )
    )
  }
  if (!cadastroFiscalBasicoPreenchido(oficina)) {
    alertas.push(
      item('of-basico', 'oficina', 'alerta', 'Cadastro fiscal básico da oficina incompleto.')
    )
  }

  // --- Cliente ---
  if (!preparacao.consumidor_nao_identificado) {
    if (!preparacao.cliente_nome?.trim() && !cliente?.nome?.trim()) {
      alertas.push(item('cli-nome', 'cliente', 'alerta', 'Cliente sem nome.'))
    }
    if (cliente) {
      const fc = obterDadosFiscaisCliente(cliente)
      const temDoc =
        somenteDigitos(fc.cpf).length === 11 || somenteDigitos(fc.cnpj).length === 14
      if (!temDoc && (precisaNfe || precisaNfse)) {
        alertas.push(
          item(
            'cli-doc',
            'cliente',
            'alerta',
            'Cliente sem CPF/CNPJ fiscal (pode ser necessário conforme o documento).'
          )
        )
      }
      if (
        (precisaNfe || precisaNfse) &&
        (!fc.endereco?.cidade?.trim() || !fc.endereco?.uf?.trim())
      ) {
        alertas.push(
          item('cli-end', 'cliente', 'alerta', 'Cliente sem cidade/UF fiscal.')
        )
      }
    } else if (!preparacao.consumidor_nao_identificado) {
      informativos.push(
        item(
          'cli-ctx',
          'cliente',
          'informativo',
          'Cliente não carregado no contexto da prévia — validação de documento limitada.'
        )
      )
    }
  } else {
    informativos.push(
      item(
        'cli-nao-id',
        'cliente',
        'informativo',
        'Consumidor não identificado — comum em NFC-e de balcão.'
      )
    )
  }

  // --- Produtos ---
  for (const p of payload.produtos) {
    const ref = p.referencia
    if (!p.descricao?.trim()) {
      bloqueios.push(
        item(`prod-desc-${ref}`, 'produto', 'bloqueante', `Produto sem descrição: ${ref}`)
      )
    }
    if (normalizarNcm(p.ncm).length !== 8) {
      bloqueios.push(
        item(`prod-ncm-${ref}`, 'produto', 'bloqueante', `Produto sem NCM (8 dígitos): ${p.descricao || ref}`)
      )
    }
    if (!p.cfop || String(p.cfop).replace(/\D/g, '').length !== 4) {
      alertas.push(
        item(`prod-cfop-${ref}`, 'produto', 'alerta', `Produto sem CFOP padrão: ${p.descricao || ref}`)
      )
    }
    if (!p.origem?.trim()) {
      alertas.push(
        item(`prod-origem-${ref}`, 'produto', 'alerta', `Produto sem origem: ${p.descricao || ref}`)
      )
    }
    if (!p.cst_csosn?.trim()) {
      alertas.push(
        item(`prod-cst-${ref}`, 'produto', 'alerta', `Produto sem CST/CSOSN: ${p.descricao || ref}`)
      )
    }
    if (!p.unidade?.trim()) {
      bloqueios.push(
        item(`prod-un-${ref}`, 'produto', 'bloqueante', `Produto sem unidade fiscal: ${p.descricao || ref}`)
      )
    }
    if (!(p.quantidade > 0) || !(p.valor_unitario >= 0)) {
      bloqueios.push(
        item(`prod-val-${ref}`, 'produto', 'bloqueante', `Produto com quantidade/valor inválido: ${p.descricao || ref}`)
      )
    }
  }

  // --- Serviços ---
  for (const s of payload.servicos) {
    const ref = s.referencia
    if (!s.descricao?.trim()) {
      bloqueios.push(
        item(`svc-desc-${ref}`, 'servico', 'bloqueante', `Serviço sem descrição: ${ref}`)
      )
    }
    if (!s.codigo_municipal?.trim()) {
      bloqueios.push(
        item(
          `svc-cod-${ref}`,
          'servico',
          'bloqueante',
          `Serviço sem código municipal: ${s.descricao || ref}`
        )
      )
    }
    if (!s.item_lc116?.trim()) {
      alertas.push(
        item(`svc-lc-${ref}`, 'servico', 'alerta', `Serviço sem item LC 116: ${s.descricao || ref}`)
      )
    }
    if (!s.municipio_prestacao?.trim()) {
      alertas.push(
        item(
          `svc-mun-${ref}`,
          'servico',
          'alerta',
          `Serviço sem município de prestação: ${s.descricao || ref}`
        )
      )
    }
    if (!s.exigibilidade_iss || s.exigibilidade_iss === 'nao_informado') {
      alertas.push(
        item(
          `svc-exig-${ref}`,
          'servico',
          'alerta',
          `Serviço sem exigibilidade ISS: ${s.descricao || ref}`
        )
      )
    }
  }

  if (payload.documentos_separados_sugeridos) {
    alertas.push(
      item(
        'doc-misto',
        'documento',
        'alerta',
        'Operação mista: confirme com o contador a emissão separada de NFS-e e NF-e/NFC-e.'
      )
    )
  }

  informativos.push(
    item(
      'info-api',
      'geral',
      'informativo',
      'Chamada externa à Focus permanece desativada. Nenhum dado será enviado nesta fase.'
    )
  )

  return {
    pronto_tecnicamente: bloqueios.length === 0,
    bloqueios,
    alertas,
    informativos,
  }
}
