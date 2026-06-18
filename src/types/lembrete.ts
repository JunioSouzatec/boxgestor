export type StatusLembrete =
  | 'pendente'
  | 'para_hoje'
  | 'vencido'
  | 'enviado'
  | 'concluido'
  | 'cancelado'
  | 'falha_envio'

/** Status persistido no lembrete (legado: contatado → enviado na migração). */
export type StatusFixoLembrete =
  | 'enviado'
  | 'concluido'
  | 'cancelado'
  | 'falha_envio'
  | 'contatado'

export type CanalComunicacaoLembrete =
  | 'whatsapp'
  | 'ligacao'
  | 'presencial'
  | 'sms'
  | 'email'
  | 'manual'

export type TipoAcaoLembrete =
  | 'envio'
  | 'contato'
  | 'conclusao'
  | 'cancelamento'
  | 'falha'
  | 'observacao'

export type ResultadoContatoLembrete =
  | 'enviado'
  | 'sem_resposta'
  | 'cliente_respondeu'
  | 'agendado'
  | 'nao_quis'
  | 'falha'

export type CategoriaRegraLembrete =
  | 'lubrificacao'
  | 'revisao'
  | 'freios'
  | 'transmissao'
  | 'pneus'
  | 'eletrica'
  | 'geral'

export const CATEGORIAS_REGRA: { value: CategoriaRegraLembrete; label: string }[] = [
  { value: 'lubrificacao', label: 'Lubrificação' },
  { value: 'revisao', label: 'Revisão' },
  { value: 'freios', label: 'Freios' },
  { value: 'transmissao', label: 'Transmissão' },
  { value: 'pneus', label: 'Pneus' },
  { value: 'eletrica', label: 'Elétrica' },
  { value: 'geral', label: 'Geral' },
]

export function getLabelCategoriaRegra(categoria: string): string {
  return CATEGORIAS_REGRA.find((c) => c.value === categoria)?.label ?? categoria
}

export interface RegraLembrete {
  id: string
  office_id: string
  nome_regra: string
  servico_relacionado: string
  categoria: CategoriaRegraLembrete | string
  prazo_dias: number
  prazo_meses: number
  km_retorno?: number
  mensagem_padrao: string
  observacoes_internas?: string
  ativo: boolean
  created_at: string
  updated_at: string
}

export type RegraLembreteInput = Omit<
  RegraLembrete,
  'id' | 'office_id' | 'created_at' | 'updated_at'
>

/** @deprecated Use RegistroHistoricoLembrete — mantido para migração. */
export interface HistoricoContatoLembrete {
  data: string
  tipo: 'whatsapp_manual'
  servico: string
  observacao?: string
}

export interface RegistroHistoricoLembrete {
  id: string
  data: string
  tipo_acao: TipoAcaoLembrete
  canal: CanalComunicacaoLembrete
  mensagem?: string
  resultado?: ResultadoContatoLembrete
  responsavel: string
  status_apos: StatusLembrete
  observacao?: string
}

export interface HistoricoComunicacaoItem {
  id: string
  lembrete_id: string
  cliente_id: string
  moto_id: string
  ordem_servico_id?: string
  ordem_servico_numero?: number
  servico: string
  registro: RegistroHistoricoLembrete
}

export interface LembreteCliente {
  id: string
  office_id: string
  cliente_id: string
  moto_id: string
  ordem_servico_id?: string
  ordem_servico_numero?: number
  regra_id?: string
  servico: string
  data_prevista: string
  km_prevista?: number
  km_base?: number
  mensagem: string
  observacoes?: string
  personalizado?: boolean
  /** Persistido; demais status são calculados pela data. */
  status_fixo?: StatusFixoLembrete
  created_at: string
  /** Legado — migrado para historico[]. */
  contato?: HistoricoContatoLembrete
  historico?: RegistroHistoricoLembrete[]
  /** Quem criou o lembrete (manual ou automático). */
  criado_por_id?: string
  criado_por_nome?: string
  /** true = gerado pela OS/regra automática */
  automatico?: boolean
  updated_at?: string
}

export type LembreteClienteInput = Omit<
  LembreteCliente,
  'id' | 'office_id' | 'created_at' | 'contato' | 'status_fixo' | 'historico'
>

export interface LembreteComStatus extends LembreteCliente {
  status: StatusLembrete
}

export interface LembreteRegraOverride {
  regra_id: string
  servico?: string
  data_prevista?: string
  km_prevista?: number
  mensagem?: string
  observacoes?: string
}

export interface LembretePersonalizadoInput {
  servico: string
  data_prevista: string
  km_prevista?: number
  mensagem: string
  observacoes?: string
}

export interface AtualizarLembreteInput {
  servico?: string
  data_prevista?: string
  km_prevista?: number
  mensagem?: string
  observacoes?: string
  status?: StatusLembrete
  responsavel?: string
}

export interface RegistrarContatoLembreteInput {
  canal: CanalComunicacaoLembrete
  mensagem?: string
  resultado: ResultadoContatoLembrete
  data_hora?: string
  responsavel: string
  observacao?: string
  tipo_acao?: TipoAcaoLembrete
}

export interface ResumoLembretes {
  vencidos: LembreteComStatus[]
  paraHoje: LembreteComStatus[]
  proximos7Dias: LembreteComStatus[]
  contatarHoje: LembreteComStatus[]
  totalPendentes: number
  totalAlerta: number
}

export type FiltroListaLembrete =
  | 'pendentes'
  | 'para_hoje'
  | 'vencidos'
  | 'enviados'
  | 'concluidos'
  | 'cancelados'
  | 'todos'

export const STATUS_LEMBRETE: { value: StatusLembrete; label: string }[] = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'para_hoje', label: 'Para hoje' },
  { value: 'vencido', label: 'Vencido' },
  { value: 'enviado', label: 'Enviado' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'cancelado', label: 'Cancelado' },
  { value: 'falha_envio', label: 'Falha no envio' },
]

export const CANAIS_COMUNICACAO: { value: CanalComunicacaoLembrete; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'ligacao', label: 'Ligação' },
  { value: 'presencial', label: 'Presencial' },
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'E-mail' },
  { value: 'manual', label: 'Manual' },
]

export const RESULTADOS_CONTATO: { value: ResultadoContatoLembrete; label: string }[] = [
  { value: 'enviado', label: 'Enviado' },
  { value: 'sem_resposta', label: 'Sem resposta' },
  { value: 'cliente_respondeu', label: 'Cliente respondeu' },
  { value: 'agendado', label: 'Agendado' },
  { value: 'nao_quis', label: 'Não quis' },
  { value: 'falha', label: 'Falha' },
]

export function getLabelStatusLembrete(status: StatusLembrete): string {
  return STATUS_LEMBRETE.find((s) => s.value === status)?.label ?? status
}

export function getLabelCanalComunicacao(canal: CanalComunicacaoLembrete): string {
  return CANAIS_COMUNICACAO.find((c) => c.value === canal)?.label ?? canal
}

export function getLabelResultadoContato(resultado: ResultadoContatoLembrete): string {
  return RESULTADOS_CONTATO.find((r) => r.value === resultado)?.label ?? resultado
}

export function lembreteStatusRequerAcao(status: StatusLembrete): boolean {
  return status === 'pendente' || status === 'para_hoje' || status === 'vencido'
}

export function lembreteStatusEncerrado(status: StatusLembrete): boolean {
  return status === 'concluido' || status === 'cancelado'
}

export function obterUltimaAcaoLembrete(lembrete: LembreteCliente): RegistroHistoricoLembrete | undefined {
  const historico = lembrete.historico ?? []
  if (!historico.length) return undefined
  return [...historico].sort((a, b) => b.data.localeCompare(a.data))[0]
}

export function obterLabelUltimaAcao(lembrete: LembreteCliente): string {
  const ultima = obterUltimaAcaoLembrete(lembrete)
  if (!ultima) return '—'
  const canal = getLabelCanalComunicacao(ultima.canal)
  const resultado = ultima.resultado ? getLabelResultadoContato(ultima.resultado) : ''
  return resultado ? `${canal} · ${resultado}` : canal
}
