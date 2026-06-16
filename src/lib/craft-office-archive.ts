import type { OfficeRow } from '@/services/auth/supabase-auth-safe.service'

export function oficinaEstaArquivada(office: Pick<OfficeRow, 'archived_at'> | null | undefined): boolean {
  return Boolean(office?.archived_at)
}
