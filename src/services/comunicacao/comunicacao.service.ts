import type { StatusOS } from '@/types/enums'
import type {
  HistoricoContato,
  ModeloMensagem,
  TipoMensagem,
  VariaveisMensagem,
} from '@/types/comunicacao'
import { getLabelTipoMensagem } from '@/types/comunicacao'
import { getLabelStatusOS } from '@/types/labels'
import { gerarId } from '@/lib/utils'
import { listarHistoricoLocal } from '@/services/comunicacao/comunicacao.storage'
import { persistirHistoricoComunicacao } from '@/services/comunicacao/comunicacao-sync.service'
import { resolverModelosMensagemOficina } from '@/services/comunicacao/mensagens-prontas.service'
import { substituirVariaveisMensagem } from '@/lib/substituir-variaveis-mensagem'
import type { ConfiguracaoOficina } from '@/types/oficina'

export { substituirVariaveisMensagem } from '@/lib/substituir-variaveis-mensagem'

export { COMUNICACAO_STORAGE_KEY } from '@/services/comunicacao/comunicacao.storage'

export const MODELOS_MENSAGEM_PADRAO: ModeloMensagem[] = [
  {
    tipo: 'moto_recebida',
    label: 'Veículo recebido na oficina',
    corpo:
      'Olá {{nome_cliente}}! 👋\n\n{{referencia_veiculo_destaque}} foi recebido(a) na *{{nome_oficina}}*.\n\nEm breve iniciaremos o diagnóstico.\nOS #{{numero_os}} — Status: {{status_os}}.',
  },
  {
    tipo: 'orcamento_aguardando',
    label: 'Orçamento aguardando aprovação',
    corpo:
      'Olá {{nome_cliente}}!\n\nO orçamento {{referencia_veiculo}} está pronto e aguarda sua aprovação.\n\nOS #{{numero_os}} — Valor: {{valor_os}}\n\n*{{nome_oficina}}*',
  },
  {
    tipo: 'orcamento_aprovado',
    label: 'Orçamento aprovado',
    corpo:
      'Olá {{nome_cliente}}!\n\nOrçamento aprovado {{referencia_veiculo}}.\n\nIniciaremos o serviço em breve.\nOS #{{numero_os}} — *{{nome_oficina}}*',
  },
  {
    tipo: 'moto_em_servico',
    label: 'Veículo em serviço',
    corpo:
      'Olá {{nome_cliente}}!\n\n{{referencia_veiculo_destaque}} está *em serviço* na *{{nome_oficina}}*.\n\nOS #{{numero_os}} — Status: {{status_os}}.',
  },
  {
    tipo: 'moto_aguardando_peca',
    label: 'Veículo aguardando peça',
    corpo:
      'Olá {{nome_cliente}}!\n\n{{referencia_veiculo_destaque}} está aguardando peça para continuidade do serviço.\n\nOS #{{numero_os}} — *{{nome_oficina}}*',
  },
  {
    tipo: 'moto_finalizada',
    label: 'Veículo finalizado',
    corpo:
      'Olá {{nome_cliente}}!\n\nBoas notícias! O serviço {{referencia_veiculo}} foi *finalizado*.\n\nOS #{{numero_os}} — *{{nome_oficina}}*',
  },
  {
    tipo: 'moto_pronta_retirada',
    label: 'Veículo pronto para retirada',
    corpo:
      'Olá {{nome_cliente}}!\n\n{{referencia_veiculo_destaque}} está *pronto(a) para retirada* na *{{nome_oficina}}*.\n\nOS #{{numero_os}} — Aguardamos você!',
  },
  {
    tipo: 'lembrete_revisao',
    label: 'Lembrete de revisão',
    corpo:
      'Olá {{nome_cliente}}. Aqui é da {{nome_oficina}}. Estamos passando para lembrar que está próximo o período de revisão {{referencia_veiculo}}. Podemos agendar um horário?',
  },
  {
    tipo: 'garantia_vencimento',
    label: 'Garantia próxima do vencimento',
    corpo:
      'Olá {{nome_cliente}}!\n\nA garantia do serviço {{referencia_veiculo}} vence em *{{data_garantia}}*.\n\nOS #{{numero_os}} — *{{nome_oficina}}*',
  },
  {
    tipo: 'envio_os',
    label: 'Envio de OS via WhatsApp',
    corpo: 'Ordem de Serviço #{{numero_os}} — {{nome_oficina}}',
  },
  {
    tipo: 'envio_orcamento',
    label: 'Envio de orçamento via WhatsApp',
    corpo: 'Orçamento #{{numero_os}} — {{nome_oficina}}',
  },
  {
    tipo: 'pos_atendimento',
    label: 'Pós-atendimento',
    corpo:
      'Olá {{nome_cliente}}!\n\nObrigado por confiar na *{{nome_oficina}}*! Passando para saber se está tudo bem com {{referencia_veiculo_destaque}} após o serviço.\n\nOS #{{numero_os}}',
  },
  {
    tipo: 'cobranca_pendencia',
    label: 'Cobrança / pendência',
    corpo:
      'Olá {{nome_cliente}}!\n\nIdentificamos uma pendência referente ao serviço {{referencia_veiculo}}.\n\nOS #{{numero_os}} — Valor: {{valor_os}}\n\n*{{nome_oficina}}*',
  },
]

/** @deprecated Use resolverModelosMensagemOficina */
export const MODELOS_MENSAGEM = MODELOS_MENSAGEM_PADRAO

export { limparHistoricoComunicacaoPorOffice } from '@/services/comunicacao/comunicacao.storage'

export function getModeloMensagem(
  tipo: TipoMensagem,
  configuracao?: ConfiguracaoOficina | null
): ModeloMensagem {
  return resolverModelosMensagemOficina(configuracao).find((m) => m.tipo === tipo) ?? MODELOS_MENSAGEM_PADRAO[0]
}

export function montarMensagem(
  tipo: TipoMensagem,
  vars: VariaveisMensagem,
  configuracao?: ConfiguracaoOficina | null
): string {
  if (tipo === 'personalizada') return ''
  const textoModelo = getModeloMensagem(tipo, configuracao).corpo
  return substituirVariaveisMensagem(textoModelo, vars)
}

export function sugerirTipoMensagem(
  status?: StatusOS,
  statusOrcamento?: string
): TipoMensagem {
  if (statusOrcamento === 'aprovado') return 'orcamento_aprovado'
  switch (status) {
    case 'recebida':
      return 'moto_recebida'
    case 'aguardando_aprovacao':
      return 'orcamento_aguardando'
    case 'em_servico':
    case 'em_diagnostico':
      return 'moto_em_servico'
    case 'aguardando_peca':
      return 'moto_aguardando_peca'
    case 'finalizada':
      return 'moto_finalizada'
    case 'entregue':
      return 'moto_pronta_retirada'
    default:
      return 'lembrete_revisao'
  }
}

export class ComunicacaoService {
  listarHistorico(officeId: string): HistoricoContato[] {
    return listarHistoricoLocal(officeId)
  }

  registrarContato(
    officeId: string,
    input: Omit<HistoricoContato, 'id' | 'office_id' | 'data' | 'status' | 'preview'> & {
      preview?: string
      mensagemCompleta?: string
      responsavel_nome?: string
    }
  ): HistoricoContato {
    const textoCompleto =
      input.mensagem_texto ?? (input.mensagemCompleta?.trim() || undefined)
    const registro: HistoricoContato = {
      id: gerarId(),
      office_id: officeId,
      data: new Date().toISOString(),
      status: 'enviado_manualmente',
      preview:
        input.preview ??
        textoCompleto?.slice(0, 120) ??
        getLabelTipoMensagem(input.tipo_mensagem),
      mensagem_texto: textoCompleto,
      responsavel_nome: input.responsavel_nome,
      cliente_id: input.cliente_id,
      cliente_nome: input.cliente_nome,
      tipo_mensagem: input.tipo_mensagem,
      ordem_servico_id: input.ordem_servico_id,
      ordem_servico_numero: input.ordem_servico_numero,
    }

    void persistirHistoricoComunicacao(officeId, registro)
    return registro
  }
}

export const comunicacaoService = new ComunicacaoService()

export { getLabelStatusOS }
