import { ehAmbienteHomologacao } from '@/lib/app-versao'

function logRegistryGuardAtivo(): boolean {
  try {
    const url = String(import.meta.env?.VITE_SUPABASE_URL ?? '')
    return ehAmbienteHomologacao(url)
  } catch {
    return false
  }
}

/**
 * Homolog: somente quando o Guard bloqueia overwrite perigoso.
 * Sem PII (telefone, CPF, nome, placa, token).
 */
export function logRegistryGuard(detalhe: Record<string, unknown>): void {
  if (!logRegistryGuardAtivo()) return
  console.info('[BoxGestor Registry Guard]', detalhe)
}
