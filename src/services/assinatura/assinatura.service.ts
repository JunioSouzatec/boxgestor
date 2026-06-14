import { OFFICE_ID } from '@/types/base'
import type { AssinaturaOffice, PlanoTier, PlanoTierArmazenado } from '@/types/plano'
import { normalizarPlanoTier, TRIAL_DIAS } from '@/types/plano'

export const ASSINATURA_STORAGE_KEY = 'craft_assinaturas_v1'

interface AssinaturasStore {
  version: 1
  assinaturas: Record<string, AssinaturaOffice>
}

function migrarAssinatura(raw: AssinaturaOffice): AssinaturaOffice {
  const plano = normalizarPlanoTier(raw.plano)
  const assinatura: AssinaturaOffice = {
    ...raw,
    plano,
    trial_inicio_em:
      plano === 'trial'
        ? raw.trial_inicio_em ?? raw.updated_at ?? new Date().toISOString()
        : raw.trial_inicio_em,
  }
  return assinatura
}

function loadStore(): AssinaturasStore {
  try {
    const raw = localStorage.getItem(ASSINATURA_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AssinaturasStore
      let alterou = false
      for (const [id, assinatura] of Object.entries(parsed.assinaturas)) {
        const migrada = migrarAssinatura(assinatura)
        if (migrada.plano !== assinatura.plano || migrada.trial_inicio_em !== assinatura.trial_inicio_em) {
          parsed.assinaturas[id] = migrada
          alterou = true
        }
      }
      if (alterou) saveStore(parsed)
      return parsed
    }
  } catch {
    /* seed abaixo */
  }

  const agora = new Date().toISOString()
  const store: AssinaturasStore = {
    version: 1,
    assinaturas: {
      [OFFICE_ID]: {
        office_id: OFFICE_ID,
        plano: 'professional',
        updated_at: agora,
      },
    },
  }
  localStorage.setItem(ASSINATURA_STORAGE_KEY, JSON.stringify(store))
  return store
}

function saveStore(store: AssinaturasStore): void {
  localStorage.setItem(ASSINATURA_STORAGE_KEY, JSON.stringify(store))
  window.dispatchEvent(new CustomEvent('craft-assinatura-updated'))
}

export class AssinaturaService {
  obterAssinatura(officeId: string): AssinaturaOffice {
    const store = loadStore()
    const existente = store.assinaturas[officeId]
    if (existente) {
      return migrarAssinatura(existente)
    }

    const agora = new Date().toISOString()
    const assinatura: AssinaturaOffice = {
      office_id: officeId,
      plano: 'trial',
      updated_at: agora,
      trial_inicio_em: agora,
    }
    store.assinaturas[officeId] = assinatura
    saveStore(store)
    return assinatura
  }

  definirPlano(officeId: string, plano: PlanoTierArmazenado | PlanoTier): AssinaturaOffice {
    const store = loadStore()
    const tier = normalizarPlanoTier(plano)
    const anterior = store.assinaturas[officeId]
    const agora = new Date().toISOString()

    const assinatura: AssinaturaOffice = {
      office_id: officeId,
      plano: tier,
      updated_at: agora,
      trial_inicio_em:
        tier === 'trial'
          ? anterior?.trial_inicio_em ?? agora
          : anterior?.trial_inicio_em,
    }
    store.assinaturas[officeId] = assinatura
    saveStore(store)
    return assinatura
  }

  /** Simula upgrade/downgrade — sem pagamento real */
  simularUpgrade(officeId: string, plano: PlanoTierArmazenado | PlanoTier): AssinaturaOffice {
    return this.definirPlano(officeId, plano)
  }

  listarAssinaturas(): AssinaturaOffice[] {
    const store = loadStore()
    return Object.values(store.assinaturas).map(migrarAssinatura)
  }

  /** Estende o teste Premium movendo a data de início para trás. */
  estenderTrial(officeId: string, diasExtra = 7): AssinaturaOffice {
    const store = loadStore()
    const anterior = store.assinaturas[officeId] ?? this.obterAssinatura(officeId)
    const agora = new Date()
    const inicioAtual = new Date(anterior.trial_inicio_em ?? anterior.updated_at)
    inicioAtual.setDate(inicioAtual.getDate() - diasExtra)

    const assinatura: AssinaturaOffice = {
      ...anterior,
      office_id: officeId,
      plano: 'trial',
      updated_at: agora.toISOString(),
      trial_inicio_em: inicioAtual.toISOString(),
    }
    store.assinaturas[officeId] = assinatura
    saveStore(store)
    return assinatura
  }

  /** Encerra o teste Premium imediatamente (mantém plano trial, bloqueia escrita). */
  encerrarTrial(officeId: string): AssinaturaOffice {
    const store = loadStore()
    const anterior = store.assinaturas[officeId] ?? this.obterAssinatura(officeId)
    const agora = new Date()
    const inicioExpirado = new Date(agora)
    inicioExpirado.setDate(inicioExpirado.getDate() - TRIAL_DIAS - 1)

    const assinatura: AssinaturaOffice = {
      ...anterior,
      office_id: officeId,
      plano: 'trial',
      updated_at: agora.toISOString(),
      trial_inicio_em: inicioExpirado.toISOString(),
    }
    store.assinaturas[officeId] = assinatura
    saveStore(store)
    return assinatura
  }

  /** Reinicia teste Premium com 7 dias a partir de agora. */
  reiniciarTrial(officeId: string): AssinaturaOffice {
    const store = loadStore()
    const agora = new Date().toISOString()
    const assinatura: AssinaturaOffice = {
      office_id: officeId,
      plano: 'trial',
      updated_at: agora,
      trial_inicio_em: agora,
    }
    store.assinaturas[officeId] = assinatura
    saveStore(store)
    return assinatura
  }
}

export const assinaturaService = new AssinaturaService()
