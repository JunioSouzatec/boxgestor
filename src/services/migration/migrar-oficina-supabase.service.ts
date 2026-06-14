import { isSupabaseConfigured } from '@/lib/supabase'
import { localCraftRepository } from '@/services/repository/local.repository'
import {
  getCurrentOffice,
  getCurrentProfile,
  getCurrentSupabaseSession,
} from '@/services/auth/supabase-auth-safe.service'
import {
  extrairDadosFase1,
  persistirFase1NoSupabase,
} from '@/services/supabase-sync/supabase-phase1.persistence'
import type { SyncErro } from '@/services/supabase-sync/supabase-sync.types'
import { OFFICE_ID } from '@/types/base'

export interface ResultadoMigracaoOficina {
  ok: boolean
  mensagem: string
  officeIdUsado?: string
  enviados?: number
  contagem?: {
    office: number
    settings: number
    customers: number
    motorcycles: number
    service_orders: number
  }
  avisos?: string[]
  erros?: SyncErro[]
}

function montarResumo(
  contagem: ResultadoMigracaoOficina['contagem'],
  avisos: string[],
  erros: SyncErro[],
  officeId: string
): string {
  const linhas = [
    `Migração concluída para a oficina vinculada (${officeId.slice(0, 8)}…).`,
    '',
    `• Clientes enviados: ${contagem?.customers ?? 0}`,
    `• Motos enviadas: ${contagem?.motorcycles ?? 0}`,
    `• OS enviadas: ${contagem?.service_orders ?? 0}`,
    `• Configurações: ${contagem?.settings ?? 0}`,
    `• Oficina atualizada: ${contagem?.office ? 'sim' : 'não (dados da oficina preservados)'}`,
  ]

  for (const aviso of avisos) {
    linhas.push('', `⚠ ${aviso}`)
  }

  if (erros.length > 0) {
    linhas.push('', `Erros (${erros.length}):`)
    for (const e of erros.slice(0, 5)) {
      linhas.push(`• ${e.entidade}${e.id ? ` (${e.id.slice(0, 8)}…)` : ''}: ${e.mensagem}`)
    }
    if (erros.length > 5) {
      linhas.push(`• … e mais ${erros.length - 5} erro(s)`)
    }
  }

  return linhas.join('\n')
}

/**
 * Envia dados locais para a office_id do usuário logado no Supabase Auth.
 * Usa a oficina já vinculada ao profile — nunca insere nova linha em offices.
 * Mantém backup local intacto.
 */
export async function migrarDadosLocaisParaOficinaSupabase(
  officeIdOrigem: string = OFFICE_ID
): Promise<ResultadoMigracaoOficina> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      mensagem: 'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.',
    }
  }

  const session = await getCurrentSupabaseSession()
  if (!session?.user?.id) {
    return {
      ok: false,
      mensagem: 'Nenhum usuário Supabase logado. Faça login antes de migrar.',
    }
  }

  const profile = await getCurrentProfile(session.user.id)
  if (!profile?.office_id?.trim()) {
    return {
      ok: false,
      mensagem: 'Usuário sem oficina vinculada. Crie ou vincule uma oficina antes de migrar.',
    }
  }

  const officeUuid = profile.office_id.trim()

  const office = await getCurrentOffice(officeUuid)
  if (!office) {
    return {
      ok: false,
      mensagem: `Oficina vinculada (${officeUuid.slice(0, 8)}…) não encontrada no Supabase.`,
      officeIdUsado: officeUuid,
    }
  }

  console.info('[Craft Migração] Iniciando migração local → Supabase', {
    userId: session.user.id,
    officeUuid,
    officeNome: office.name,
    origemLocal: officeIdOrigem,
  })

  let dadosOrigem
  try {
    dadosOrigem = localCraftRepository.carregar(officeIdOrigem)
  } catch {
    return {
      ok: false,
      mensagem: `Nenhum backup local encontrado para migrar (origem: ${officeIdOrigem}).`,
      officeIdUsado: officeUuid,
    }
  }

  const fase1 = extrairDadosFase1(dadosOrigem)
  fase1.configuracao = {
    ...fase1.configuracao,
    id: officeUuid,
    office_id: officeUuid,
    oficina_id: officeUuid,
  }

  const resultado = await persistirFase1NoSupabase(officeUuid, fase1, {
    officeUuidDestino: officeUuid,
    usarOficinaExistente: true,
    pularOficina: true,
  })

  const dadosMigrados =
    resultado.contagem.customers +
    resultado.contagem.motorcycles +
    resultado.contagem.service_orders

  if (resultado.ok || dadosMigrados > 0) {
    const copiaLocal = {
      ...dadosOrigem,
      configuracao: {
        ...fase1.configuracao,
        id: officeUuid,
        office_id: officeUuid,
        oficina_id: officeUuid,
      },
    }
    localCraftRepository.salvar(officeUuid, copiaLocal)

    return {
      ok: true,
      mensagem: montarResumo(resultado.contagem, resultado.avisos, resultado.erros, officeUuid),
      officeIdUsado: officeUuid,
      enviados: resultado.enviados,
      contagem: resultado.contagem,
      avisos: resultado.avisos,
      erros: resultado.erros,
    }
  }

  return {
    ok: false,
    mensagem:
      resultado.erros[0]?.mensagem ??
      'Migração não enviou dados. Verifique o console para detalhes técnicos.',
    officeIdUsado: officeUuid,
    enviados: resultado.enviados,
    contagem: resultado.contagem,
    avisos: resultado.avisos,
    erros: resultado.erros,
  }
}
