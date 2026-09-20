import { isUuidFormato } from '@/lib/local-id-uuid'
import {
  hashDeterministicoEmCache,
  lembrarHashDeterministico,
  listarIdsLocaisCandidatos,
  obterLocalIdPorUuid,
  obterOrigemMapeamentoId,
  obterUuidPorLocalId,
  registrarMapeamentoId,
  registrarMapeamentoIdProvisorio,
} from '@/services/supabase-sync/id-registry'
import { logRegistryGuard } from '@/services/supabase-sync/registry-heal-log'

function mappingConfirmadoDiferente(local: string, remoto: string): string | undefined {
  const atual = obterUuidPorLocalId(local)
  if (!atual || atual === remoto) return undefined
  if (obterOrigemMapeamentoId(local) !== 'confirmado') return undefined
  return atual
}

function logFkNaoSobrescreveConfirmado(
  local: string,
  atual: string,
  remoto: string,
  caller: string
): void {
  logRegistryGuard({
    localId: local,
    valorAtual: atual,
    tentativa: remoto,
    caller,
    motivo: 'deterministic_hash_nao_sobrescreve_confirmado',
  })
}

/**
 * UUID para PUSH: UUID direto → registry → hash provisório.
 * Não confirma o fallback.
 */
export async function resolverUuidParaPush(localId: string): Promise<string> {
  const local = localId.trim()
  if (!local) return local
  if (isUuidFormato(local)) return local
  const doRegistry = obterUuidPorLocalId(local)
  if (doRegistry) return doRegistry
  return lembrarHashDeterministico(local)
}

export function registrarFallbackPush(
  localId: string,
  uuid: string,
  caller: string
): void {
  const local = localId.trim()
  const remoto = uuid.trim()
  if (!local || !remoto) return
  if (isUuidFormato(local) && local === remoto) return
  const atual = obterUuidPorLocalId(local)
  if (atual === remoto) return
  registrarMapeamentoIdProvisorio(local, remoto, caller)
}

/**
 * Recupera alias local a partir de uma FK remota.
 * Match por hash só devolve a referência local; não destrói UUID real confirmado.
 */
export async function resolverLocalDeFkRemota(
  remoteUuid: string,
  candidatos: readonly string[],
  prefixoFallback: string | undefined,
  caller: string
): Promise<string> {
  const remoto = remoteUuid.trim()
  if (!remoto) return remoto

  const peloRemoto = obterLocalIdPorUuid(remoto)
  if (peloRemoto) {
    const atual = mappingConfirmadoDiferente(peloRemoto, remoto)
    if (atual) {
      logFkNaoSobrescreveConfirmado(peloRemoto, atual, remoto, caller)
      return peloRemoto
    }
    registrarMapeamentoId(peloRemoto, remoto, caller)
    return peloRemoto
  }

  const vistos = new Set<string>()
  for (const bruto of [...candidatos, ...listarIdsLocaisCandidatos()]) {
    const local = bruto.trim()
    if (!local || vistos.has(local)) continue
    vistos.add(local)
    const hash = await lembrarHashDeterministico(local)
    if (hash !== remoto) continue
    const atual = mappingConfirmadoDiferente(local, remoto)
    if (atual) {
      logFkNaoSobrescreveConfirmado(local, atual, remoto, caller)
      return local
    }
    registrarMapeamentoId(local, remoto, caller)
    return local
  }

  if (prefixoFallback) return `${prefixoFallback}-${remoto.slice(0, 8)}`
  return remoto
}

export function registrarFkLocalParaRemoto(
  localId: string | null | undefined,
  remotoUuid: string | null | undefined,
  caller: string
): void {
  const local = localId?.trim()
  const remoto = remotoUuid?.trim()
  if (!local || !remoto) return
  if (!isUuidFormato(remoto)) return
  if (isUuidFormato(local) && local === remoto) return

  const atual = mappingConfirmadoDiferente(local, remoto)
  if (atual) {
    const hash = hashDeterministicoEmCache(local)
    const donoDoRemoto = obterLocalIdPorUuid(remoto)
    if (hash === remoto || donoDoRemoto !== local) {
      logFkNaoSobrescreveConfirmado(local, atual, remoto, caller)
      return
    }
  }
  registrarMapeamentoId(local, remoto, caller)
}
