import { dadosIniciais } from '@/data/seed'
import {
  criarDatabaseMinimaOficina,
  migrateDatabase,
} from '@/services/database-migration.service'
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
      const migrado = migrateDatabase(payload.tenants[officeId])
      payload.tenants[officeId] = migrado
      saveTenants(payload)
      return migrado
    }

    const database = criarDatabaseMinimaOficina(officeId, {
      id: officeId,
      oficina_id: officeId,
      office_id: officeId,
      nome: '',
      endereco: '',
      telefone: '',
      preferencias: {
        tema_escuro: true,
        notificacoes: true,
        alerta_estoque_baixo: true,
        cadastro_limpo: true,
      },
    })
    payload.tenants[officeId] = database
    saveTenants(payload)
    return database
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
