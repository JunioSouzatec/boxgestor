import type { Cliente, Moto, OrdemServico } from '@/types'
import type { HistoricoContato } from '@/types/comunicacao'
import type { LembreteComStatus } from '@/types/lembrete'
import type {
  ClientePortalResumo,
  EntradaPontos,
  EventoTimeline,
  FichaClienteCompleta,
  FidelizacaoCliente,
  NivelVIP,
  RegistroQuilometragemCliente,
  ResumoFinanceiroCliente,
  ResumoPortalDashboard,
} from '@/types/portal-cliente'
import { gerarId } from '@/lib/utils'
import { obterDataRegistroOS } from '@/lib/dados-legados'
import { calcularTotalGeralDeCampos } from '@/services/os-financeiro.service'
import type { PapelUsuario } from '@/types/auth'

const PONTOS_POR_SERVICO = 10
const DIAS_SEM_RETORNO_ALERTA = 90

export function podeEditarPortalCliente(papel: PapelUsuario): boolean {
  return papel === 'dono' || papel === 'gerente'
}

export function podeVerPortalCompleto(papel: PapelUsuario): boolean {
  return papel === 'dono' || papel === 'gerente' || papel === 'recepcao'
}

export function podeVerApenasTimelineMoto(papel: PapelUsuario): boolean {
  return papel === 'mecanico'
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function diasEntre(inicio: string, fim: string): number {
  const a = new Date(inicio + 'T12:00:00').getTime()
  const b = new Date(fim + 'T12:00:00').getTime()
  return Math.round((b - a) / (1000 * 60 * 60 * 24))
}

export function calcularNivelVIP(qtdServicos: number, totalGasto: number): NivelVIP {
  if (qtdServicos >= 10 && totalGasto >= 10000) return 'diamante'
  if (qtdServicos >= 6 && totalGasto >= 5000) return 'ouro'
  if (qtdServicos >= 3 && totalGasto >= 1500) return 'prata'
  return 'bronze'
}

export function isClienteVIP(nivel: NivelVIP): boolean {
  return nivel === 'ouro' || nivel === 'diamante'
}

function ordensConcluidas(ordens: OrdemServico[]): OrdemServico[] {
  return ordens.filter((o) => ['finalizada', 'entregue'].includes(o.status))
}

export function calcularResumoFinanceiro(
  ordens: OrdemServico[],
  lembretes: LembreteComStatus[]
): ResumoFinanceiroCliente {
  const concluidas = ordensConcluidas(ordens)
  const total = concluidas.reduce((acc, o) => acc + calcularTotalGeralDeCampos(o), 0)
  const qtd = concluidas.length

  const datas = concluidas.map((o) => obterDataRegistroOS(o)).filter((d) => d !== '—').sort()
  const ultimo = datas.length > 0 ? datas[datas.length - 1] : undefined

  const lembretesAtivos = lembretes.filter(
    (l) => !['concluido', 'cancelado', 'falha_envio'].includes(l.status)
  )
  const proxima = lembretesAtivos.sort((a, b) =>
    a.data_prevista.localeCompare(b.data_prevista)
  )[0]?.data_prevista

  return {
    total_gasto: total,
    quantidade_servicos: qtd,
    ticket_medio: qtd > 0 ? total / qtd : 0,
    ultimo_atendimento: ultimo,
    proxima_revisao: proxima,
  }
}

export function calcularFidelizacao(ordens: OrdemServico[]): FidelizacaoCliente {
  const concluidas = [...ordensConcluidas(ordens)].sort((a, b) =>
    (a.atualizado_em ?? a.criado_em ?? '').localeCompare(b.atualizado_em ?? b.criado_em ?? '')
  )

  const historico: EntradaPontos[] = []

  for (const os of concluidas) {
    const data = obterDataRegistroOS(os)
    if (data === '—') continue
    const totalOs = calcularTotalGeralDeCampos(os)
    const ptsGasto = Math.floor(totalOs / 100)
    if (ptsGasto > 0) {
      historico.push({
        id: gerarId(),
        data,
        descricao: `OS #${os.numero} — R$ ${totalOs.toFixed(2)} gastos`,
        pontos: ptsGasto,
      })
    }
    historico.push({
      id: gerarId(),
      data,
      descricao: `OS #${os.numero} — serviço concluído`,
      pontos: PONTOS_POR_SERVICO,
    })
  }

  return {
    pontos_acumulados: historico.reduce((acc, e) => acc + e.pontos, 0),
    historico: historico.sort((a, b) => b.data.localeCompare(a.data)),
  }
}

export function extrairQuilometragens(
  ordens: OrdemServico[],
  motos: Moto[]
): RegistroQuilometragemCliente[] {
  const getMoto = (id: string) => motos.find((m) => m.id === id)
  const registros: RegistroQuilometragemCliente[] = []

  for (const os of ordens) {
    const moto = getMoto(os.moto_id)
    const label = moto ? `${moto.marca} ${moto.modelo} (${moto.placa})` : 'Moto'
    const data = obterDataRegistroOS(os)
    if (data === '—') continue

    if (os.quilometragem_entrada != null) {
      registros.push({
        data,
        quilometragem: os.quilometragem_entrada,
        moto_id: os.moto_id,
        moto_label: label,
        ordem_servico_numero: os.numero,
      })
    }
    if (os.quilometragem_saida != null && os.quilometragem_saida !== os.quilometragem_entrada) {
      registros.push({
        data,
        quilometragem: os.quilometragem_saida,
        moto_id: os.moto_id,
        moto_label: label,
        ordem_servico_numero: os.numero,
      })
    }
  }

  for (const moto of motos) {
    if (!registros.some((r) => r.moto_id === moto.id)) {
      registros.push({
        data: (moto.criado_em ?? moto.created_at ?? '').slice(0, 10) || hojeISO(),
        quilometragem: moto.quilometragem,
        moto_id: moto.id,
        moto_label: `${moto.marca} ${moto.modelo} (${moto.placa})`,
      })
    }
  }

  return registros.sort((a, b) => b.data.localeCompare(a.data))
}

export function montarTimelineMoto(
  motoId: string,
  motoLabel: string,
  ordens: OrdemServico[],
  contatos: HistoricoContato[],
  lembretes: LembreteComStatus[]
): EventoTimeline[] {
  const eventos: EventoTimeline[] = []

  for (const os of ordens.filter((o) => o.moto_id === motoId)) {
    eventos.push({
      id: `entrada-${os.id}`,
      tipo: 'entrada_os',
      data: os.criado_em,
      titulo: `OS #${os.numero} recebida`,
      descricao: os.defeito_relatado,
      moto_id: motoId,
      moto_label: motoLabel,
      ordem_servico_id: os.id,
      ordem_servico_numero: os.numero,
    })

    if (os.status_orcamento === 'aprovado' && os.data_orcamento) {
      eventos.push({
        id: `aprov-${os.id}`,
        tipo: 'aprovacao',
        data: os.data_orcamento + 'T12:00:00',
        titulo: `Orçamento OS #${os.numero} aprovado`,
        descricao: os.valor_estimado
          ? `Valor estimado: R$ ${os.valor_estimado.toFixed(2)}`
          : undefined,
        moto_id: motoId,
        moto_label: motoLabel,
        ordem_servico_id: os.id,
        ordem_servico_numero: os.numero,
      })
    }

    if (['finalizada', 'entregue'].includes(os.status)) {
      eventos.push({
        id: `exec-${os.id}`,
        tipo: 'servico_executado',
        data: os.atualizado_em ?? os.criado_em,
        titulo: `Serviço OS #${os.numero} executado`,
        descricao: os.servicos_executados?.slice(0, 120),
        moto_id: motoId,
        moto_label: motoLabel,
        ordem_servico_id: os.id,
        ordem_servico_numero: os.numero,
      })
    }

    if (os.status === 'entregue') {
      eventos.push({
        id: `entrega-${os.id}`,
        tipo: 'entrega',
        data: os.atualizado_em ?? os.criado_em,
        titulo: `Moto entregue — OS #${os.numero}`,
        moto_id: motoId,
        moto_label: motoLabel,
        ordem_servico_id: os.id,
        ordem_servico_numero: os.numero,
      })
    }

    if (os.data_vencimento_garantia && os.dias_garantia) {
      const hoje = hojeISO()
      eventos.push({
        id: `gar-${os.id}`,
        tipo: 'garantia',
        data: os.data_vencimento_garantia + 'T12:00:00',
        titulo: `Garantia OS #${os.numero}`,
        descricao:
          os.data_vencimento_garantia >= hoje
            ? `Ativa até ${os.data_vencimento_garantia}`
            : `Vencida em ${os.data_vencimento_garantia}`,
        moto_id: motoId,
        moto_label: motoLabel,
        ordem_servico_id: os.id,
        ordem_servico_numero: os.numero,
      })
    }
  }

  for (const c of contatos) {
    const os = ordens.find((o) => o.id === c.ordem_servico_id)
    if (os && os.moto_id === motoId) {
      eventos.push({
        id: `contato-${c.id}`,
        tipo: 'contato',
        data: c.data,
        titulo: 'Contato via WhatsApp',
        descricao: c.preview,
        moto_id: motoId,
        moto_label: motoLabel,
        ordem_servico_numero: c.ordem_servico_numero,
      })
    }
  }

  for (const l of lembretes.filter((x) => x.moto_id === motoId)) {
    const registros = l.historico ?? []
    if (registros.length === 0 && l.contato) {
      eventos.push({
        id: `lemb-${l.id}`,
        tipo: 'lembrete',
        data: l.contato.data,
        titulo: `Lembrete: ${l.servico}`,
        descricao: l.contato.observacao,
        moto_id: motoId,
        moto_label: motoLabel,
      })
      continue
    }
    for (const reg of registros) {
      eventos.push({
        id: `lemb-${l.id}-${reg.id}`,
        tipo: 'lembrete',
        data: reg.data,
        titulo: `Lembrete: ${l.servico}`,
        descricao: reg.mensagem || reg.observacao,
        moto_id: motoId,
        moto_label: motoLabel,
      })
    }
  }

  return eventos.sort((a, b) => b.data.localeCompare(a.data))
}

export function montarTimelineCliente(
  motos: Moto[],
  ordens: OrdemServico[],
  contatos: HistoricoContato[],
  lembretes: LembreteComStatus[]
): EventoTimeline[] {
  const todos: EventoTimeline[] = []
  for (const moto of motos) {
    const label = `${moto.marca} ${moto.modelo} (${moto.placa})`
    todos.push(...montarTimelineMoto(moto.id, label, ordens, contatos, lembretes))
  }
  return todos.sort((a, b) => b.data.localeCompare(a.data))
}

function extrairGarantiasAtivas(ordens: OrdemServico[], clienteId: string) {
  const hoje = hojeISO()
  return ordens
    .filter(
      (o) =>
        o.cliente_id === clienteId &&
        o.data_vencimento_garantia &&
        o.data_vencimento_garantia >= hoje &&
        ['finalizada', 'entregue'].includes(o.status)
    )
    .map((o) => ({
      id: o.id,
      ordem_servico_id: o.id,
      moto_id: o.moto_id,
      cliente_id: o.cliente_id,
      office_id: o.office_id ?? o.oficina_id ?? '',
      dias_garantia: o.dias_garantia ?? 0,
      data_inicio: obterDataRegistroOS(o),
      data_vencimento: o.data_vencimento_garantia!,
      ativa: true,
    }))
}

export function montarResumoCliente(
  cliente: Cliente,
  ordens: OrdemServico[],
  lembretes: LembreteComStatus[]
): ClientePortalResumo {
  const ordensCliente = ordens.filter((o) => o.cliente_id === cliente.id)
  const concluidas = ordensConcluidas(ordensCliente)
  const total = concluidas.reduce((acc, o) => acc + calcularTotalGeralDeCampos(o), 0)
  const nivel = calcularNivelVIP(concluidas.length, total)
  const fidelizacao = calcularFidelizacao(ordensCliente)

  const datas = concluidas.map((o) => obterDataRegistroOS(o)).filter((d) => d !== '—').sort()
  const ultimo = datas.length > 0 ? datas[datas.length - 1] : undefined
  const hoje = hojeISO()
  const diasSemRetorno = ultimo ? diasEntre(ultimo, hoje) : undefined

  const lembretesCliente = lembretes.filter((l) => l.cliente_id === cliente.id)
  const temLembreteProximo = lembretesCliente.some(
    (l) => l.status === 'para_hoje' || l.status === 'vencido' || l.status === 'pendente'
  )

  const temGarantia = extrairGarantiasAtivas(ordens, cliente.id).length > 0

  return {
    cliente,
    nivel_vip: nivel,
    pontos: fidelizacao.pontos_acumulados,
    total_gasto: total,
    quantidade_servicos: concluidas.length,
    ultimo_atendimento: ultimo,
    tem_garantia_ativa: temGarantia,
    tem_lembrete_proximo: temLembreteProximo,
    dias_sem_retorno: diasSemRetorno,
  }
}

export function montarFichaCliente(
  cliente: Cliente,
  motos: Moto[],
  ordens: OrdemServico[],
  contatos: HistoricoContato[],
  lembretes: LembreteComStatus[]
): FichaClienteCompleta {
  const motosCliente = motos.filter((m) => m.cliente_id === cliente.id)
  const ordensCliente = ordens
    .filter((o) => o.cliente_id === cliente.id)
    .sort((a, b) => b.numero - a.numero)
  const lembretesCliente = lembretes.filter((l) => l.cliente_id === cliente.id)
  const lembretesProximos = lembretesCliente.filter(
    (l) => !['concluido', 'cancelado', 'falha_envio'].includes(l.status)
  )

  const resumo = montarResumoCliente(cliente, ordens, lembretes)

  return {
    cliente,
    motos: motosCliente,
    ordens: ordensCliente,
    garantias_ativas: extrairGarantiasAtivas(ordens, cliente.id),
    lembretes_proximos: lembretesProximos,
    quilometragens: extrairQuilometragens(ordensCliente, motosCliente),
    resumo_financeiro: calcularResumoFinanceiro(ordensCliente, lembretesCliente),
    fidelizacao: calcularFidelizacao(ordensCliente),
    nivel_vip: resumo.nivel_vip,
    timeline: montarTimelineCliente(motosCliente, ordensCliente, contatos, lembretesCliente),
  }
}

export function calcularResumoPortalDashboard(
  clientes: Cliente[],
  ordens: OrdemServico[],
  lembretes: LembreteComStatus[]
): ResumoPortalDashboard {
  const resumos = clientes.map((c) => montarResumoCliente(c, ordens, lembretes))

  return {
    clientes_vip: resumos.filter((r) => isClienteVIP(r.nivel_vip)),
    sem_retorno_90_dias: resumos.filter(
      (r) =>
        r.dias_sem_retorno != null &&
        r.dias_sem_retorno >= DIAS_SEM_RETORNO_ALERTA &&
        r.quantidade_servicos > 0
    ),
    garantia_ativa: resumos.filter((r) => r.tem_garantia_ativa),
    lembretes_proximos: resumos.filter((r) => r.tem_lembrete_proximo),
  }
}
