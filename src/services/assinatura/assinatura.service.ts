import { OFFICE_ID } from '@/types/base'
import type { AssinaturaOffice, PlanoTier, PlanoTierArmazenado } from '@/types/plano'
import {
  calcularTrialFimAPartirDe,
  normalizarExtraUsersCount,
  normalizarPlanoTier,
  obterTrialFimEm,
} from '@/types/plano'

export const ASSINATURA_STORAGE_KEY = 'craft_assinaturas_v1'

interface AssinaturasStore {
  version: 1
  assinaturas: Record<string, AssinaturaOffice>
}

function migrarAssinatura(raw: AssinaturaOffice): AssinaturaOffice {
  const plano = normalizarPlanoTier(raw.plano)
  const inicio =
    plano === 'trial'
      ? raw.trial_inicio_em ?? raw.updated_at ?? new Date().toISOString()
      : raw.trial_inicio_em

  const assinatura: AssinaturaOffice = {
    ...raw,
    plano,
    extra_users_count: normalizarExtraUsersCount(raw.extra_users_count),
    trial_inicio_em: inicio,
    trial_fim_em:
      plano === 'trial'
        ? raw.trial_fim_em ?? (inicio ? calcularTrialFimAPartirDe(inicio) : undefined)
        : raw.trial_fim_em,
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
        if (
          migrada.plano !== assinatura.plano ||
          migrada.trial_inicio_em !== assinatura.trial_inicio_em ||
          migrada.trial_fim_em !== assinatura.trial_fim_em ||
          migrada.extra_users_count !== assinatura.extra_users_count
        ) {
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

function criarTrialNovo(officeId: string, agoraIso: string): AssinaturaOffice {
  return {
    office_id: officeId,
    plano: 'trial',
    updated_at: agoraIso,
    trial_inicio_em: agoraIso,
    trial_fim_em: calcularTrialFimAPartirDe(agoraIso),
  }
}

export class AssinaturaService {
  obterAssinatura(officeId: string): AssinaturaOffice {
    const store = loadStore()
    const existente = store.assinaturas[officeId]
    if (existente) {
      return migrarAssinatura(existente)
    }

    const agora = new Date().toISOString()
    const assinatura = criarTrialNovo(officeId, agora)
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
      extra_users_count: anterior?.extra_users_count ?? 0,
      trial_inicio_em:
        tier === 'trial'
          ? anterior?.trial_inicio_em ?? agora
          : anterior?.trial_inicio_em,
      trial_fim_em:
        tier === 'trial'
          ? anterior?.trial_fim_em ??
            calcularTrialFimAPartirDe(anterior?.trial_inicio_em ?? agora)
          : anterior?.trial_fim_em,
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

  /** Estende o teste Premium adicionando dias à data de fim atual (ou a partir de hoje se expirado). */
  estenderTrial(officeId: string, diasExtra = 7): AssinaturaOffice {
    const store = loadStore()
    const anterior = migrarAssinatura(
      store.assinaturas[officeId] ?? this.obterAssinatura(officeId)
    )
    const agora = new Date()
    const fimAtual = new Date(obterTrialFimEm(anterior))
    const novoFim = new Date(
      fimAtual.getTime() >= agora.getTime() ? fimAtual : agora
    )
    novoFim.setDate(novoFim.getDate() + diasExtra)

    const assinatura: AssinaturaOffice = {
      ...anterior,
      office_id: officeId,
      plano: 'trial',
      updated_at: agora.toISOString(),
      trial_inicio_em: anterior.trial_inicio_em ?? agora.toISOString(),
      trial_fim_em: novoFim.toISOString(),
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
    const fimEncerrado = new Date(agora)
    fimEncerrado.setDate(fimEncerrado.getDate() - 1)

    const assinatura: AssinaturaOffice = {
      ...anterior,
      office_id: officeId,
      plano: 'trial',
      updated_at: agora.toISOString(),
      trial_fim_em: fimEncerrado.toISOString(),
    }
    store.assinaturas[officeId] = assinatura
    saveStore(store)
    return assinatura
  }

  /** Reinicia teste Premium com 7 dias a partir de agora. */
  reiniciarTrial(officeId: string): AssinaturaOffice {
    const store = loadStore()
    const agora = new Date().toISOString()
    const assinatura = criarTrialNovo(officeId, agora)
    store.assinaturas[officeId] = assinatura
    saveStore(store)
    return assinatura
  }

  /** Atualiza cache local a partir do Supabase (produção online). */
  aplicarAssinaturaRemota(officeId: string, assinatura: AssinaturaOffice): AssinaturaOffice {
    const store = loadStore()
    const anterior = store.assinaturas[officeId]
    const migrada = migrarAssinatura({
      ...anterior,
      ...assinatura,
      office_id: officeId,
      extra_users_count:
        assinatura.extra_users_count ?? anterior?.extra_users_count ?? 0,
    })
    store.assinaturas[officeId] = migrada
    saveStore(store)
    return migrada
  }

  definirExtraUsersCount(officeId: string, count: number): AssinaturaOffice {
    const store = loadStore()
    const anterior = migrarAssinatura(
      store.assinaturas[officeId] ?? this.obterAssinatura(officeId)
    )
    const assinatura: AssinaturaOffice = {
      ...anterior,
      extra_users_count: normalizarExtraUsersCount(count),
      updated_at: new Date().toISOString(),
    }
    store.assinaturas[officeId] = assinatura
    saveStore(store)
    return assinatura
  }
}

export const assinaturaService = new AssinaturaService()
