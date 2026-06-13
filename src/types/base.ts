/**
 * Campos base preparados para Supabase / SaaS multi-oficina.
 * Mantém aliases legados (oficina_id, criado_em, atualizado_em) para compatibilidade.
 */

export interface BaseEntity {
  id: string
}

export interface TenantScoped {
  /** Tenant legado — preferir office_id em integrações futuras */
  oficina_id: string
  /** Identificador da oficina (tenant) — espelha oficina_id após migração */
  office_id?: string
}

export interface Timestamped {
  /** Data de criação legada (YYYY-MM-DD) */
  criado_em?: string
  /** ISO 8601 — espelha criado_em após migração */
  created_at?: string
  /** Data de atualização legada (YYYY-MM-DD) */
  atualizado_em?: string
  /** ISO 8601 — espelha atualizado_em após migração */
  updated_at?: string
}

export type TenantEntity = BaseEntity & TenantScoped

export type TenantTimestampedEntity = TenantEntity & Timestamped

/** Alias semântico para integração Supabase */
export type OfficeScoped = TenantScoped

export const OFFICE_ID = 'oficina-craft-001' as const

/** @deprecated Preferir OFFICE_ID */
export const OFICINA_ID = OFFICE_ID

export const STORAGE_KEY = 'craft_database_v1'
