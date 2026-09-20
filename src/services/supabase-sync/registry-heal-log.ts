import { ehAmbienteHomologacao } from '@/lib/app-versao'

/** Aliases e UUIDs técnicos do caso 18f59 — sem PII. */
export const HEAL_CLI_LOCAL = 'cli-4d0684fa'
export const HEAL_MOTO_LOCAL = 'moto-9bfe2738'
export const HEAL_CUSTOMER_REAL = '4d0684fa-acc3-55a6-8430-97e83187d2b8'
export const HEAL_MOTO_REAL = '9bfe2738-d569-516f-bc87-f4abb8ce91c6'
export const HEAL_HASH_CLI = '08da8694-07f8-5a7c-9174-607b142d8af4'
export const HEAL_HASH_MOTO = '2e3c80ad-b639-5f4c-bf98-bd4659b7da33'

const IDS_OBSERVADOS = new Set([
  HEAL_CLI_LOCAL,
  HEAL_MOTO_LOCAL,
  HEAL_CUSTOMER_REAL,
  HEAL_MOTO_REAL,
  HEAL_HASH_CLI,
  HEAL_HASH_MOTO,
])

let healCustomerExecutou = false
let healVehicleExecutou = false

export function logRegistryHealAtivo(): boolean {
  try {
    const url = String(import.meta.env?.VITE_SUPABASE_URL ?? '')
    return ehAmbienteHomologacao(url)
  } catch {
    return false
  }
}

export function idRegistryObservado(id: string | undefined | null): boolean {
  const t = id?.trim() ?? ''
  return t.length > 0 && IDS_OBSERVADOS.has(t)
}

export function resetarExecucaoHealRegistry(): void {
  healCustomerExecutou = false
  healVehicleExecutou = false
}

export function marcarHealCustomerExecutou(): void {
  healCustomerExecutou = true
}

export function marcarHealVehicleExecutou(): void {
  healVehicleExecutou = true
}

export function logRegistryHeal(detalhe: Record<string, unknown>): void {
  if (!logRegistryHealAtivo()) return
  console.info('[BoxGestor Registry Heal]', detalhe)
}

export function logRegistryWrite(detalhe: Record<string, unknown>): void {
  if (!logRegistryHealAtivo()) return
  console.info('[BoxGestor Registry Write]', detalhe)
}

export function logRegistryGuard(detalhe: Record<string, unknown>): void {
  if (!logRegistryHealAtivo()) return
  console.info('[BoxGestor Registry Guard]', detalhe)
}

export function logResumoExecucaoHeal(evento: string, motivoSkip?: string): void {
  if (!logRegistryHealAtivo()) return
  console.info('[BoxGestor Registry Heal]', {
    etapa: 'resumo',
    evento,
    'HEAL CUSTOMER EXECUTOU': healCustomerExecutou ? 'sim' : 'nao',
    'HEAL VEHICLE EXECUTOU': healVehicleExecutou ? 'sim' : 'nao',
    motivoSkip: motivoSkip ?? null,
  })
}

export function idsTecnicosLimitados(ids: readonly string[], max = 40): string[] {
  return ids.map((id) => id.trim()).filter(Boolean).slice(0, max)
}
