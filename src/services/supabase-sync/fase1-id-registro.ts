import {
  obterOrigemMapeamentoId,
  obterUuidPorLocalId,
  registrarMapeamentoIdConfirmado,
  registrarMapeamentoIdProvisorio,
} from '@/services/supabase-sync/id-registry'

export type ClassificacaoMapeamentoFase1 = 'confirmado' | 'provisorio' | 'omitir'

/**
 * UUID do SELECT remoto, ou registry que já aponta para um id desse SELECT.
 * Não aceita hash só porque está no cache/registry.
 */
export function resolverUuidRemotoConhecido(
  localId: string,
  uuidPorUnicidade: string | undefined,
  idsRemotosConfirmados: ReadonlySet<string>
): string | undefined {
  const local = localId.trim()
  if (uuidPorUnicidade && idsRemotosConfirmados.has(uuidPorUnicidade.trim())) {
    return uuidPorUnicidade.trim()
  }
  const doRegistry = obterUuidPorLocalId(local)
  if (doRegistry && idsRemotosConfirmados.has(doRegistry)) return doRegistry
  if (idsRemotosConfirmados.has(local)) return local
  return undefined
}

export function classificarMapeamentoFase1(input: {
  localId: string
  uuid: string
  idsRemotosConfirmados: ReadonlySet<string>
  mapaLocalParaUuid?: Record<string, string>
}): ClassificacaoMapeamentoFase1 {
  const local = input.localId.trim()
  const remoto = input.uuid.trim()
  if (!local || !remoto) return 'omitir'

  if (input.idsRemotosConfirmados.has(remoto)) {
    if (local === remoto && input.mapaLocalParaUuid) {
      const outroAlias = Object.entries(input.mapaLocalParaUuid).some(
        ([outroLocal, uuid]) => outroLocal.trim() !== local && uuid.trim() === remoto
      )
      if (outroAlias) return 'omitir'
    }
    return 'confirmado'
  }

  const atual = obterUuidPorLocalId(local)
  if (atual && atual !== remoto && obterOrigemMapeamentoId(local) === 'confirmado') {
    return 'omitir'
  }
  if (!atual || atual === remoto) return 'provisorio'
  if (obterOrigemMapeamentoId(local) === 'provisorio') return 'provisorio'
  return 'omitir'
}

/** Primeira criação: o UUID enviado no upsert vira confirmado se não houver outro mapping. */
export function expandirIdsConfirmadosAposUpsert(
  idsRemotosConfirmados: Set<string>,
  mapaLocalParaUuid: Record<string, string>
): void {
  for (const [localId, uuid] of Object.entries(mapaLocalParaUuid)) {
    const local = localId.trim()
    const remoto = uuid.trim()
    if (!local || !remoto) continue
    const atual = obterUuidPorLocalId(local)
    if (atual && atual !== remoto) continue
    idsRemotosConfirmados.add(remoto)
  }
}

function callerPersistFase1(localId: string): string {
  const local = localId.trim()
  if (local.startsWith('cli-')) return 'persistirFase1_customer'
  if (local.startsWith('moto-')) return 'persistirFase1_vehicle'
  if (local.startsWith('os-')) return 'persistirFase1_service_order'
  return 'registrarMapeamentosFase1'
}

export function registrarMapeamentosFase1(
  mapaLocalParaUuid: Record<string, string>,
  idsRemotosConfirmados: ReadonlySet<string>
): void {
  for (const [localId, uuid] of Object.entries(mapaLocalParaUuid)) {
    const caller = callerPersistFase1(localId)
    const classificado = classificarMapeamentoFase1({
      localId,
      uuid,
      idsRemotosConfirmados,
      mapaLocalParaUuid,
    })
    if (classificado === 'omitir') {
      continue
    }
    if (classificado === 'confirmado') {
      registrarMapeamentoIdConfirmado(localId, uuid, caller, 'remote_upsert')
    } else {
      registrarMapeamentoIdProvisorio(localId, uuid, caller)
    }
  }
}
