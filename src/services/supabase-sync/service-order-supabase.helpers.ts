import { obterUuidPorLocalId } from '@/services/supabase-sync/id-registry'
import { SyncIdMap } from '@/services/supabase-sync/mappers'
import type { SyncErro } from '@/services/supabase-sync/supabase-sync.types'
import type { OrdemServico } from '@/types/ordem-servico'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PayloadDiagnosticoOS {
  office_id: string
  customer_id: string
  motorcycle_id: string
  os_local_id: string
  os_numero?: number
}

/** Semeia UUIDs já conhecidos (dedup / sessões anteriores) no mapa de sync */
export function semearSyncIdMapDoRegistry(ids: SyncIdMap, localIds: string[]): void {
  for (const localId of localIds) {
    const uuid = obterUuidPorLocalId(localId)
    if (uuid) ids.seed(localId, uuid)
  }
}

export interface ResultadoPreparacaoOS {
  prontas: OrdemServico[]
  erros: SyncErro[]
  avisos: string[]
  payloadsDiag: PayloadDiagnosticoOS[]
}

/**
 * Garante que cliente e moto existem no Supabase na mesma office antes de inserir OS.
 * OS com dependências ausentes ficam de fora (salvas localmente; aviso ao usuário).
 */
export async function filtrarOrdensServicoComDependenciasValidas(
  supabase: SupabaseClient,
  officeUuid: string,
  ordens: OrdemServico[],
  ids: SyncIdMap,
  clienteIdsLocais: Set<string>,
  motoIdsLocais: Set<string>
): Promise<ResultadoPreparacaoOS> {
  const erros: SyncErro[] = []
  const avisos: string[] = []
  const payloadsDiag: PayloadDiagnosticoOS[] = []
  const prontas: OrdemServico[] = []

  if (ordens.length === 0) {
    return { prontas, erros, avisos, payloadsDiag }
  }

  const { data: clientesRemotos, error: errClientes } = await supabase
    .from('customers')
    .select('id')
    .eq('office_id', officeUuid)

  if (errClientes) {
    erros.push({
      entidade: 'Ordem de Serviço',
      mensagem:
        'Não foi possível verificar clientes no Supabase antes de salvar a OS. Tente novamente.',
    })
    console.error('[Craft Supabase] Erro ao listar customers para OS:', errClientes)
    return { prontas: [], erros, avisos, payloadsDiag }
  }

  const { data: motosRemotas, error: errMotos } = await supabase
    .from('motorcycles')
    .select('id')
    .eq('office_id', officeUuid)

  if (errMotos) {
    erros.push({
      entidade: 'Ordem de Serviço',
      mensagem:
        'Não foi possível verificar motos no Supabase antes de salvar a OS. Tente novamente.',
    })
    console.error('[Craft Supabase] Erro ao listar motorcycles para OS:', errMotos)
    return { prontas: [], erros, avisos, payloadsDiag }
  }

  const clientesValidos = new Set((clientesRemotos ?? []).map((c) => String(c.id)))
  const motosValidas = new Set((motosRemotas ?? []).map((m) => String(m.id)))

  for (const os of ordens) {
    const customerUuid = await ids.uuid(os.cliente_id)
    const motorcycleUuid = await ids.uuid(os.moto_id)

    payloadsDiag.push({
      office_id: officeUuid,
      customer_id: customerUuid,
      motorcycle_id: motorcycleUuid,
      os_local_id: os.id,
      os_numero: os.numero,
    })

    if (!clienteIdsLocais.has(os.cliente_id)) {
      const msg = `OS #${os.numero}: cliente não encontrado nos dados locais. Salva apenas localmente.`
      avisos.push(msg)
      erros.push({ entidade: 'Ordem de Serviço', id: os.id, mensagem: msg })
      continue
    }

    if (!motoIdsLocais.has(os.moto_id)) {
      const msg = `OS #${os.numero}: moto não encontrada nos dados locais. Salva apenas localmente.`
      avisos.push(msg)
      erros.push({ entidade: 'Ordem de Serviço', id: os.id, mensagem: msg })
      continue
    }

    if (!clientesValidos.has(customerUuid)) {
      const msg = `OS #${os.numero}: cliente ainda não está no Supabase. Sincronize o cliente primeiro — OS salva localmente.`
      avisos.push(msg)
      erros.push({ entidade: 'Ordem de Serviço', id: os.id, mensagem: msg })
      console.warn('[Craft Supabase] OS sem cliente no Supabase', {
        os_id: os.id,
        cliente_local: os.cliente_id,
        customer_uuid: customerUuid,
        office_id: officeUuid,
      })
      continue
    }

    if (!motosValidas.has(motorcycleUuid)) {
      const msg = `OS #${os.numero}: moto ainda não está no Supabase. Sincronize a moto primeiro — OS salva localmente.`
      avisos.push(msg)
      erros.push({ entidade: 'Ordem de Serviço', id: os.id, mensagem: msg })
      console.warn('[Craft Supabase] OS sem moto no Supabase', {
        os_id: os.id,
        moto_local: os.moto_id,
        motorcycle_uuid: motorcycleUuid,
        office_id: officeUuid,
      })
      continue
    }

    prontas.push(os)
  }

  return { prontas, erros, avisos, payloadsDiag }
}
