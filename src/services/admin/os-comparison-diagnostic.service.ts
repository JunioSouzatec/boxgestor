import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { obterContextoOfficeSupabase, aplicarOfficeUuidEmDadosFase1 } from '@/lib/supabase-office-context'
import { obterUuidPorLocalId } from '@/services/supabase-sync/id-registry'
import { diagnosticarPagamentosPendentesSync } from '@/services/pagamentos/payment-pending-diagnostic.service'
import { localCraftRepository } from '@/services/repository/local.repository'
import {
  carregarFase1DoSupabase,
  extrairDadosFase1ParaOs,
  persistirFase1NoSupabase,
} from '@/services/supabase-sync/supabase-phase1.persistence'
import {
  buscarOsSupabasePorNumero,
  osExisteNoSupabasePorId,
} from '@/services/supabase-sync/payment-os-sync.service'
import { carregarBaseSeguraOffice } from '@/services/supabase-sync/fase1-merge.helpers'
import type { CraftDatabase } from '@/types/database'
import type { OrdemServico } from '@/types'

export type StatusComparacaoOs =
  | 'ambos'
  | 'somente_local'
  | 'somente_supabase'
  | 'nao_encontrada'

export interface LinhaComparacaoOs {
  os_id: string
  numero: number
  status: StatusComparacaoOs
  cliente_nome?: string
  status_os?: string
  tem_pendencias_pagamento: boolean
  vinculo_quebrado: boolean
  mensagem?: string
  pode_restaurar: boolean
}

export interface ResumoComparacaoOs {
  totalLocal: number
  totalSupabase: number
  somenteLocal: number
  somenteSupabase: number
  comPendencias: number
  linhas: LinhaComparacaoOs[]
}

function osTemPendenciaPagamento(osId: string, officeId: string, dados: CraftDatabase): boolean {
  return diagnosticarPagamentosPendentesSync(dados, officeId).some(
    (p) => p.ordem_servico_id === osId || p.local_service_order_id === osId
  )
}

function vinculoOsQuebrado(os: OrdemServico, dados: CraftDatabase): boolean {
  const clienteOk = dados.clientes.some((c) => c.id === os.cliente_id)
  const motoOk = dados.motos.some((m) => m.id === os.moto_id)
  return !clienteOk || !motoOk
}

export async function diagnosticarComparacaoOsLocalSupabase(
  officeId: string,
  dadosContexto: CraftDatabase
): Promise<ResumoComparacaoOs> {
  const local = carregarBaseSeguraOffice(officeId, dadosContexto)
  const mapaNumerosLocal = new Map(local.ordens_servico.map((o) => [o.numero, o]))

  let remotoNumeros = new Set<number>()
  const mapaRemotoPorNumero = new Map<number, OrdemServico>()
  const remotoIds = new Set<string>()

  if (isSupabaseConfigured() && getSupabaseClient()) {
    const contexto = await obterContextoOfficeSupabase(officeId)
    const officeUuid = contexto?.officeUuid
    if (officeUuid) {
      const remoto = await carregarFase1DoSupabase(officeUuid, local)
      if (remoto.ok && remoto.dados) {
        for (const os of remoto.dados.ordens_servico) {
          remotoIds.add(os.id)
          remotoNumeros.add(os.numero)
          mapaRemotoPorNumero.set(os.numero, os)
        }
      }
    }
  }

  const linhas: LinhaComparacaoOs[] = []

  for (const os of local.ordens_servico) {
    const uuid = obterUuidPorLocalId(os.id)
    const noSupabase =
      remotoIds.has(os.id) ||
      remotoNumeros.has(os.numero) ||
      (uuid ? remotoIds.has(uuid) : false)

    const status: StatusComparacaoOs = noSupabase ? 'ambos' : 'somente_local'
    const cliente = local.clientes.find((c) => c.id === os.cliente_id)

    linhas.push({
      os_id: os.id,
      numero: os.numero,
      status,
      cliente_nome: cliente?.nome,
      status_os: os.status,
      tem_pendencias_pagamento: osTemPendenciaPagamento(os.id, officeId, local),
      vinculo_quebrado: vinculoOsQuebrado(os, local),
      mensagem: noSupabase ? undefined : 'Existe no cache local; ainda não confirmada no Supabase',
      pode_restaurar: !noSupabase,
    })
  }

  for (const [numero, osRemota] of mapaRemotoPorNumero) {
    if (mapaNumerosLocal.has(numero)) continue

    linhas.push({
      os_id: osRemota.id,
      numero: osRemota.numero,
      status: 'somente_supabase',
      status_os: osRemota.status,
      tem_pendencias_pagamento: false,
      vinculo_quebrado: false,
      mensagem: 'Existe no Supabase; ausente do cache local atual',
      pode_restaurar: false,
    })
  }

  linhas.sort((a, b) => b.numero - a.numero)

  return {
    totalLocal: local.ordens_servico.length,
    totalSupabase: remotoNumeros.size,
    somenteLocal: linhas.filter((l) => l.status === 'somente_local').length,
    somenteSupabase: linhas.filter((l) => l.status === 'somente_supabase').length,
    comPendencias: linhas.filter((l) => l.tem_pendencias_pagamento).length,
    linhas,
  }
}

export async function restaurarOsLocalParaSupabase(
  officeId: string,
  osId: string,
  dadosContexto: CraftDatabase
): Promise<{ ok: boolean; mensagem: string; db?: CraftDatabase }> {
  if (!isSupabaseConfigured() || !getSupabaseClient()) {
    return { ok: false, mensagem: 'Supabase não configurado.' }
  }

  const base = carregarBaseSeguraOffice(officeId, dadosContexto)
  const os = base.ordens_servico.find((o) => o.id === osId)
  if (!os) {
    return { ok: false, mensagem: 'OS não encontrada no Supabase nem no cache local.' }
  }

  const contexto = await obterContextoOfficeSupabase(officeId)
  const officeUuid = contexto?.officeUuid
  if (!officeUuid) {
    return { ok: false, mensagem: 'Oficina não vinculada ao Supabase.' }
  }

  const uuidMapeado = obterUuidPorLocalId(os.id)
  if (uuidMapeado && (await osExisteNoSupabasePorId(officeUuid, uuidMapeado))) {
    return {
      ok: false,
      mensagem: `OS #${os.numero} já existe no Supabase. Nenhuma duplicata foi criada.`,
    }
  }

  const existenteNumero = await buscarOsSupabasePorNumero(officeUuid, os.numero)
  if (existenteNumero) {
    return {
      ok: false,
      mensagem: `Já existe OS #${os.numero} no Supabase. Verifique a comparação antes de restaurar.`,
    }
  }

  const parcial = extrairDadosFase1ParaOs(base, osId)
  if (!parcial) {
    return { ok: false, mensagem: 'Não foi possível preparar dados da OS para envio.' }
  }

  const payload = contexto
    ? aplicarOfficeUuidEmDadosFase1(parcial, officeUuid)
    : parcial

  const resultado = await persistirFase1NoSupabase(officeUuid, payload, contexto?.opcoes)

  if (!resultado.ok && resultado.contagem.service_orders === 0) {
    return {
      ok: false,
      mensagem: resultado.erros[0]?.mensagem ?? 'Falha ao restaurar OS no Supabase.',
    }
  }

  console.info('[Admin BoxGestor] OS restaurada para Supabase', {
    os_id: osId,
    numero: os.numero,
    apenas_cache_local: false,
  })

  localCraftRepository.salvar(officeId, base)
  return { ok: true, mensagem: `OS #${os.numero} enviada ao Supabase com sucesso.`, db: base }
}
