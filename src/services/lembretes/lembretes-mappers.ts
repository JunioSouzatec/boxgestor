import { dataLocalParaIso } from '@/lib/local-id-uuid'
import {
  listarIdsLocaisCandidatos,
  registrarMapeamentoId,
} from '@/services/supabase-sync/id-registry'
import {
  registrarFallbackPush,
  resolverLocalDeFkRemota,
  resolverUuidParaPush,
} from '@/services/supabase-sync/registry-fk'
import type {
  LembreteCliente,
  RegistroHistoricoLembrete,
  RegraLembrete,
} from '@/types/lembrete'

export interface RegraLembreteRow {
  id: string
  office_id: string
  local_id?: string | null
  nome_regra: string
  servico_relacionado: string
  categoria: string
  prazo_dias: number
  prazo_meses: number
  km_retorno?: number | null
  mensagem_padrao: string
  observacoes_internas?: string | null
  ativo: boolean
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export interface LembreteRow {
  id: string
  office_id: string
  local_id?: string | null
  cliente_id: string
  moto_id: string
  ordem_servico_id?: string | null
  ordem_servico_numero?: number | null
  regra_id?: string | null
  servico: string
  data_prevista: string
  km_prevista?: number | null
  km_base?: number | null
  mensagem: string
  observacoes?: string | null
  personalizado: boolean
  status_fixo?: string | null
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface LembreteHistoricoRow {
  id: string
  office_id: string
  local_id?: string | null
  lembrete_id?: string | null
  lembrete_local_id?: string | null
  cliente_id?: string | null
  moto_id?: string | null
  ordem_servico_id?: string | null
  ordem_servico_numero?: number | null
  servico?: string | null
  data: string
  tipo_acao: string
  canal: string
  mensagem?: string | null
  resultado?: string | null
  responsavel: string
  responsavel_nome?: string | null
  status_apos: string
  observacao?: string | null
  metadata?: Record<string, unknown> | null
  created_at: string
}

async function uuidDeLocal(localId: string): Promise<string> {
  return resolverUuidParaPush(localId)
}

async function localDeUuid(
  uuid: string,
  candidatos: string[],
  prefixoFallback?: string,
  caller = 'lembretes_localDeUuid'
): Promise<string> {
  return resolverLocalDeFkRemota(uuid, candidatos, prefixoFallback, caller)
}

async function uuidOpcional(localId?: string | null): Promise<string | null> {
  if (!localId?.trim()) return null
  return uuidDeLocal(localId)
}

export async function mapearRegraLembreteParaSupabase(
  regra: RegraLembrete,
  officeUuid: string
): Promise<RegraLembreteRow> {
  const id = await uuidDeLocal(regra.id)
  registrarFallbackPush(regra.id, id, 'lembretes_regra_push')
  return {
    id,
    office_id: officeUuid,
    local_id: regra.id,
    nome_regra: regra.nome_regra,
    servico_relacionado: regra.servico_relacionado,
    categoria: regra.categoria,
    prazo_dias: regra.prazo_dias,
    prazo_meses: regra.prazo_meses,
    km_retorno: regra.km_retorno ?? null,
    mensagem_padrao: regra.mensagem_padrao,
    observacoes_internas: regra.observacoes_internas ?? null,
    ativo: regra.ativo,
    metadata: {},
    created_at: dataLocalParaIso(regra.created_at),
    updated_at: dataLocalParaIso(regra.updated_at),
    deleted_at: regra.deleted_at ? dataLocalParaIso(regra.deleted_at) : null,
  }
}

export async function mapearRegraLembreteDoSupabase(
  row: RegraLembreteRow,
  officeLocalId: string
): Promise<RegraLembrete> {
  const candidatos = listarIdsLocaisCandidatos(row.local_id ? [row.local_id] : [])
  const localId = row.local_id?.trim()
    ? row.local_id
    : await localDeUuid(row.id, candidatos, 'regra', 'lembretes_regra_pull')
  registrarMapeamentoId(localId, row.id, 'lembretes_regra_pull')

  return {
    id: localId,
    office_id: officeLocalId,
    nome_regra: row.nome_regra,
    servico_relacionado: row.servico_relacionado,
    categoria: row.categoria,
    prazo_dias: row.prazo_dias,
    prazo_meses: row.prazo_meses,
    km_retorno: row.km_retorno ?? undefined,
    mensagem_padrao: row.mensagem_padrao,
    observacoes_internas: row.observacoes_internas ?? undefined,
    ativo: row.ativo,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at ?? null,
  }
}

export async function mapearLembreteParaSupabase(
  lembrete: LembreteCliente,
  officeUuid: string
): Promise<LembreteRow> {
  const id = await uuidDeLocal(lembrete.id)
  registrarFallbackPush(lembrete.id, id, 'lembretes_push')

  return {
    id,
    office_id: officeUuid,
    local_id: lembrete.id,
    cliente_id: await uuidDeLocal(lembrete.cliente_id),
    moto_id: await uuidDeLocal(lembrete.moto_id),
    ordem_servico_id: await uuidOpcional(lembrete.ordem_servico_id),
    ordem_servico_numero: lembrete.ordem_servico_numero ?? null,
    regra_id: await uuidOpcional(lembrete.regra_id),
    servico: lembrete.servico,
    data_prevista: lembrete.data_prevista.slice(0, 10),
    km_prevista: lembrete.km_prevista ?? null,
    km_base: lembrete.km_base ?? null,
    mensagem: lembrete.mensagem,
    observacoes: lembrete.observacoes ?? null,
    personalizado: lembrete.personalizado ?? false,
    status_fixo: lembrete.status_fixo ?? null,
    metadata: {
      contato_legado: lembrete.contato ?? null,
      criado_por_id: lembrete.criado_por_id ?? null,
      criado_por_nome: lembrete.criado_por_nome ?? null,
      automatico: lembrete.automatico ?? false,
      ultima_acao: lembrete.historico?.length
        ? [...lembrete.historico].sort((a, b) => b.data.localeCompare(a.data))[0]
        : null,
    },
    created_at: dataLocalParaIso(lembrete.created_at),
    updated_at: dataLocalParaIso(lembrete.updated_at ?? lembrete.created_at),
  }
}

export async function mapearLembreteDoSupabase(
  row: LembreteRow,
  officeLocalId: string,
  historico: RegistroHistoricoLembrete[] = []
): Promise<LembreteCliente> {
  const candidatos = listarIdsLocaisCandidatos(row.local_id ? [row.local_id] : [])
  const localId = row.local_id?.trim()
    ? row.local_id
    : await localDeUuid(row.id, candidatos, 'lem', 'lembretes_pull')
  registrarMapeamentoId(localId, row.id, 'lembretes_pull')

  const meta = (row.metadata ?? {}) as {
    contato_legado?: LembreteCliente['contato']
    criado_por_id?: string
    criado_por_nome?: string
    automatico?: boolean
  }

  return {
    id: localId,
    office_id: officeLocalId,
    cliente_id: await localDeUuid(row.cliente_id, candidatos, 'cli', 'lembretes_pull_fk_customer'),
    moto_id: await localDeUuid(row.moto_id, candidatos, 'moto', 'lembretes_pull_fk_vehicle'),
    ordem_servico_id: row.ordem_servico_id
      ? await localDeUuid(row.ordem_servico_id, candidatos, 'os')
      : undefined,
    ordem_servico_numero: row.ordem_servico_numero ?? undefined,
    regra_id: row.regra_id ? await localDeUuid(row.regra_id, candidatos, 'regra') : undefined,
    servico: row.servico,
    data_prevista: row.data_prevista.slice(0, 10),
    km_prevista: row.km_prevista ?? undefined,
    km_base: row.km_base ?? undefined,
    mensagem: row.mensagem,
    observacoes: row.observacoes ?? undefined,
    personalizado: row.personalizado,
    status_fixo: (row.status_fixo as LembreteCliente['status_fixo']) ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    contato: meta.contato_legado ?? undefined,
    criado_por_id: meta.criado_por_id,
    criado_por_nome: meta.criado_por_nome,
    automatico: meta.automatico,
    historico,
  }
}

export async function mapearHistoricoParaSupabase(
  lembrete: LembreteCliente,
  registro: RegistroHistoricoLembrete,
  officeUuid: string
): Promise<LembreteHistoricoRow> {
  const id = await uuidDeLocal(registro.id)
  const lembreteUuid = await uuidDeLocal(lembrete.id)

  return {
    id,
    office_id: officeUuid,
    local_id: registro.id,
    lembrete_id: lembreteUuid,
    lembrete_local_id: lembrete.id,
    cliente_id: await uuidDeLocal(lembrete.cliente_id),
    moto_id: await uuidDeLocal(lembrete.moto_id),
    ordem_servico_id: await uuidOpcional(lembrete.ordem_servico_id),
    ordem_servico_numero: lembrete.ordem_servico_numero ?? null,
    servico: lembrete.servico,
    data: dataLocalParaIso(registro.data),
    tipo_acao: registro.tipo_acao,
    canal: registro.canal,
    mensagem: registro.mensagem ?? null,
    resultado: registro.resultado ?? null,
    responsavel: registro.responsavel,
    responsavel_nome: registro.responsavel,
    status_apos: registro.status_apos,
    observacao: registro.observacao ?? null,
    metadata: {},
    created_at: dataLocalParaIso(registro.data),
  }
}

export async function mapearHistoricoDoSupabase(
  row: LembreteHistoricoRow,
  officeLocalId: string
): Promise<{ lembreteLocalId: string; registro: RegistroHistoricoLembrete }> {
  void officeLocalId
  const candidatos = listarIdsLocaisCandidatos(
    [row.local_id, row.lembrete_local_id].filter(Boolean) as string[]
  )
  const registroLocalId = row.local_id?.trim()
    ? row.local_id
    : await localDeUuid(row.id, candidatos, 'hist', 'lembretes_historico_pull')
  registrarMapeamentoId(registroLocalId, row.id, 'lembretes_historico_pull')

  const lembreteLocalId = row.lembrete_local_id?.trim()
    ? row.lembrete_local_id
    : row.lembrete_id
      ? await localDeUuid(row.lembrete_id, candidatos, 'lem')
      : 'desconhecido'

  return {
    lembreteLocalId,
    registro: {
      id: registroLocalId,
      data: row.data,
      tipo_acao: row.tipo_acao as RegistroHistoricoLembrete['tipo_acao'],
      canal: row.canal as RegistroHistoricoLembrete['canal'],
      mensagem: row.mensagem ?? undefined,
      resultado: row.resultado as RegistroHistoricoLembrete['resultado'],
      responsavel: row.responsavel_nome ?? row.responsavel,
      status_apos: row.status_apos as RegistroHistoricoLembrete['status_apos'],
      observacao: row.observacao ?? undefined,
    },
  }
}
