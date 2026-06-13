import { dadosIniciais } from '@/data/seed'
import { migrateDatabase } from '@/services/database-migration.service'
import type { ICraftRepository } from '@/services/repository/types'
import type { CraftDatabase } from '@/types/database'
import { OFFICE_ID, STORAGE_KEY } from '@/types/base'

export const TENANTS_STORAGE_KEY = 'craft_tenants_v1'

interface TenantsPayload {
  version: 1
  tenants: Record<string, CraftDatabase>
}

function loadTenants(): TenantsPayload {
  try {
    const raw = localStorage.getItem(TENANTS_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as TenantsPayload
  } catch {
    /* migração abaixo */
  }
  return { version: 1, tenants: {} }
}

function saveTenants(payload: TenantsPayload): void {
  localStorage.setItem(TENANTS_STORAGE_KEY, JSON.stringify(payload))
}

function migrateLegacyStorage(payload: TenantsPayload): TenantsPayload {
  if (payload.tenants[OFFICE_ID]) return payload

  try {
    const legacyRaw = localStorage.getItem(STORAGE_KEY)
    if (legacyRaw) {
      payload.tenants[OFFICE_ID] = migrateDatabase(JSON.parse(legacyRaw) as CraftDatabase)
      saveTenants(payload)
      return payload
    }
  } catch {
    /* seed abaixo */
  }

  if (Object.keys(payload.tenants).length === 0) {
    payload.tenants[OFFICE_ID] = migrateDatabase(structuredClone(dadosIniciais))
    saveTenants(payload)
  }

  return payload
}

export class LocalCraftRepository implements ICraftRepository {
  private getTenantStore(): TenantsPayload {
    return migrateLegacyStorage(loadTenants())
  }

  carregar(officeId: string): CraftDatabase {
    const payload = this.getTenantStore()

    if (payload.tenants[officeId]) {
      return migrateDatabase(payload.tenants[officeId])
    }

    const inicial = migrateDatabase(structuredClone(dadosIniciais))
    inicial.configuracao = {
      ...inicial.configuracao,
      id: officeId,
      oficina_id: officeId,
      office_id: officeId,
    }

    inicial.clientes = inicial.clientes.map((item) => ({
      ...item,
      oficina_id: officeId,
      office_id: officeId,
    }))
    inicial.motos = inicial.motos.map((item) => ({
      ...item,
      oficina_id: officeId,
      office_id: officeId,
    }))
    inicial.ordens_servico = inicial.ordens_servico.map((item) => ({
      ...item,
      oficina_id: officeId,
      office_id: officeId,
    }))
    inicial.pecas = inicial.pecas.map((item) => ({
      ...item,
      oficina_id: officeId,
      office_id: officeId,
    }))
    inicial.lancamentos = inicial.lancamentos.map((item) => ({
      ...item,
      oficina_id: officeId,
      office_id: officeId,
    }))
    inicial.agendamentos = inicial.agendamentos.map((item) => ({
      ...item,
      oficina_id: officeId,
      office_id: officeId,
    }))

    payload.tenants[officeId] = inicial
    saveTenants(payload)
    return inicial
  }

  salvar(officeId: string, dados: CraftDatabase): void {
    const payload = this.getTenantStore()
    payload.tenants[officeId] = migrateDatabase({
      ...dados,
      configuracao: {
        ...dados.configuracao,
        id: officeId,
        oficina_id: officeId,
        office_id: officeId,
      },
    })
    saveTenants(payload)
  }

  resetar(officeId: string): CraftDatabase {
    const payload = this.getTenantStore()
    delete payload.tenants[officeId]
    saveTenants(payload)
    return this.carregar(officeId)
  }
}

export const localCraftRepository = new LocalCraftRepository()
