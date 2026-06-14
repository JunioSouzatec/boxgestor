import type { Moto, OrdemServico } from '@/types'
import type {
  AtualizarLembreteInput,
  HistoricoContatoLembrete,
  LembreteCliente,
  LembreteComStatus,
  LembretePersonalizadoInput,
  LembreteRegraOverride,
  RegraLembrete,
  RegraLembreteInput,
  ResumoLembretes,
  StatusLembrete,
} from '@/types/lembrete'
import { gerarId } from '@/lib/utils'

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
  return d.toISOString().slice(0, 10)
}

function diasEntre(inicio: string, fim: string): number {
  const a = new Date(inicio + 'T12:00:00').getTime()
  const b = new Date(fim + 'T12:00:00').getTime()
  return Math.round((b - a) / (1000 * 60 * 60 * 24))
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

export function calcularDataRetornoRegra(dataBase: string, regra: Pick<RegraLembrete, 'prazo_dias' | 'prazo_meses'>): string {
  const d = new Date(dataBase + 'T12:00:00')
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

function loadStore(): LembretesStore {
  try {
    const raw = localStorage.getItem(LEMBRETES_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as LembretesStore
  } catch {
    /* seed */
  }
  return { version: 1, offices: {} }
}

function saveStore(store: LembretesStore): void {
  localStorage.setItem(LEMBRETES_STORAGE_KEY, JSON.stringify(store))
}

/** Remove lembretes gerados (mantém regras de configuração). */
export function limparLembretesOperacionaisPorOffice(officeId: string): void {
  const store = loadStore()
  if (store.offices[officeId]) {
    store.offices[officeId].lembretes = []
    saveStore(store)
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
    saveStore(store)
  } else {
    store.offices[officeId].regras = store.offices[officeId].regras.map(normalizarRegra)
  }
  return store.offices[officeId]
}

export function calcularStatusLembrete(
  lembrete: LembreteCliente,
  hoje = formatarDataLocal(new Date())
): StatusLembrete {
  if (lembrete.status_fixo === 'contatado') return 'contatado'
  if (lembrete.status_fixo === 'cancelado') return 'cancelado'

  if (lembrete.data_prevista < hoje) return 'vencido'

  const dias = diasEntre(hoje, lembrete.data_prevista)
  if (dias <= 7) return 'proximo'
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
      saveStore(store)
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
    saveStore(store)
    return nova
  }

  excluirRegra(officeId: string, id: string): void {
    const store = loadStore()
    const office = getOfficeStore(store, officeId)
    office.regras = office.regras.filter((r) => r.id !== id)
    saveStore(store)
  }

  listarLembretes(officeId: string, hoje?: string): LembreteComStatus[] {
    const store = loadStore()
    const office = getOfficeStore(store, officeId)
    return office.lembretes
      .map((l) => enriquecerLembrete(l, hoje))
      .sort((a, b) => a.data_prevista.localeCompare(b.data_prevista))
  }

  criarLembrete(
    officeId: string,
    input: Omit<LembreteCliente, 'id' | 'office_id' | 'created_at' | 'contato' | 'status_fixo'>
  ): LembreteCliente {
    const store = loadStore()
    const office = getOfficeStore(store, officeId)
    const lembrete: LembreteCliente = {
      ...input,
      id: gerarId(),
      office_id: officeId,
      created_at: new Date().toISOString(),
    }
    office.lembretes.push(lembrete)
    saveStore(store)
    return lembrete
  }

  criarLembretesDeRegras(
    officeId: string,
    os: OrdemServico,
    moto: Moto,
    clienteNome: string,
    regras: RegraLembrete[],
    nomeOficina: string,
    overrides: LembreteRegraOverride[] = []
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
        this.criarLembrete(officeId, {
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
        })
      )
    }

    return criados
  }

  criarLembretePersonalizado(
    officeId: string,
    os: OrdemServico,
    moto: Moto,
    input: LembretePersonalizadoInput
  ): LembreteCliente {
    const kmBase = os.quilometragem_saida ?? os.quilometragem_entrada ?? moto.quilometragem
    return this.criarLembrete(officeId, {
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
    })
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

    office.lembretes[idx] = {
      ...atual,
      ...campos,
    }

    if (status === 'contatado') {
      office.lembretes[idx].status_fixo = 'contatado'
      if (!office.lembretes[idx].contato) {
        office.lembretes[idx].contato = {
          data: new Date().toISOString(),
          tipo: 'whatsapp_manual',
          servico: office.lembretes[idx].servico,
          observacao: 'Marcado como contatado manualmente',
        }
      }
    } else if (status === 'cancelado') {
      office.lembretes[idx].status_fixo = 'cancelado'
    } else if (status) {
      office.lembretes[idx].status_fixo = undefined
    }

    saveStore(store)
    return office.lembretes[idx]
  }

  marcarContatado(
    officeId: string,
    lembreteId: string,
    contato: Omit<HistoricoContatoLembrete, 'data'>
  ): LembreteCliente {
    const store = loadStore()
    const office = getOfficeStore(store, officeId)
    const idx = office.lembretes.findIndex((l) => l.id === lembreteId)
    if (idx === -1) throw new Error('Lembrete não encontrado.')

    office.lembretes[idx] = {
      ...office.lembretes[idx],
      status_fixo: 'contatado',
      contato: { ...contato, data: new Date().toISOString() },
    }
    saveStore(store)
    return office.lembretes[idx]
  }

  cancelarLembrete(officeId: string, lembreteId: string): LembreteCliente {
    const store = loadStore()
    const office = getOfficeStore(store, officeId)
    const idx = office.lembretes.findIndex((l) => l.id === lembreteId)
    if (idx === -1) throw new Error('Lembrete não encontrado.')
    office.lembretes[idx].status_fixo = 'cancelado'
    saveStore(store)
    return office.lembretes[idx]
  }

  calcularResumo(officeId: string, hoje = formatarDataLocal(new Date())): ResumoLembretes {
    const todos = this.listarLembretes(officeId, hoje)
    const ativos = todos.filter((l) => l.status !== 'contatado' && l.status !== 'cancelado')

    return {
      vencidos: ativos.filter((l) => l.status === 'vencido'),
      proximos7Dias: ativos.filter((l) => l.status === 'proximo'),
      contatarHoje: ativos.filter((l) => l.data_prevista === hoje || l.status === 'vencido'),
      totalPendentes: ativos.length,
    }
  }

  listarHistorico(officeId: string): HistoricoContatoLembrete[] {
    return this.listarLembretes(officeId)
      .filter((l) => l.contato)
      .map((l) => l.contato!)
      .sort((a, b) => b.data.localeCompare(a.data))
  }
}

export const lembretesService = new LembretesService()
