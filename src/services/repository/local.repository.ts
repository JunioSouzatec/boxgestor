import { dadosIniciais } from '@/data/seed'
import { logBootstrap, logBootstrapReset } from '@/lib/bootstrap-debug'
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

function criarDatabaseVazioEmMemoria(officeId: string): CraftDatabase {
  return criarDatabaseMinimaOficina(officeId, {
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
}

export class LocalCraftRepository implements ICraftRepository {
  private getTenantStore(): TenantsPayload {
    return migrateLegacyStorage(loadTenants())
  }

  tenantExiste(officeId: string): boolean {
    const payload = loadTenants()
    return Boolean(payload.tenants[officeId])
  }

  carregar(officeId: string): CraftDatabase {
    const payload = this.getTenantStore()

    if (payload.tenants[officeId]) {
      const migrado = migrateDatabase(payload.tenants[officeId])
      logBootstrap('localStorage_carregar', {
        officeId,
        origem: 'localStorage',
        clientes: migrado.clientes.length,
        os: migrado.ordens_servico.length,
        nomeOficina: migrado.configuracao.nome,
      })
      return migrado
    }

    logBootstrap('localStorage_cache_ausente', {
      officeId,
      origem: 'memoria_placeholder',
      persistido: false,
    })
    return criarDatabaseVazioEmMemoria(officeId)
  }

  salvar(officeId: string, dados: CraftDatabase): void {
    const payload = this.getTenantStore()
    const existia = Boolean(payload.tenants[officeId])
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
    logBootstrap('localStorage_salvar', {
      officeId,
      origem: 'localStorage',
      tenantNovo: !existia,
      clientes: dados.clientes.length,
      os: dados.ordens_servico.length,
      nomeOficina: dados.configuracao.nome,
    })
  }

  resetar(officeId: string): CraftDatabase {
    const payload = this.getTenantStore()
    delete payload.tenants[officeId]
    saveTenants(payload)
    logBootstrapReset('tenant_removido', { officeId })
    return criarDatabaseVazioEmMemoria(officeId)
  }
}

export const localCraftRepository = new LocalCraftRepository()
