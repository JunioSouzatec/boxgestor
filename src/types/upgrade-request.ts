import type { PlanoTier } from '@/types/plano'

export type UpgradeRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface UpgradeRequest {
  id: string
  office_id: string
  office_nome: string
  requested_by: string
  requested_by_nome: string
  requested_by_email: string
  current_plan: PlanoTier
  requested_plan: PlanoTier
  status: UpgradeRequestStatus
  note?: string
  created_at: string
  decided_at?: string
  decided_by?: string
  decided_by_nome?: string
}

export const STATUS_UPGRADE_LABEL: Record<UpgradeRequestStatus, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Recusado',
  cancelled: 'Cancelado',
}

export function badgeVariantUpgradeStatus(
  status: UpgradeRequestStatus
): 'warning' | 'success' | 'destructive' | 'secondary' {
  switch (status) {
    case 'pending':
      return 'warning'
    case 'approved':
      return 'success'
    case 'rejected':
      return 'destructive'
    case 'cancelled':
      return 'secondary'
  }
}
