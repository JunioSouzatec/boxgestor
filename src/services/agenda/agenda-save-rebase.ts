import { gerarId } from '@/lib/utils'
import { stampCreate, stampUpdate } from '@/services/migration.service'
import type { Agendamento, AgendamentoInput } from '@/types/agendamento'
import type { CraftDatabase } from '@/types/database'

export type AgendaSaveOperacao = 'create' | 'update' | 'delete'

export type AgendaSaveRebaseResult =
  | {
      ok: true
      db: CraftDatabase
      agendamento: Agendamento
      operacao: AgendaSaveOperacao
    }
  | {
      ok: false
      motivo: 'nao_encontrado' | 'conflito_local'
      db: CraftDatabase
      operacao: AgendaSaveOperacao
    }

export function clonarAgendamentos(agendamentos: Agendamento[]): Agendamento[] {
  try {
    if (typeof structuredClone === 'function') return structuredClone(agendamentos)
  } catch {
    /* JSON */
  }
  return JSON.parse(JSON.stringify(agendamentos)) as Agendamento[]
}

function dbComAgendamentos(db: CraftDatabase, agendamentos: Agendamento[]): CraftDatabase {
  return { ...db, agendamentos }
}

export function rebaseCreateAgendamento(
  repo: CraftDatabase,
  input: AgendamentoInput,
  officeId: string
): AgendaSaveRebaseResult {
  let entity = stampCreate(
    { ...input, id: gerarId(), oficina_id: officeId, office_id: officeId },
    officeId
  )
  if (repo.agendamentos.some((a) => a.id === entity.id)) {
    entity = stampCreate(
      { ...input, id: gerarId(), oficina_id: officeId, office_id: officeId },
      officeId
    )
  }
  if (repo.agendamentos.some((a) => a.id === entity.id)) {
    return { ok: false, motivo: 'conflito_local', db: repo, operacao: 'create' }
  }
  return {
    ok: true,
    db: dbComAgendamentos(repo, [...repo.agendamentos, entity]),
    agendamento: entity,
    operacao: 'create',
  }
}

export function rebaseUpdateAgendamento(
  repo: CraftDatabase,
  id: string,
  patch: Partial<Agendamento>
): AgendaSaveRebaseResult {
  const atual = repo.agendamentos.find((a) => a.id === id)
  if (!atual) {
    return { ok: false, motivo: 'nao_encontrado', db: repo, operacao: 'update' }
  }
  const atualizado = stampUpdate({ ...atual, ...patch, id: atual.id })
  return {
    ok: true,
    db: dbComAgendamentos(
      repo,
      repo.agendamentos.map((a) => (a.id === id ? atualizado : a))
    ),
    agendamento: atualizado,
    operacao: 'update',
  }
}

export function rebaseDeleteAgendamento(
  repo: CraftDatabase,
  id: string
): AgendaSaveRebaseResult {
  const atual = repo.agendamentos.find((a) => a.id === id)
  if (!atual) {
    return { ok: false, motivo: 'nao_encontrado', db: repo, operacao: 'delete' }
  }
  const agora = new Date().toISOString()
  const tombstone = stampUpdate({ ...atual, deleted_at: agora })
  return {
    ok: true,
    db: dbComAgendamentos(
      repo,
      repo.agendamentos.map((a) => (a.id === id ? tombstone : a))
    ),
    agendamento: tombstone,
    operacao: 'delete',
  }
}
