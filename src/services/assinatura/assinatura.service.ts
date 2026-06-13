import { OFFICE_ID } from '@/types/base'
import type { AssinaturaOffice, PlanoTier } from '@/types/plano'

export const ASSINATURA_STORAGE_KEY = 'craft_assinaturas_v1'

interface AssinaturasStore {
  version: 1
  assinaturas: Record<string, AssinaturaOffice>
}

function loadStore(): AssinaturasStore {
  try {
    const raw = localStorage.getItem(ASSINATURA_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as AssinaturasStore
  } catch {
    /* seed abaixo */
  }

  const agora = new Date().toISOString()
  const store: AssinaturasStore = {
    version: 1,
    assinaturas: {
      [OFFICE_ID]: {
        office_id: OFFICE_ID,
        plano: 'premium',
        updated_at: agora,
      },
    },
  }
  localStorage.setItem(ASSINATURA_STORAGE_KEY, JSON.stringify(store))
  return store
}

function saveStore(store: AssinaturasStore): void {
  localStorage.setItem(ASSINATURA_STORAGE_KEY, JSON.stringify(store))
}

export class AssinaturaService {
  obterAssinatura(officeId: string): AssinaturaOffice {
    const store = loadStore()
    if (store.assinaturas[officeId]) return store.assinaturas[officeId]

    const assinatura: AssinaturaOffice = {
      office_id: officeId,
      plano: 'free',
      updated_at: new Date().toISOString(),
    }
    store.assinaturas[officeId] = assinatura
    saveStore(store)
    return assinatura
  }

  definirPlano(officeId: string, plano: PlanoTier): AssinaturaOffice {
    const store = loadStore()
    const assinatura: AssinaturaOffice = {
      office_id: officeId,
      plano,
      updated_at: new Date().toISOString(),
    }
    store.assinaturas[officeId] = assinatura
    saveStore(store)
    return assinatura
  }

  /** Simula upgrade/downgrade — sem pagamento real */
  simularUpgrade(officeId: string, plano: PlanoTier): AssinaturaOffice {
    return this.definirPlano(officeId, plano)
  }
}

export const assinaturaService = new AssinaturaService()
