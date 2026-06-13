import type { Timestamped, TenantScoped } from '@/types/base'

function isoNow(): string {
  return new Date().toISOString()
}

function dateOnly(iso?: string): string {
  return (iso ?? isoNow()).slice(0, 10)
}

/** Normaliza campos tenant e timestamps para compatibilidade Supabase */
export function normalizeTenantScoped<T extends TenantScoped>(entity: T): T {
  const officeId = entity.office_id ?? entity.oficina_id
  return {
    ...entity,
    oficina_id: entity.oficina_id ?? officeId,
    office_id: officeId,
  }
}

export function normalizeTimestamps<T extends Timestamped>(
  entity: T,
  fallbackDate?: string
): T {
  const base = fallbackDate ?? dateOnly()
  const created = entity.created_at ?? entity.criado_em ?? base
  const updated = entity.updated_at ?? entity.atualizado_em ?? created
  return {
    ...entity,
    criado_em: entity.criado_em ?? dateOnly(created),
    created_at: created,
    atualizado_em: entity.atualizado_em ?? dateOnly(updated),
    updated_at: updated,
  }
}

export function normalizeTenantTimestamps<T extends TenantScoped & Timestamped>(
  entity: T,
  fallbackDate?: string
): T {
  return normalizeTimestamps(normalizeTenantScoped(entity), fallbackDate)
}

export function stampCreate<T extends TenantScoped & Timestamped>(
  entity: T,
  officeId: string
): T {
  const now = isoNow()
  return normalizeTenantTimestamps({
    ...entity,
    oficina_id: officeId,
    office_id: officeId,
    criado_em: dateOnly(now),
    created_at: now,
    updated_at: now,
  })
}

export function stampUpdate<T extends Timestamped>(entity: T): T {
  const now = isoNow()
  return normalizeTimestamps({
    ...entity,
    atualizado_em: dateOnly(now),
    updated_at: now,
  })
}
