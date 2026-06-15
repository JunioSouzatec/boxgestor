import { AUTH_STORAGE_KEY } from '@/services/auth/local-auth.service'
import { ASSINATURA_STORAGE_KEY } from '@/services/assinatura/assinatura.service'
import { TENANTS_STORAGE_KEY } from '@/services/repository/local.repository'
import { localCraftRepository } from '@/services/repository/local.repository'
import { assinaturaService } from '@/services/assinatura/assinatura.service'
import { listarOficinasSupabaseAdmin } from '@/services/assinatura/office-registry-supabase.service'
import {
  adminUsaSupabaseRemoto,
  logErroAdmin,
  MENSAGEM_ERRO_ADMIN_SUPABASE,
  permitirFallbackLocalAdmin,
} from '@/lib/admin-env'
import { obterNomeExibidoOficina } from '@/lib/oficina-marca'
import type { AuthUser } from '@/types/auth'
import type { AssinaturaOffice, PlanoTier } from '@/types/plano'
import {
  diasRestantesTrial,
  normalizarPlanoTier,
  obterTrialFimEm,
  testePremiumAtivo,
  testePremiumExpirado,
} from '@/types/plano'

export interface OficinaRegistro {
  office_id: string
  nome: string
  plano: PlanoTier
  assinatura: AssinaturaOffice
  status: 'ativa' | 'teste' | 'teste_expirado'
  telefone?: string
  dono_nome?: string
  dono_email?: string
  criado_em?: string
  dias_restantes_teste: number | null
  trial_inicio_em?: string
  trial_fim_em?: string
}

function coletarOfficeIds(): string[] {
  const ids = new Set<string>()

  try {
    const tenantsRaw = localStorage.getItem(TENANTS_STORAGE_KEY)
    if (tenantsRaw) {
      const payload = JSON.parse(tenantsRaw) as { tenants?: Record<string, unknown> }
      Object.keys(payload.tenants ?? {}).forEach((id) => ids.add(id))
    }
  } catch {
    /* ignore */
  }

  try {
    const assRaw = localStorage.getItem(ASSINATURA_STORAGE_KEY)
    if (assRaw) {
      const payload = JSON.parse(assRaw) as { assinaturas?: Record<string, unknown> }
      Object.keys(payload.assinaturas ?? {}).forEach((id) => ids.add(id))
    }
  } catch {
    /* ignore */
  }

  try {
    const authRaw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (authRaw) {
      const payload = JSON.parse(authRaw) as { users?: AuthUser[] }
      for (const user of payload.users ?? []) {
        if (user.office_id) ids.add(user.office_id)
      }
    }
  } catch {
    /* ignore */
  }

  return Array.from(ids)
}

function carregarUsuariosAuth(): AuthUser[] {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return []
    const payload = JSON.parse(raw) as { users?: AuthUser[] }
    return payload.users ?? []
  } catch {
    return []
  }
}

function obterDonoOficina(officeId: string, usuarios: AuthUser[]): AuthUser | undefined {
  return usuarios.find((u) => u.office_id === officeId && u.papel === 'dono' && u.ativo !== false)
}

function calcularFimTrial(assinatura: AssinaturaOffice): string | undefined {
  if (normalizarPlanoTier(assinatura.plano) !== 'trial') return undefined
  return obterTrialFimEm(assinatura)
}

function resolverStatus(assinatura: AssinaturaOffice): OficinaRegistro['status'] {
  if (testePremiumExpirado(assinatura)) return 'teste_expirado'
  if (testePremiumAtivo(assinatura)) return 'teste'
  return 'ativa'
}

export class OfficeRegistryService {
  listarOficinas(): OficinaRegistro[] {
    const usuarios = carregarUsuariosAuth()
    const officeIds = coletarOfficeIds()

    return officeIds
      .map((officeId) => {
        let config
        try {
          config = localCraftRepository.carregar(officeId).configuracao
        } catch {
          config = undefined
        }

        const assinatura = assinaturaService.obterAssinatura(officeId)
        const plano = normalizarPlanoTier(assinatura.plano)
        const dono = obterDonoOficina(officeId, usuarios)

        return {
          office_id: officeId,
          nome: config ? obterNomeExibidoOficina(config) : officeId,
          plano,
          assinatura,
          status: resolverStatus(assinatura),
          dono_nome: dono?.nome,
          dono_email: dono?.email,
          telefone: config?.telefone ?? config?.whatsapp,
          criado_em: config?.created_at ?? dono?.created_at ?? assinatura.updated_at,
          dias_restantes_teste: diasRestantesTrial(assinatura),
          trial_inicio_em: assinatura.trial_inicio_em,
          trial_fim_em: calcularFimTrial(assinatura),
        } satisfies OficinaRegistro
      })
      .sort((a, b) => {
        const da = a.criado_em ? new Date(a.criado_em).getTime() : 0
        const db = b.criado_em ? new Date(b.criado_em).getTime() : 0
        return db - da
      })
  }

  /** Produção online: lista oficinas reais do Supabase. Sem fallback local em produção. */
  async listarOficinasAsync(): Promise<{
    oficinas: OficinaRegistro[]
    fonte: 'supabase' | 'local'
    erroRemoto?: string
  }> {
    if (adminUsaSupabaseRemoto()) {
      try {
        const remoto = await listarOficinasSupabaseAdmin()
        return { oficinas: remoto, fonte: 'supabase' }
      } catch (err) {
        logErroAdmin('admin_list_offices', err)
        return {
          oficinas: [],
          fonte: 'supabase',
          erroRemoto: MENSAGEM_ERRO_ADMIN_SUPABASE,
        }
      }
    }

    if (permitirFallbackLocalAdmin()) {
      return { oficinas: this.listarOficinas(), fonte: 'local' }
    }

    return { oficinas: [], fonte: 'local' }
  }

  obterOficina(officeId: string): OficinaRegistro | undefined {
    return this.listarOficinas().find((o) => o.office_id === officeId)
  }
}

export const officeRegistryService = new OfficeRegistryService()
