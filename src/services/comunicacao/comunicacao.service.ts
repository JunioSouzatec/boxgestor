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

export const COMUNICACAO_STORAGE_KEY = 'craft_comunicacao_v1'

export const MODELOS_MENSAGEM: ModeloMensagem[] = [
  {
    tipo: 'moto_recebida',
    label: 'Moto recebida na oficina',
    corpo:
      'Olá {{nome_cliente}}! 👋\n\nSua moto *{{moto}}* (placa *{{placa}}*) foi recebida na *{{nome_oficina}}*.\n\nEm breve iniciaremos o diagnóstico.\nOS #{{numero_os}} — Status: {{status_os}}.',
  },
  {
    tipo: 'orcamento_aguardando',
    label: 'Orçamento aguardando aprovação',
    corpo:
      'Olá {{nome_cliente}}!\n\nO orçamento da sua moto *{{moto}}* (placa *{{placa}}*) está pronto e aguarda sua aprovação.\n\nOS #{{numero_os}} — Valor: {{valor_os}}\n\n*{{nome_oficina}}*',
  },
  {
    tipo: 'orcamento_aprovado',
    label: 'Orçamento aprovado',
    corpo:
      'Olá {{nome_cliente}}!\n\nOrçamento aprovado para a moto *{{moto}}* (placa *{{placa}}*).\n\nIniciaremos o serviço em breve.\nOS #{{numero_os}} — *{{nome_oficina}}*',
  },
  {
    tipo: 'moto_em_servico',
    label: 'Moto em serviço',
    corpo:
      'Olá {{nome_cliente}}!\n\nSua moto *{{moto}}* (placa *{{placa}}*) está *em serviço* na *{{nome_oficina}}*.\n\nOS #{{numero_os}} — Status: {{status_os}}.',
  },
  {
    tipo: 'moto_aguardando_peca',
    label: 'Moto aguardando peça',
    corpo:
      'Olá {{nome_cliente}}!\n\nSua moto *{{moto}}* (placa *{{placa}}*) está aguardando peça para continuidade do serviço.\n\nOS #{{numero_os}} — *{{nome_oficina}}*',
  },
  {
    tipo: 'moto_finalizada',
    label: 'Moto finalizada',
    corpo:
      'Olá {{nome_cliente}}!\n\nBoas notícias! O serviço da sua moto *{{moto}}* (placa *{{placa}}*) foi *finalizado*.\n\nOS #{{numero_os}} — *{{nome_oficina}}*',
  },
  {
    tipo: 'moto_pronta_retirada',
    label: 'Moto pronta para retirada',
    corpo:
      'Olá {{nome_cliente}}! 🏍️\n\nSua moto *{{moto}}* (placa *{{placa}}*) está *pronta para retirada* na *{{nome_oficina}}*.\n\nOS #{{numero_os}} — Aguardamos você!',
  },
  {
    tipo: 'lembrete_revisao',
    label: 'Lembrete de revisão',
    corpo:
      'Olá {{nome_cliente}}!\n\nPassando para lembrar da revisão periódica da sua moto *{{moto}}* (placa *{{placa}}*).\n\nAgende conosco: *{{nome_oficina}}*',
  },
  {
    tipo: 'garantia_vencimento',
    label: 'Garantia próxima do vencimento',
    corpo:
      'Olá {{nome_cliente}}!\n\nA garantia do serviço da moto *{{moto}}* (placa *{{placa}}*) vence em *{{data_garantia}}*.\n\nOS #{{numero_os}} — *{{nome_oficina}}*',
  },
]

interface ComunicacaoStore {
  version: 1
  historico: Record<string, HistoricoContato[]>
}

function loadStore(): ComunicacaoStore {
  try {
    const raw = localStorage.getItem(COMUNICACAO_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as ComunicacaoStore
  } catch {
    /* seed */
  }
  return { version: 1, historico: {} }
}

function saveStore(store: ComunicacaoStore): void {
  localStorage.setItem(COMUNICACAO_STORAGE_KEY, JSON.stringify(store))
}

export function getModeloMensagem(tipo: TipoMensagem): ModeloMensagem {
  return MODELOS_MENSAGEM.find((m) => m.tipo === tipo) ?? MODELOS_MENSAGEM[0]
}

export function montarMensagem(tipo: TipoMensagem, vars: VariaveisMensagem): string {
  let texto = getModeloMensagem(tipo).corpo
  const mapa: Record<string, string> = {
    '{{nome_cliente}}': vars.nome_cliente,
    '{{moto}}': vars.moto,
    '{{placa}}': vars.placa,
    '{{status_os}}': vars.status_os,
    '{{nome_oficina}}': vars.nome_oficina,
    '{{numero_os}}': vars.numero_os,
    '{{valor_os}}': vars.valor_os ?? '—',
    '{{data_garantia}}': vars.data_garantia ?? '—',
  }
  for (const [chave, valor] of Object.entries(mapa)) {
    texto = texto.replaceAll(chave, valor)
  }
  return texto
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
    const store = loadStore()
    return (store.historico[officeId] ?? []).sort((a, b) => b.data.localeCompare(a.data))
  }

  registrarContato(
    officeId: string,
    input: Omit<HistoricoContato, 'id' | 'office_id' | 'data' | 'status' | 'preview'> & {
      preview?: string
      mensagemCompleta?: string
    }
  ): HistoricoContato {
    const store = loadStore()
    const registro: HistoricoContato = {
      id: gerarId(),
      office_id: officeId,
      data: new Date().toISOString(),
      status: 'enviado_manualmente',
      preview:
        input.preview ??
        input.mensagemCompleta?.slice(0, 120) ??
        getLabelTipoMensagem(input.tipo_mensagem),
      cliente_id: input.cliente_id,
      cliente_nome: input.cliente_nome,
      tipo_mensagem: input.tipo_mensagem,
      ordem_servico_id: input.ordem_servico_id,
      ordem_servico_numero: input.ordem_servico_numero,
    }

    if (!store.historico[officeId]) store.historico[officeId] = []
    store.historico[officeId].unshift(registro)
    saveStore(store)
    return registro
  }
}

export const comunicacaoService = new ComunicacaoService()

export { getLabelStatusOS }
