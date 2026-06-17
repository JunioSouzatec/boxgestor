import { getSupabaseClient } from '@/lib/supabase'
import {
  aplicarOfficeUuidEmDadosFase1,
  obterContextoOfficeSupabase,
} from '@/lib/supabase-office-context'
import {
  obterUuidPorLocalId,
  registrarMapeamentoId,
} from '@/services/supabase-sync/id-registry'
import { ehPagamentoOS } from '@/services/supabase-sync/payment-mappers'
import {
  extrairNumeroOsDaDescricaoPagamento,
  logDiagnosticoVinculoPagamento,
  obterOsLocalConfiavelDoPagamento,
  resolverOsParaPagamento,
  type DiagnosticoVinculoPagamentoOs,
} from '@/services/supabase-sync/payment-os-resolver'
import {
  extrairDadosFase1ParaOs,
  persistirFase1NoSupabase,
} from '@/services/supabase-sync/supabase-phase1.persistence'
import { precisaSincronizarPagamento } from '@/services/pagamentos/payment-dedupe.helpers'
import type { CraftDatabase } from '@/types/database'
import type { LancamentoFinanceiro } from '@/types/financeiro'
import type { OrdemServico } from '@/types/ordem-servico'

interface ServiceOrderRowMin {
  id: string
  number?: number
  parts_used?: unknown
  customer_id?: string | null
  motorcycle_id?: string | null
}

export async function buscarOsSupabasePorNumero(
  officeUuid: string,
  numero: number
): Promise<ServiceOrderRowMin | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('service_orders')
    .select('id, number, parts_used, customer_id, motorcycle_id')
    .eq('office_id', officeUuid)
    .eq('number', numero)
    .maybeSingle<ServiceOrderRowMin>()

  if (error) {
    console.warn('[Craft Supabase] Busca OS por número:', error.message)
    return null
  }

  return data ?? null
}

export async function osExisteNoSupabasePorId(
  officeUuid: string,
  osUuid: string
): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) return false

  const { data } = await supabase
    .from('service_orders')
    .select('id')
    .eq('office_id', officeUuid)
    .eq('id', osUuid)
    .maybeSingle<{ id: string }>()

  return Boolean(data)
}

/** Reutiliza OS existente no Supabase (office + número) e registra mapeamento local → UUID */
export async function vincularOsExistentePorNumero(
  os: OrdemServico,
  officeUuid: string
): Promise<string | null> {
  const row = await buscarOsSupabasePorNumero(officeUuid, os.numero)
  if (!row) return null

  const uuid = String(row.id)
  registrarMapeamentoId(os.id, uuid)
  console.info('[Craft Supabase] OS existente reutilizada por número', {
    os_local_id: os.id,
    os_numero: os.numero,
    os_supabase_id: uuid,
  })
  return uuid
}

export function diagnosticarPagamentoPendenteCompleto(
  lancamento: LancamentoFinanceiro,
  dados: CraftDatabase,
  officeUuid: string,
  diag: DiagnosticoVinculoPagamentoOs,
  motivo?: string
): void {
  const osLocal = lancamento.ordem_servico_id
    ? dados.ordens_servico.find((o) => o.id === lancamento.ordem_servico_id)
    : undefined
  const numeroDescricao = extrairNumeroOsDaDescricaoPagamento(lancamento.descricao)

  console.info('[Craft Supabase] Diagnóstico pagamento pendente', {
    'payment.id': lancamento.id,
    'payment.service_order_id': lancamento.ordem_servico_id,
    'payment.local_service_order_id': lancamento.ordem_servico_id,
    'payment.client_payment_id': lancamento.client_payment_id ?? lancamento.id,
    os_numero: diag.os_numero ?? osLocal?.numero ?? numeroDescricao,
    office_id: officeUuid,
    os_existe_localStorage: Boolean(osLocal),
    os_local_id: osLocal?.id ?? diag.os_local_id,
    os_existe_supabase: diag.os_supabase_encontrada,
    os_supabase_id: diag.os_supabase_id,
    os_uuid_mapeado: diag.ordem_servico_uuid,
    estrategia_resolucao: diag.estrategia,
    motivo_nao_encontrada:
      motivo ??
      diag.erro ??
      (!osLocal
        ? 'OS não encontrada nos dados locais (localStorage)'
        : !diag.os_supabase_encontrada
          ? 'OS existe localmente mas ainda não está no Supabase'
          : undefined),
  })
}

export interface ResultadoSyncOsPendentes {
  ok: boolean
  mensagem: string
  osSincronizadas: number
  osReutilizadas: number
  erros: string[]
  osIds: string[]
}

/** Sincroniza OS locais que ainda não existem no Supabase */
export async function sincronizarOsPendentesNoSupabase(
  officeLocalId: string,
  dados: CraftDatabase,
  osIdsAlvo?: string[]
): Promise<ResultadoSyncOsPendentes> {
  const contexto = await obterContextoOfficeSupabase(officeLocalId)
  if (!contexto?.officeUuid) {
    return {
      ok: false,
      mensagem: 'Sem office_id vinculado ao usuário no Supabase.',
      osSincronizadas: 0,
      osReutilizadas: 0,
      erros: ['Sem office_id no profile'],
      osIds: [],
    }
  }

  const officeUuid = contexto.officeUuid
  const candidatas = osIdsAlvo
    ? dados.ordens_servico.filter((o) => osIdsAlvo.includes(o.id))
    : await listarOsLocaisPendentesNoSupabase(dados, officeUuid)

  if (candidatas.length === 0) {
    return {
      ok: true,
      mensagem: 'Nenhuma OS pendente para sincronizar.',
      osSincronizadas: 0,
      osReutilizadas: 0,
      erros: [],
      osIds: [],
    }
  }

  let osReutilizadas = 0
  const precisamEnviar: OrdemServico[] = []

  for (const os of candidatas) {
    const uuidMapeado = obterUuidPorLocalId(os.id)
    if (uuidMapeado && (await osExisteNoSupabasePorId(officeUuid, uuidMapeado))) {
      continue
    }

    const existente = await vincularOsExistentePorNumero(os, officeUuid)
    if (existente) {
      osReutilizadas++
    } else {
      precisamEnviar.push(os)
    }
  }

  if (precisamEnviar.length === 0) {
    return {
      ok: true,
      mensagem:
        osReutilizadas > 0
          ? `${osReutilizadas} OS vinculada(s) ao Supabase (já existiam por número).`
          : 'Todas as OS já estão no Supabase.',
      osSincronizadas: 0,
      osReutilizadas,
      erros: [],
      osIds: candidatas.map((o) => o.id),
    }
  }

  const clientesMap = new Map<string, CraftDatabase['clientes'][0]>()
  const motosMap = new Map<string, CraftDatabase['motos'][0]>()
  const erros: string[] = []

  for (const os of precisamEnviar) {
    const parcial = extrairDadosFase1ParaOs(dados, os.id)
    if (!parcial) {
      erros.push(`OS #${os.numero}: não encontrada nos dados locais`)
      continue
    }
    for (const c of parcial.clientes) clientesMap.set(c.id, c)
    for (const m of parcial.motos) motosMap.set(m.id, m)
  }

  const fase1 = aplicarOfficeUuidEmDadosFase1(
    {
      configuracao: dados.configuracao,
      clientes: [...clientesMap.values()],
      motos: [...motosMap.values()],
      ordens_servico: precisamEnviar,
      proximo_numero_os: dados.proximo_numero_os,
    },
    officeUuid
  )

  console.info('[Craft Supabase] Sincronizando OS pendentes', {
    office_id: officeUuid,
    os: precisamEnviar.map((o) => ({ local_id: o.id, numero: o.numero })),
  })

  const resultado = await persistirFase1NoSupabase(officeUuid, fase1, contexto.opcoes)

  for (const os of precisamEnviar) {
    const uuid = obterUuidPorLocalId(os.id)
    const existe = uuid ? await osExisteNoSupabasePorId(officeUuid, uuid) : false
    if (!existe) {
      const reutilizada = await vincularOsExistentePorNumero(os, officeUuid)
      if (!reutilizada) {
        const err = resultado.erros.find((e) => e.id === os.id)
        erros.push(
          err?.mensagem ?? `OS #${os.numero}: não foi possível sincronizar no Supabase`
        )
      } else {
        osReutilizadas++
      }
    }
  }

  const osSincronizadas = resultado.contagem.service_orders
  const ok = osSincronizadas > 0 || osReutilizadas > 0 || erros.length === 0

  let mensagem: string
  if (osSincronizadas > 0 && osReutilizadas > 0) {
    mensagem = `${osSincronizadas} OS sincronizada(s), ${osReutilizadas} vinculada(s) por número.`
  } else if (osSincronizadas > 0) {
    mensagem = `${osSincronizadas} OS sincronizada(s) com sucesso.`
  } else if (osReutilizadas > 0) {
    mensagem = `${osReutilizadas} OS vinculada(s) ao Supabase (já existiam).`
  } else if (erros.length > 0) {
    mensagem = erros[0]
  } else {
    mensagem = 'Nenhuma OS pendente para sincronizar.'
  }

  return {
    ok,
    mensagem,
    osSincronizadas,
    osReutilizadas,
    erros,
    osIds: candidatas.map((o) => o.id),
  }
}

export async function listarOsLocaisPendentesNoSupabase(
  dados: CraftDatabase,
  officeUuid: string
): Promise<OrdemServico[]> {
  const pendentes: OrdemServico[] = []

  for (const os of dados.ordens_servico) {
    const uuid = obterUuidPorLocalId(os.id)
    if (uuid && (await osExisteNoSupabasePorId(officeUuid, uuid))) continue

    const row = await buscarOsSupabasePorNumero(officeUuid, os.numero)
    if (row) {
      registrarMapeamentoId(os.id, String(row.id))
      continue
    }

    pendentes.push(os)
  }

  return pendentes
}

export interface ResultadoReparoVinculoPagamentos {
  ok: boolean
  mensagem: string
  pagamentosCorrigidos: number
  pagamentosSemOs: Array<{ lancamento_id: string; motivo: string }>
  osPrecisamSync: string[]
  correcoes_os: Array<{
    lancamento_id: string
    ordem_servico_id_anterior?: string
    ordem_servico_id_novo: string
  }>
}

/** Repara vínculo pagamento → OS e tenta sincronizar OS faltantes */
export async function repararVinculoPagamentosComOs(
  officeLocalId: string,
  dados: CraftDatabase
): Promise<ResultadoReparoVinculoPagamentos> {
  const contexto = await obterContextoOfficeSupabase(officeLocalId)
  if (!contexto?.officeUuid) {
    return {
      ok: false,
      mensagem: 'Sem office_id vinculado ao usuário.',
      pagamentosCorrigidos: 0,
      pagamentosSemOs: [],
      osPrecisamSync: [],
      correcoes_os: [],
    }
  }

  const officeUuid = contexto.officeUuid
  const pendentes = dados.lancamentos.filter(
    (l) => !l.cancelado && precisaSincronizarPagamento(l) && ehPagamentoOS(l)
  )

  const correcoes_os: ResultadoReparoVinculoPagamentos['correcoes_os'] = []
  const pagamentosSemOs: ResultadoReparoVinculoPagamentos['pagamentosSemOs'] = []
  const osPrecisamSync = new Set<string>()

  for (const lancamento of pendentes) {
    const osConfiavel = obterOsLocalConfiavelDoPagamento(lancamento, dados)
    const resolucao = osConfiavel
      ? await resolverOsParaPagamento(
          { ...lancamento, ordem_servico_id: osConfiavel.id },
          dados,
          officeUuid
        )
      : await resolverOsParaPagamento(lancamento, dados, officeUuid)

    if (resolucao.os) {
      if (!resolucao.diagnostico.os_supabase_encontrada) {
        osPrecisamSync.add(resolucao.os.id)
        const reutilizada = await vincularOsExistentePorNumero(resolucao.os, officeUuid)
        if (!reutilizada) {
          diagnosticarPagamentoPendenteCompleto(
            lancamento,
            dados,
            officeUuid,
            resolucao.diagnostico,
            'OS local encontrada — aguardando sincronização no Supabase'
          )
        }
      }

      if (
        !osConfiavel &&
        lancamento.ordem_servico_id &&
        lancamento.ordem_servico_id !== resolucao.os.id
      ) {
        correcoes_os.push({
          lancamento_id: lancamento.id,
          ordem_servico_id_anterior: lancamento.ordem_servico_id,
          ordem_servico_id_novo: resolucao.os.id,
        })
      }
    } else {
      const motivo =
        resolucao.diagnostico.erro ??
        'Não foi possível localizar a OS (local ou Supabase) para este pagamento'
      diagnosticarPagamentoPendenteCompleto(
        lancamento,
        dados,
        officeUuid,
        resolucao.diagnostico,
        motivo
      )
      pagamentosSemOs.push({ lancamento_id: lancamento.id, motivo })
    }
  }

  let osSyncMsg = ''
  if (osPrecisamSync.size > 0) {
    const syncOs = await sincronizarOsPendentesNoSupabase(
      officeLocalId,
      dados,
      [...osPrecisamSync]
    )
    osSyncMsg = syncOs.mensagem
  }

  const pagamentosCorrigidos = correcoes_os.length
  const ok = pagamentosSemOs.length === 0 || pagamentosCorrigidos > 0 || osPrecisamSync.size > 0

  let mensagem = ''
  if (pagamentosCorrigidos > 0) {
    mensagem += `${pagamentosCorrigidos} vínculo(s) corrigido(s). `
  }
  if (osPrecisamSync.size > 0) {
    mensagem += osSyncMsg || `${osPrecisamSync.size} OS precisam estar no Supabase. `
  }
  if (pagamentosSemOs.length > 0) {
    mensagem += `${pagamentosSemOs.length} pagamento(s) sem OS identificada.`
  }
  if (!mensagem.trim()) {
    mensagem = 'Nenhum pagamento pendente com problema de vínculo.'
  }

  return {
    ok,
    mensagem: mensagem.trim(),
    pagamentosCorrigidos,
    pagamentosSemOs,
    osPrecisamSync: [...osPrecisamSync],
    correcoes_os,
  }
}

/** Garante OS no Supabase antes dos pagamentos — ordem: clientes → motos → OS */
export async function garantirOsParaPagamentosPendentes(
  officeLocalId: string,
  dados: CraftDatabase,
  lancamentoIds: string[]
): Promise<{ ok: boolean; osSincronizadas: number; erros: string[] }> {
  const contexto = await obterContextoOfficeSupabase(officeLocalId)
  if (!contexto?.officeUuid) {
    return { ok: false, osSincronizadas: 0, erros: ['Sem office_id no profile'] }
  }

  const officeUuid = contexto.officeUuid
  const alvo = dados.lancamentos.filter(
    (l) => lancamentoIds.includes(l.id) && !l.cancelado && ehPagamentoOS(l)
  )

  const osIdsParaSync = new Set<string>()
  const erros: string[] = []

  for (const lancamento of alvo) {
    const resolucao = await resolverOsParaPagamento(lancamento, dados, officeUuid)
    logDiagnosticoVinculoPagamento(resolucao.diagnostico)
    diagnosticarPagamentoPendenteCompleto(
      lancamento,
      dados,
      officeUuid,
      resolucao.diagnostico
    )

    if (resolucao.os) {
      if (!resolucao.diagnostico.os_supabase_encontrada) {
        osIdsParaSync.add(resolucao.os.id)
      }
    } else if (lancamento.ordem_servico_id) {
      osIdsParaSync.add(lancamento.ordem_servico_id)
      erros.push(
        `Pagamento ${lancamento.id.slice(0, 8)}…: OS local ${lancamento.ordem_servico_id.slice(0, 8)}… não encontrada`
      )
    } else {
      erros.push(`Pagamento ${lancamento.id.slice(0, 8)}…: sem ordem_servico_id`)
    }
  }

  if (osIdsParaSync.size === 0) {
    return { ok: erros.length === 0, osSincronizadas: 0, erros }
  }

  const syncResult = await sincronizarOsPendentesNoSupabase(
    officeLocalId,
    dados,
    [...osIdsParaSync]
  )

  erros.push(...syncResult.erros)

  for (const osId of osIdsParaSync) {
    const os = dados.ordens_servico.find((o) => o.id === osId)
    if (!os) continue
    const uuid = obterUuidPorLocalId(os.id)
    const existe =
      (uuid && (await osExisteNoSupabasePorId(officeUuid, uuid))) ||
      Boolean(await vincularOsExistentePorNumero(os, officeUuid))
    if (!existe) {
      erros.push(`OS #${os.numero} ainda não está no Supabase após tentativa de sync`)
    }
  }

  return {
    ok: syncResult.ok && erros.filter((e) => e.includes('ainda não')).length === 0,
    osSincronizadas: syncResult.osSincronizadas + syncResult.osReutilizadas,
    erros,
  }
}
