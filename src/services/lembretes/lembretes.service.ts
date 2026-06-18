import type { Moto, OrdemServico } from '@/types'
import type {
  AtualizarLembreteInput,
  HistoricoComunicacaoItem,
  HistoricoContatoLembrete,
  LembreteCliente,
  LembreteComStatus,
  LembretePersonalizadoInput,
  LembreteRegraOverride,
  RegistrarContatoLembreteInput,
  RegistroHistoricoLembrete,
  RegraLembrete,
  RegraLembreteInput,
  ResumoLembretes,
  ResultadoContatoLembrete,
  StatusFixoLembrete,
  StatusLembrete,
} from '@/types/lembrete'
import { lembreteStatusRequerAcao } from '@/types/lembrete'
import { gerarId } from '@/lib/utils'
import { agendarSincronizacaoLembretes } from '@/services/lembretes/lembretes-sync.service'
import {
  aplicarResponsavelCriacao,
  type ResponsavelLembrete,
} from '@/services/lembretes/lembretes-responsavel'
import {
  compararDatasLocais,
  diasEntreDatasLocais,
  formatarDataLocalYYYYMMDD,
  getDataLocalHoje,
  parseDataLocal,
} from '@/lib/data-local'

export const LEMBRETES_STORAGE_KEY = 'craft_lembretes_v1'

interface LembretesOfficeStore {
  regras: RegraLembrete[]
  lembretes: LembreteCliente[]
}

interface LembretesStore {
  version: 1
  offices: Record<string, LembretesOfficeStore>
}

/** Formato legado antes da expansão de campos */
type RegraLegada = Partial<RegraLembrete> & {
  nome_servico?: string
  km_estimada?: number
}

export const REGRAS_PADRAO: Omit<RegraLembreteInput, 'ativo'>[] = [
  {
    nome_regra: 'Troca de óleo',
    servico_relacionado: 'Troca de óleo',
    categoria: 'lubrificacao',
    prazo_dias: 90,
    prazo_meses: 0,
    km_retorno: 3000,
    mensagem_padrao:
      'Olá {{nome_cliente}}! Passando para lembrar da troca de óleo da sua moto {{moto}} (placa {{placa}}). Previsão: {{data_prevista}} ou {{km_prevista}}. {{nome_oficina}}',
    observacoes_internas: 'Padrão: 90 dias ou 3.000 km',
  },
  {
    nome_regra: 'Revisão geral',
    servico_relacionado: 'Revisão geral',
    categoria: 'revisao',
    prazo_dias: 180,
    prazo_meses: 0,
    mensagem_padrao:
      'Olá {{nome_cliente}}! Está na hora da revisão geral da moto {{moto}} (placa {{placa}}). Agende conosco: {{nome_oficina}}',
    observacoes_internas: 'Revisão completa semestral',
  },
  {
    nome_regra: 'Pastilha de freio',
    servico_relacionado: 'Pastilha de freio',
    categoria: 'freios',
    prazo_dias: 90,
    prazo_meses: 0,
    mensagem_padrao:
      'Olá {{nome_cliente}}! Lembrete de revisão dos freios da moto {{moto}} (placa {{placa}}). Previsão: {{data_prevista}}. {{nome_oficina}}',
    observacoes_internas: 'Ajustar conforme desgaste observado na OS',
  },
  {
    nome_regra: 'Relação',
    servico_relacionado: 'Relação',
    categoria: 'transmissao',
    prazo_dias: 180,
    prazo_meses: 0,
    mensagem_padrao:
      'Olá {{nome_cliente}}! Lembrete de revisão da relação da moto {{moto}} (placa {{placa}}). Previsão: {{data_prevista}}. {{nome_oficina}}',
  },
  {
    nome_regra: 'Pneu',
    servico_relacionado: 'Pneu',
    categoria: 'pneus',
    prazo_dias: 0,
    prazo_meses: 12,
    mensagem_padrao:
      'Olá {{nome_cliente}}! Hora de verificar os pneus da moto {{moto}} (placa {{placa}}). {{nome_oficina}}',
    observacoes_internas: 'Verificar calibragem e desgaste',
  },
  {
    nome_regra: 'Bateria',
    servico_relacionado: 'Bateria',
    categoria: 'eletrica',
    prazo_dias: 0,
    prazo_meses: 12,
    mensagem_padrao:
      'Olá {{nome_cliente}}! Está na hora de verificar a bateria da moto {{moto}} (placa {{placa}}). {{nome_oficina}}',
  },
]

function formatarDataLocal(d: Date): string {
  return formatarDataLocalYYYYMMDD(d)
}

function diasEntre(inicio: string, fim: string): number {
  return diasEntreDatasLocais(inicio, fim)
}

function normalizarRegra(raw: RegraLegada): RegraLembrete {
  const nome = raw.nome_regra ?? raw.nome_servico ?? 'Regra'
  return {
    id: raw.id!,
    office_id: raw.office_id!,
    nome_regra: nome,
    servico_relacionado: raw.servico_relacionado ?? raw.nome_servico ?? nome,
    categoria: raw.categoria ?? 'geral',
    prazo_dias: raw.prazo_dias ?? 90,
    prazo_meses: raw.prazo_meses ?? 0,
    km_retorno: raw.km_retorno ?? raw.km_estimada,
    mensagem_padrao: raw.mensagem_padrao ?? '',
    observacoes_internas: raw.observacoes_internas ?? '',
    ativo: raw.ativo ?? true,
    created_at: raw.created_at!,
    updated_at: raw.updated_at!,
  }
}

function normalizarStatusFixo(status?: StatusFixoLembrete): StatusFixoLembrete | undefined {
  if (!status) return undefined
  if (status === 'contatado') return 'enviado'
  return status
}

function statusPorResultado(resultado: ResultadoContatoLembrete): StatusFixoLembrete {
  switch (resultado) {
    case 'enviado':
    case 'sem_resposta':
      return 'enviado'
    case 'cliente_respondeu':
    case 'agendado':
    case 'nao_quis':
      return 'concluido'
    case 'falha':
      return 'falha_envio'
    default:
      return 'enviado'
  }
}

function statusFixoParaStatus(statusFixo: StatusFixoLembrete): StatusLembrete {
  const normalizado = normalizarStatusFixo(statusFixo)
  if (!normalizado) return 'pendente'
  if (normalizado === 'contatado') return 'enviado'
  return normalizado
}

function migrarLembrete(lembrete: LembreteCliente): LembreteCliente {
  const historico = [...(lembrete.historico ?? [])]
  const statusFixo = normalizarStatusFixo(lembrete.status_fixo)

  if (lembrete.contato) {
    const jaMigrado = historico.some(
      (h) => h.data === lembrete.contato!.data && h.canal === 'whatsapp'
    )
    if (!jaMigrado) {
      historico.push({
        id: gerarId(),
        data: lembrete.contato.data,
        tipo_acao: 'envio',
        canal: 'whatsapp',
        mensagem: lembrete.mensagem,
        resultado: 'enviado',
        responsavel: 'Sistema',
        status_apos: 'enviado',
        observacao: lembrete.contato.observacao,
      })
    }
  }

  return {
    ...lembrete,
    status_fixo: statusFixo,
    historico: historico.sort((a, b) => a.data.localeCompare(b.data)),
  }
}

function loadStore(): LembretesStore {
  try {
    const raw = localStorage.getItem(LEMBRETES_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as LembretesStore
  } catch {
    /* seed */
  }
  return { version: 1, offices: {} }
}

function saveStore(store: LembretesStore, officeIdAfetado?: string): void {
  localStorage.setItem(LEMBRETES_STORAGE_KEY, JSON.stringify(store))
  if (officeIdAfetado) {
    agendarSincronizacaoLembretes(officeIdAfetado)
  }
}

export function obterDadosOfficeLembretes(officeId: string): {
  regras: RegraLembrete[]
  lembretes: LembreteCliente[]
} {
  const store = loadStore()
  const office = store.offices[officeId]
  if (!office) return { regras: [], lembretes: [] }
  return { regras: office.regras, lembretes: office.lembretes }
}

export function salvarDadosOfficeLembretesSemSync(
  officeId: string,
  dados: { regras: RegraLembrete[]; lembretes: LembreteCliente[] }
): void {
  const store = loadStore()
  if (!store.offices[officeId]) {
    store.offices[officeId] = { regras: [], lembretes: [] }
  }
  store.offices[officeId].regras = dados.regras
  store.offices[officeId].lembretes = dados.lembretes
  localStorage.setItem(LEMBRETES_STORAGE_KEY, JSON.stringify(store))
}

/** Remove lembretes gerados (mantém regras de configuração). */
export function limparLembretesOperacionaisPorOffice(officeId: string): void {
  const store = loadStore()
  if (store.offices[officeId]) {
    store.offices[officeId].lembretes = []
    saveStore(store, officeId)
  }
}

function getOfficeStore(store: LembretesStore, officeId: string): LembretesOfficeStore {
  if (!store.offices[officeId]) {
    const agora = new Date().toISOString()
    store.offices[officeId] = {
      regras: REGRAS_PADRAO.map((r) => ({
        ...r,
        id: gerarId(),
        office_id: officeId,
        ativo: true,
        created_at: agora,
        updated_at: agora,
      })),
      lembretes: [],
    }
    saveStore(store, officeId)
  } else {
    store.offices[officeId].regras = store.offices[officeId].regras.map(normalizarRegra)
    const migrados = store.offices[officeId].lembretes.map(migrarLembrete)
    const mudou = migrados.some((l, i) => l !== store.offices[officeId].lembretes[i])
    store.offices[officeId].lembretes = migrados
    if (mudou) saveStore(store, officeId)
  }
  return store.offices[officeId]
}

export function calcularStatusLembrete(
  lembrete: LembreteCliente,
  hoje = getDataLocalHoje()
): StatusLembrete {
  if (lembrete.status_fixo) {
    return statusFixoParaStatus(lembrete.status_fixo)
  }

  const cmp = compararDatasLocais(lembrete.data_prevista, hoje)
  if (cmp < 0) return 'vencido'
  if (cmp === 0) return 'para_hoje'
  return 'pendente'
}

export function enriquecerLembrete(
  lembrete: LembreteCliente,
  hoje?: string
): LembreteComStatus {
  return { ...lembrete, status: calcularStatusLembrete(lembrete, hoje) }
}

export function montarMensagemLembrete(
  template: string,
  vars: Record<string, string>
): string {
  let texto = template
  for (const [chave, valor] of Object.entries(vars)) {
    texto = texto.replaceAll(`{{${chave}}}`, valor)
  }
  return texto
}

export function montarMensagemLembretePadrao(
  clienteNome: string,
  moto: Moto,
  servico: string,
  nomeOficina: string,
  situacao: 'proxima' | 'vencida' = 'proxima'
): string {
  const motoLabel = `${moto.marca} ${moto.modelo}`.trim()
  const situacaoTexto =
    situacao === 'vencida'
      ? 'está com revisão vencida'
      : 'está com revisão próxima/vencida'
  return `Olá, ${clienteNome}. Aqui é da ${nomeOficina}. Estamos lembrando que sua moto ${motoLabel} (${moto.placa}) ${situacaoTexto} — ${servico}. Podemos agendar?`
}

export function montarVarsLembrete(
  clienteNome: string,
  moto: Moto,
  servico: string,
  dataPrevista: string,
  kmPrevista: number | undefined,
  nomeOficina: string
): Record<string, string> {
  return {
    nome_cliente: clienteNome,
    moto: `${moto.marca} ${moto.modelo}`,
    placa: moto.placa,
    data_prevista: dataPrevista,
    km_prevista: kmPrevista ? `${kmPrevista.toLocaleString('pt-BR')} km` : '—',
    nome_oficina: nomeOficina,
    servico,
  }
}

export function calcularDataRetornoRegra(dataBase: string, regra: Pick<RegraLembrete, 'prazo_dias' | 'prazo_meses'>): string {
  const d = parseDataLocal(dataBase)
  if (regra.prazo_meses > 0) {
    d.setMonth(d.getMonth() + regra.prazo_meses)
  }
  if (regra.prazo_dias > 0) {
    d.setDate(d.getDate() + regra.prazo_dias)
  }
  if (regra.prazo_meses === 0 && regra.prazo_dias === 0) {
    d.setDate(d.getDate() + 90)
  }
  return formatarDataLocal(d)
}

export function sugerirRegrasPorOS(
  regras: RegraLembrete[],
  servicosExecutados: string
): RegraLembrete[] {
  const texto = servicosExecutados.toLowerCase()
  return regras.filter((r) => {
    if (!r.ativo) return false
    const alvo = `${r.nome_regra} ${r.servico_relacionado}`.toLowerCase()
    if (texto.includes(r.servico_relacionado.toLowerCase())) return true
    if (texto.includes(r.nome_regra.toLowerCase())) return true
    if (/óleo|oleo|lubrific/i.test(texto) && /óleo|oleo|lubrific/i.test(alvo)) return true
    if (/freio|pastilha|disco/i.test(texto) && r.categoria === 'freios') return true
    if (/pneu|calibr/i.test(texto) && r.categoria === 'pneus') return true
    if (/bateria/i.test(texto) && r.categoria === 'eletrica') return true
    if (/relação|relacao|corrente/i.test(texto) && r.categoria === 'transmissao') return true
    if (/revisão|revisao/i.test(texto) && r.categoria === 'revisao') return true
    return false
  })
}

function aplicarStatusFixo(
  lembrete: LembreteCliente,
  status?: StatusLembrete
): LembreteCliente {
  if (!status) return lembrete
  if (status === 'pendente' || status === 'para_hoje' || status === 'vencido') {
    return { ...lembrete, status_fixo: undefined }
  }
  if (status === 'enviado') return { ...lembrete, status_fixo: 'enviado' }
  if (status === 'concluido') return { ...lembrete, status_fixo: 'concluido' }
  if (status === 'cancelado') return { ...lembrete, status_fixo: 'cancelado' }
  if (status === 'falha_envio') return { ...lembrete, status_fixo: 'falha_envio' }
  return lembrete
}

function adicionarRegistroHistorico(
  lembrete: LembreteCliente,
  registro: RegistroHistoricoLembrete
): LembreteCliente {
  return {
    ...lembrete,
    historico: [...(lembrete.historico ?? []), registro],
  }
}

export class LembretesService {
  listarRegras(officeId: string): RegraLembrete[] {
    const store = loadStore()
    return getOfficeStore(store, officeId).regras.sort((a, b) =>
      a.nome_regra.localeCompare(b.nome_regra, 'pt-BR')
    )
  }

  salvarRegra(officeId: string, input: RegraLembreteInput, id?: string): RegraLembrete {
    const store = loadStore()
    const office = getOfficeStore(store, officeId)
    const agora = new Date().toISOString()

    if (id) {
      const idx = office.regras.findIndex((r) => r.id === id)
      if (idx === -1) throw new Error('Regra não encontrada.')
      office.regras[idx] = { ...office.regras[idx], ...input, updated_at: agora }
      saveStore(store, officeId)
      return office.regras[idx]
    }

    const nova: RegraLembrete = {
      ...input,
      id: gerarId(),
      office_id: officeId,
      created_at: agora,
      updated_at: agora,
    }
    office.regras.push(nova)
    saveStore(store, officeId)
    return nova
  }

  excluirRegra(officeId: string, id: string): void {
    const store = loadStore()
    const office = getOfficeStore(store, officeId)
    office.regras = office.regras.filter((r) => r.id !== id)
    saveStore(store, officeId)
  }

  listarLembretes(officeId: string, hoje?: string): LembreteComStatus[] {
    const store = loadStore()
    const office = getOfficeStore(store, officeId)
    return office.lembretes
      .map((l) => enriquecerLembrete(l, hoje))
      .sort((a, b) => a.data_prevista.localeCompare(b.data_prevista))
  }

  listarPorCliente(officeId: string, clienteId: string, hoje?: string): LembreteComStatus[] {
    return this.listarLembretes(officeId, hoje).filter((l) => l.cliente_id === clienteId)
  }

  listarPorMoto(officeId: string, motoId: string, hoje?: string): LembreteComStatus[] {
    return this.listarLembretes(officeId, hoje).filter((l) => l.moto_id === motoId)
  }

  listarPorOS(officeId: string, ordemServicoId: string, hoje?: string): LembreteComStatus[] {
    return this.listarLembretes(officeId, hoje).filter((l) => l.ordem_servico_id === ordemServicoId)
  }

  criarLembrete(
    officeId: string,
    input: Omit<LembreteCliente, 'id' | 'office_id' | 'created_at' | 'contato' | 'status_fixo' | 'historico'>,
    opcoes?: { responsavel?: ResponsavelLembrete; automatico?: boolean }
  ): LembreteCliente {
    const store = loadStore()
    const office = getOfficeStore(store, officeId)
    const lembrete: LembreteCliente = {
      ...input,
      id: gerarId(),
      office_id: officeId,
      created_at: new Date().toISOString(),
      historico: [],
    }
    if (opcoes?.automatico) {
      aplicarResponsavelCriacao(lembrete, { nome: 'Sistema', automatico: true }, true)
    } else if (opcoes?.responsavel) {
      aplicarResponsavelCriacao(lembrete, opcoes.responsavel, false)
    }
    office.lembretes.push(lembrete)
    saveStore(store, officeId)
    return lembrete
  }

  criarLembretesDeRegras(
    officeId: string,
    os: OrdemServico,
    moto: Moto,
    clienteNome: string,
    regras: RegraLembrete[],
    nomeOficina: string,
    overrides: LembreteRegraOverride[] = [],
    _responsavel?: ResponsavelLembrete
  ): LembreteCliente[] {
    const dataBase = formatarDataLocal(new Date())
    const kmBase = os.quilometragem_saida ?? os.quilometragem_entrada ?? moto.quilometragem
    const criados: LembreteCliente[] = []
    const overrideMap = new Map(overrides.map((o) => [o.regra_id, o]))

    for (const regra of regras) {
      const ov = overrideMap.get(regra.id)
      const dataPrevista = ov?.data_prevista ?? calcularDataRetornoRegra(dataBase, regra)
      const kmPrevista =
        ov?.km_prevista ?? (regra.km_retorno ? kmBase + regra.km_retorno : undefined)
      const servico = ov?.servico ?? regra.servico_relacionado
      const vars = montarVarsLembrete(
        clienteNome,
        moto,
        servico,
        dataPrevista,
        kmPrevista,
        nomeOficina
      )
      const mensagem =
        ov?.mensagem ?? montarMensagemLembrete(regra.mensagem_padrao, vars)

      criados.push(
        this.criarLembrete(
          officeId,
          {
            cliente_id: os.cliente_id,
            moto_id: os.moto_id,
            ordem_servico_id: os.id,
            ordem_servico_numero: os.numero,
            regra_id: regra.id,
            servico,
            data_prevista: dataPrevista,
            km_prevista: kmPrevista,
            km_base: kmBase,
            mensagem,
            observacoes: ov?.observacoes ?? regra.observacoes_internas,
            personalizado: false,
          },
          { automatico: true }
        )
      )
    }

    return criados
  }

  criarLembretePersonalizado(
    officeId: string,
    os: OrdemServico,
    moto: Moto,
    input: LembretePersonalizadoInput,
    responsavel?: ResponsavelLembrete
  ): LembreteCliente {
    const kmBase = os.quilometragem_saida ?? os.quilometragem_entrada ?? moto.quilometragem
    return this.criarLembrete(
      officeId,
      {
        cliente_id: os.cliente_id,
        moto_id: os.moto_id,
        ordem_servico_id: os.id,
        ordem_servico_numero: os.numero,
        servico: input.servico,
        data_prevista: input.data_prevista,
        km_prevista: input.km_prevista,
        km_base: kmBase,
        mensagem: input.mensagem,
        observacoes: input.observacoes,
        personalizado: true,
      },
      responsavel ? { responsavel, automatico: false } : { automatico: false }
    )
  }

  atualizarLembrete(
    officeId: string,
    lembreteId: string,
    input: AtualizarLembreteInput
  ): LembreteCliente {
    const store = loadStore()
    const office = getOfficeStore(store, officeId)
    const idx = office.lembretes.findIndex((l) => l.id === lembreteId)
    if (idx === -1) throw new Error('Lembrete não encontrado.')

    const atual = office.lembretes[idx]
    const { status, ...campos } = input

    let atualizado: LembreteCliente = {
      ...atual,
      ...campos,
    }

    if (status) {
      atualizado = aplicarStatusFixo(atualizado, status)
      if (status === 'cancelado') {
        const nomeResp = input.responsavel?.trim() || 'Usuário'
        atualizado = adicionarRegistroHistorico(atualizado, {
          id: gerarId(),
          data: new Date().toISOString(),
          tipo_acao: 'cancelamento',
          canal: 'manual',
          responsavel: nomeResp,
          status_apos: 'cancelado',
          observacao: 'Cancelado na edição do lembrete',
        })
      }
    }

    office.lembretes[idx] = atualizado
    saveStore(store, officeId)
    return office.lembretes[idx]
  }

  registrarContato(
    officeId: string,
    lembreteId: string,
    input: RegistrarContatoLembreteInput
  ): LembreteCliente {
    const store = loadStore()
    const office = getOfficeStore(store, officeId)
    const idx = office.lembretes.findIndex((l) => l.id === lembreteId)
    if (idx === -1) throw new Error('Lembrete não encontrado.')

    const atual = office.lembretes[idx]
    const statusFixo = statusPorResultado(input.resultado)
    const statusApos = statusFixoParaStatus(statusFixo)
    const registro: RegistroHistoricoLembrete = {
      id: gerarId(),
      data: input.data_hora ?? new Date().toISOString(),
      tipo_acao: input.tipo_acao ?? 'contato',
      canal: input.canal,
      mensagem: input.mensagem,
      resultado: input.resultado,
      responsavel: input.responsavel,
      status_apos: statusApos,
      observacao: input.observacao,
    }

    let atualizado = adicionarRegistroHistorico(atual, registro)
    atualizado = { ...atualizado, status_fixo: statusFixo }

    if (input.canal === 'whatsapp') {
      const contato: HistoricoContatoLembrete = {
        data: registro.data,
        tipo: 'whatsapp_manual',
        servico: atual.servico,
        observacao: input.observacao,
      }
      atualizado = { ...atualizado, contato }
    }

    office.lembretes[idx] = atualizado
    saveStore(store, officeId)
    return office.lembretes[idx]
  }

  marcarContatado(
    officeId: string,
    lembreteId: string,
    contato: Omit<HistoricoContatoLembrete, 'data'>,
    responsavel = 'Usuário'
  ): LembreteCliente {
    const store = loadStore()
    const office = getOfficeStore(store, officeId)
    const lembrete = office.lembretes.find((l) => l.id === lembreteId)
    return this.registrarContato(officeId, lembreteId, {
      canal: 'whatsapp',
      mensagem: lembrete?.mensagem,
      resultado: 'enviado',
      responsavel,
      observacao: contato.observacao,
      tipo_acao: 'envio',
    })
  }

  cancelarLembrete(officeId: string, lembreteId: string, responsavel = 'Usuário'): LembreteCliente {
    const store = loadStore()
    const office = getOfficeStore(store, officeId)
    const idx = office.lembretes.findIndex((l) => l.id === lembreteId)
    if (idx === -1) throw new Error('Lembrete não encontrado.')

    const registro: RegistroHistoricoLembrete = {
      id: gerarId(),
      data: new Date().toISOString(),
      tipo_acao: 'cancelamento',
      canal: 'manual',
      responsavel,
      status_apos: 'cancelado',
      observacao: 'Lembrete cancelado',
    }

    office.lembretes[idx] = {
      ...adicionarRegistroHistorico(office.lembretes[idx], registro),
      status_fixo: 'cancelado',
    }
    saveStore(store, officeId)
    return office.lembretes[idx]
  }

  calcularResumo(officeId: string, hoje = getDataLocalHoje()): ResumoLembretes {
    const todos = this.listarLembretes(officeId, hoje)
    const ativos = todos.filter((l) => lembreteStatusRequerAcao(l.status))

    const paraHoje = ativos.filter((l) => l.status === 'para_hoje')
    const vencidos = ativos.filter((l) => l.status === 'vencido')
    const proximos7Dias = ativos.filter((l) => {
      if (l.status !== 'pendente') return false
      return diasEntre(hoje, l.data_prevista) <= 7
    })

    return {
      vencidos,
      paraHoje,
      proximos7Dias,
      contatarHoje: [...paraHoje, ...vencidos],
      totalPendentes: ativos.length,
      totalAlerta: paraHoje.length + vencidos.length,
    }
  }

  listarHistoricoComunicacao(officeId: string): HistoricoComunicacaoItem[] {
    const itens: HistoricoComunicacaoItem[] = []
    for (const lembrete of this.listarLembretes(officeId)) {
      for (const registro of lembrete.historico ?? []) {
        itens.push({
          id: registro.id,
          lembrete_id: lembrete.id,
          cliente_id: lembrete.cliente_id,
          moto_id: lembrete.moto_id,
          ordem_servico_id: lembrete.ordem_servico_id,
          ordem_servico_numero: lembrete.ordem_servico_numero,
          servico: lembrete.servico,
          registro,
        })
      }
    }
    return itens.sort((a, b) => b.registro.data.localeCompare(a.registro.data))
  }

  listarHistoricoPorCliente(officeId: string, clienteId: string): HistoricoComunicacaoItem[] {
    return this.listarHistoricoComunicacao(officeId).filter((h) => h.cliente_id === clienteId)
  }

  listarHistoricoPorMoto(officeId: string, motoId: string): HistoricoComunicacaoItem[] {
    return this.listarHistoricoComunicacao(officeId).filter((h) => h.moto_id === motoId)
  }

  listarHistoricoPorOS(officeId: string, ordemServicoId: string): HistoricoComunicacaoItem[] {
    return this.listarHistoricoComunicacao(officeId).filter(
      (h) => h.ordem_servico_id === ordemServicoId
    )
  }

  /** @deprecated Use listarHistoricoComunicacao */
  listarHistorico(officeId: string): HistoricoContatoLembrete[] {
    return this.listarHistoricoComunicacao(officeId).map((h) => ({
      data: h.registro.data,
      tipo: 'whatsapp_manual',
      servico: h.servico,
      observacao: h.registro.observacao,
    }))
  }
}

export const lembretesService = new LembretesService()
