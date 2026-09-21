import { isUuidFormato } from '@/lib/local-id-uuid'
import type { Agendamento } from '@/types/agendamento'
import type { CraftDatabase } from '@/types/database'

/** FKs técnicas cruas da row remota `appointments` — UUIDs, não aliases reverse-mapped. */
export interface AgendaFksTecnicasRemotas {
  customer_id: string | null
  motorcycle_id: string | null
  service_order_id?: string | null
}

/** Payload mapeado confirmado após upsert ok — só refs técnicas. */
export interface AgendaRefsTecnicasConfirmadas {
  appointmentId: string
  customerId: string
  motorcycleId: string
  serviceOrderId?: string | null
}

export function uuidTecnicoAgenda(valor: string | null | undefined): string | undefined {
  const t = valor?.trim()
  if (!t || !isUuidFormato(t)) return undefined
  return t
}

export function fksTecnicasDeAppointmentRow(row: {
  customer_id: string | null
  motorcycle_id: string | null
  service_order_id?: string | null
}): AgendaFksTecnicasRemotas {
  return {
    customer_id: row.customer_id,
    motorcycle_id: row.motorcycle_id,
    service_order_id: row.service_order_id ?? null,
  }
}

export function indexarFksTecnicasPorAppointmentId(
  rows: Array<{
    id: string
    customer_id: string | null
    motorcycle_id: string | null
    service_order_id?: string | null
  }>
): Record<string, AgendaFksTecnicasRemotas> {
  const out: Record<string, AgendaFksTecnicasRemotas> = {}
  for (const row of rows) {
    const id = row.id?.trim()
    if (!id) continue
    // Guest: sem FKs técnicas — não indexa para reparo/canon.
    if (!uuidTecnicoAgenda(row.customer_id) || !uuidTecnicoAgenda(row.motorcycle_id)) continue
    out[id] = fksTecnicasDeAppointmentRow(row)
  }
  return out
}

/**
 * OS do mesmo appointment remoto só entra se for UUID e o local
 * não tiver outro UUID válido diferente. Não inventa vínculo novo.
 *
 * - local UUID ≠ remote UUID → mantém o local (vínculo explícito)
 * - remote UUID e local vazio/alias/não-UUID → usa o remoto da MESMA row
 * - remote vazio → mantém o local como está
 */
export function decidirServiceOrderIdTecnico(
  localOs: string | null | undefined,
  remotoOs: string | null | undefined
): string | undefined {
  const local = localOs?.trim() || ''
  const remoto = remotoOs?.trim() || ''
  const localUuid = uuidTecnicoAgenda(local)
  const remotoUuid = uuidTecnicoAgenda(remoto)

  if (localUuid && remotoUuid && localUuid !== remotoUuid) return localUuid
  if (remotoUuid) return remotoUuid
  return local || undefined
}

export function indiceFksTecnicasDoSelect(remoto: {
  dados?: Array<Pick<Agendamento, 'id' | 'cliente_id' | 'moto_id' | 'ordem_servico_id'>> | null
  fksTecnicasPorId?: Record<string, AgendaFksTecnicasRemotas>
}): Map<string, AgendaFksTecnicasRemotas> {
  const map = new Map<string, AgendaFksTecnicasRemotas>()
  for (const [id, fks] of Object.entries(remoto.fksTecnicasPorId ?? {})) {
    const chave = id.trim()
    if (!chave) continue
    map.set(chave, fks)
  }
  for (const ag of remoto.dados ?? []) {
    if (map.has(ag.id)) continue
    const customer = uuidTecnicoAgenda(ag.cliente_id)
    const motorcycle = uuidTecnicoAgenda(ag.moto_id)
    if (!customer || !motorcycle) continue
    map.set(ag.id, {
      customer_id: customer,
      motorcycle_id: motorcycle,
      service_order_id: ag.ordem_servico_id ?? null,
    })
  }
  return map
}

/**
 * Reparo SOMENTE de referências técnicas da MESMA row remota.
 * Preserva serviço/data/hora/status/notas/deleted_at/created_at/updated_at.
 * Sem row remota do mesmo id → devolve o local intacto (mapper/registry seguem).
 */
export function repararFksTecnicasAgendaPorMesmoId(
  local: Agendamento,
  remoto: AgendaFksTecnicasRemotas | undefined
): Agendamento {
  if (!remoto) return local
  const customer = uuidTecnicoAgenda(remoto.customer_id)
  const motorcycle = uuidTecnicoAgenda(remoto.motorcycle_id)
  const os = decidirServiceOrderIdTecnico(local.ordem_servico_id, remoto.service_order_id)
  if (!customer && !motorcycle && (os ?? '') === (local.ordem_servico_id?.trim() || '')) {
    return local
  }
  return {
    ...local,
    ...(customer ? { cliente_id: customer } : {}),
    ...(motorcycle ? { moto_id: motorcycle } : {}),
    ordem_servico_id: os,
  }
}

export function refsTecnicasConfirmadasParaCanon(
  fkIds: AgendaRefsTecnicasConfirmadas[] | undefined,
  enviadosReparados: Agendamento[]
): AgendaRefsTecnicasConfirmadas[] {
  if (fkIds && fkIds.length > 0) {
    return fkIds.filter(
      (ref) =>
        Boolean(uuidTecnicoAgenda(ref.customerId)) &&
        Boolean(uuidTecnicoAgenda(ref.motorcycleId))
    )
  }
  const out: AgendaRefsTecnicasConfirmadas[] = []
  for (const ag of enviadosReparados) {
    const customer = uuidTecnicoAgenda(ag.cliente_id)
    const motorcycle = uuidTecnicoAgenda(ag.moto_id)
    if (!customer || !motorcycle) continue
    out.push({
      appointmentId: ag.id,
      customerId: customer,
      motorcycleId: motorcycle,
      serviceOrderId: ag.ordem_servico_id ?? null,
    })
  }
  return out
}

/**
 * Atualiza só cliente_id / moto_id / ordem_servico_id no repo.
 * Sem bump de updated_at — campos funcionais ficam iguais.
 */
export function aplicarRefsTecnicasMapeadasNoRepo(
  db: CraftDatabase,
  refs: AgendaRefsTecnicasConfirmadas[]
): CraftDatabase {
  if (refs.length === 0) return db
  const porId = new Map(refs.map((ref) => [ref.appointmentId, ref]))
  let mudou = false
  const agendamentos = db.agendamentos.map((ag) => {
    const ref = porId.get(ag.id)
    if (!ref) return ag
    const customer = uuidTecnicoAgenda(ref.customerId)
    const motorcycle = uuidTecnicoAgenda(ref.motorcycleId)
    if (!customer || !motorcycle) return ag
    const os = decidirServiceOrderIdTecnico(ag.ordem_servico_id, ref.serviceOrderId)
    if (
      ag.cliente_id === customer &&
      ag.moto_id === motorcycle &&
      (ag.ordem_servico_id ?? '') === (os ?? '')
    ) {
      return ag
    }
    mudou = true
    return {
      ...ag,
      cliente_id: customer,
      moto_id: motorcycle,
      ordem_servico_id: os,
    }
  })
  if (!mudou) return db
  return { ...db, agendamentos }
}

export function gravarRefsTecnicasAgendaAposPushOk(
  officeId: string,
  refs: AgendaRefsTecnicasConfirmadas[],
  carregar: (officeId: string) => CraftDatabase,
  salvar: (officeId: string, db: CraftDatabase) => void
): void {
  if (refs.length === 0) return
  const repo = carregar(officeId)
  const next = aplicarRefsTecnicasMapeadasNoRepo(repo, refs)
  if (next === repo) return
  salvar(officeId, next)
}
