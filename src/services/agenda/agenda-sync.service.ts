import { getCraftPersistenceMode, isSupabaseConfigured } from '@/lib/supabase'
import {
  executarPushAgendamentos,
  logAgendaPush,
  processarRetryAgendamentos,
  type AgendaPushResult,
} from '@/services/agenda/agenda-push'
import { logAgendaOrigem } from '@/services/agenda/agenda-origem-log'
import { enfileirarPushAgenda } from '@/services/agenda/agenda-push-queue'
import { mesclarAgendamentos } from '@/services/agenda/agenda-merge'
import {
  carregarAgendamentosDoSupabase,
  persistirAgendamentosNoSupabase,
  type ResultadoCarregamentoAgenda,
  type ResultadoPersistenciaAgenda,
} from '@/services/agenda/supabase-agenda.persistence'
import { atualizarContagemPendenciasAtivas } from '@/services/persistence-status.events'
import { localCraftRepository } from '@/services/repository/local.repository'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import {
  gravarRefsTecnicasAgendaAposPushOk,
  type AgendaRefsTecnicasConfirmadas,
} from '@/services/agenda/agenda-fk-canonico'
import type { Agendamento } from '@/types'
import type { CraftDatabase } from '@/types/database'

export function agendaSyncHabilitado(): boolean {
  return getCraftPersistenceMode() === 'supabase' && isSupabaseConfigured()
}

export interface PublicarAgendamentosOpcoes {
  habilitado?: boolean
  online?: boolean
  agendamentos?: Agendamento[]
  carregarRemoto?: (officeId: string) => Promise<ResultadoCarregamentoAgenda>
  persistir?: (officeId: string, agendamentos: Agendamento[]) => Promise<ResultadoPersistenciaAgenda>
  carregarLocal?: (officeId: string) => CraftDatabase
  salvarLocal?: (officeId: string, db: CraftDatabase) => void
  canonicalizarRefsLocais?: (refs: AgendaRefsTecnicasConfirmadas[]) => void
}

function contarFilaAgendamento(officeId: string): number {
  return syncQueueService
    .listar(officeId, 'pendente')
    .filter((i) => i.entidade === 'agendamento').length
}

export function enfileirarSyncAgendamentos(
  officeId: string,
  motivo = 'desconhecido'
): void {
  const existente = syncQueueService
    .listar(officeId, 'pendente')
    .find((i) => i.entidade === 'agendamento' && i.entidade_id === officeId)

  syncQueueService.enfileirar({
    office_id: officeId,
    tipo_acao: 'update',
    entidade: 'agendamento',
    entidade_id: officeId,
    payload: { sync_agendamentos: true, motivo },
  })

  logAgendaPush({
    officeId,
    etapa: 'enfileirado',
    item_enfileirado: true,
    reutilizou_item: Boolean(existente),
    motivo,
    fila_depois: contarFilaAgendamento(officeId),
  })
  atualizarContagemPendenciasAtivas(officeId)
}

export function marcarAgendamentosSincronizados(
  officeId: string,
  agendamentos: Agendamento[]
): void {
  syncQueueService.marcarSincronizadosPorEntidade(officeId, 'agendamento', officeId)
  for (const ag of agendamentos) {
    syncQueueService.marcarSincronizadosPorEntidade(officeId, 'agendamento', ag.id)
  }
  atualizarContagemPendenciasAtivas(officeId)
}

function resolverSnapshotAgenda(
  officeId: string,
  opcoes?: PublicarAgendamentosOpcoes
): Agendamento[] {
  if (opcoes?.agendamentos) return opcoes.agendamentos
  const carregarLocal =
    opcoes?.carregarLocal ?? ((id: string) => localCraftRepository.carregar(id))
  return carregarLocal(officeId).agendamentos ?? []
}

export async function publicarAgendamentosLocais(
  officeId: string,
  opcoes?: PublicarAgendamentosOpcoes
): Promise<AgendaPushResult> {
  const snapshot = resolverSnapshotAgenda(officeId, opcoes)
  const source = opcoes?.agendamentos ? 'explicito' : 'repo'
  logAgendaOrigem({
    etapa: 'push_enqueue',
    agendamentos: snapshot,
    source,
  })
  return enfileirarPushAgenda(officeId, snapshot, (agendamentos, origem) =>
    publicarAgendamentosLocaisInterno(
      officeId,
      { ...opcoes, agendamentos },
      origem
    )
  )
}

async function publicarAgendamentosLocaisInterno(
  officeId: string,
  opcoes?: PublicarAgendamentosOpcoes,
  origem?: { trailing: boolean }
): Promise<AgendaPushResult> {
  const habilitado = opcoes?.habilitado ?? agendaSyncHabilitado()
  const online =
    opcoes?.online ?? (typeof navigator === 'undefined' || navigator.onLine)
  const carregarRemoto = opcoes?.carregarRemoto ?? carregarAgendamentosDoSupabase
  const persistir = opcoes?.persistir ?? persistirAgendamentosNoSupabase
  const carregarLocal =
    opcoes?.carregarLocal ?? ((id: string) => localCraftRepository.carregar(id))
  const salvarLocal =
    opcoes?.salvarLocal ??
    ((id: string, db: CraftDatabase) => localCraftRepository.salvar(id, db))
  const canonicalizarRefsLocais =
    opcoes?.canonicalizarRefsLocais ??
    ((refs) =>
      gravarRefsTecnicasAgendaAposPushOk(
        officeId,
        refs,
        (id) => localCraftRepository.carregar(id),
        (id, db) => localCraftRepository.salvar(id, db)
      ))

  const base = carregarLocal(officeId)
  const locais = opcoes?.agendamentos ?? base.agendamentos ?? []
  logAgendaOrigem({
    etapa: 'repo_carregar_push',
    agendamentos: base.agendamentos ?? [],
    source: 'repo',
    trailing: origem?.trailing,
  })
  logAgendaOrigem({
    etapa: 'push_start',
    agendamentos: locais,
    source: 'snapshot_enfileirado',
    trailing: origem?.trailing,
    extra: {
      pushSnapshotTemD719: Boolean(
        (locais ?? []).some((a) => a.id.startsWith('d71945fa'))
      ),
      repoAtualTemD719: Boolean(
        (base.agendamentos ?? []).some((a) => a.id.startsWith('d71945fa'))
      ),
    },
  })

  return executarPushAgendamentos({
    officeId,
    habilitado,
    online,
    locais,
    carregarRemoto: () => carregarRemoto(officeId),
    persistir: (agendamentos) => persistir(officeId, agendamentos),
    salvarLocal: (mesclados) =>
      salvarLocal(officeId, { ...base, agendamentos: mesclados }),
    contarFila: () => contarFilaAgendamento(officeId),
    enfileirar: (motivo) => enfileirarSyncAgendamentos(officeId, motivo),
    marcarSincronizados: (agendamentos) =>
      marcarAgendamentosSincronizados(officeId, agendamentos),
    canonicalizarRefsLocais,
    trailing: origem?.trailing,
  })
}

export function mesclarAgendamentosNoDatabase(
  db: CraftDatabase,
  remoto: Agendamento[]
): CraftDatabase {
  return {
    ...db,
    agendamentos: mesclarAgendamentos(db.agendamentos ?? [], remoto),
  }
}

export async function processarFilaAgendamentosPendente(
  officeId: string,
  opcoes?: PublicarAgendamentosOpcoes
): Promise<boolean> {
  const pendentes = syncQueueService
    .listar(officeId, 'pendente')
    .filter((i) => i.entidade === 'agendamento')

  return processarRetryAgendamentos({
    officeId,
    quantidadePendentes: pendentes.length,
    publicar: () => publicarAgendamentosLocais(officeId, opcoes),
    marcarItensSincronizados: () => {
      for (const item of pendentes) {
        syncQueueService.marcarSincronizado(item.id)
      }
      atualizarContagemPendenciasAtivas(officeId)
    },
    contarFila: () => contarFilaAgendamento(officeId),
  })
}
