import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { localCraftRepository } from '@/services/repository/local.repository'
import {
  persistirFase1NoSupabase,
  extrairDadosFase1,
} from '@/services/supabase-sync/supabase-phase1.persistence'
import { salvarEstadoSincronizacao } from '@/services/supabase-sync/sync-state.storage'
import type {
  ContagemSyncEnviados,
  ResultadoSincronizacaoSupabase,
} from '@/services/supabase-sync/supabase-sync.types'
import { OFFICE_ID } from '@/types/base'

function contagemVazia(): ContagemSyncEnviados {
  return {
    office: 0,
    settings: 0,
    customers: 0,
    motorcycles: 0,
    service_orders: 0,
    total: 0,
  }
}

function lerDadosLocalStorage(officeId: string = OFFICE_ID) {
  const db = localCraftRepository.carregar(officeId)
  return extrairDadosFase1(db)
}

export async function sincronizarDadosLocaisComSupabase(
  officeId: string = OFFICE_ID
): Promise<ResultadoSincronizacaoSupabase> {
  const inicioEm = new Date().toISOString()
  const enviados = contagemVazia()

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      mensagem: 'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.',
      inicioEm,
      fimEm: new Date().toISOString(),
      enviados,
      erros: [{ entidade: 'conexão', mensagem: 'Variáveis de ambiente ausentes' }],
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      mensagem: 'Não foi possível inicializar o cliente Supabase.',
      inicioEm,
      fimEm: new Date().toISOString(),
      enviados,
      erros: [{ entidade: 'conexão', mensagem: 'Cliente Supabase indisponível' }],
    }
  }

  const dados = lerDadosLocalStorage(officeId)
  const resultado = await persistirFase1NoSupabase(officeId, dados)
  const fimEm = new Date().toISOString()

  if (resultado.enviados > 0) {
    enviados.office = 1
    enviados.settings = 1
    enviados.customers = dados.clientes.length
    enviados.motorcycles = dados.motos.length
    enviados.service_orders = dados.ordens_servico.length
    enviados.total = resultado.enviados
  }

  const syncResult: ResultadoSincronizacaoSupabase = {
    ok: resultado.ok && resultado.enviados > 0,
    mensagem: resultado.ok
      ? resultado.enviados > 0
        ? `Sincronização concluída: ${resultado.enviados} registro(s) enviado(s).`
        : 'Nenhum dado local encontrado para sincronizar.'
      : `Sincronização parcial: ${resultado.enviados} enviado(s), ${resultado.erros.length} erro(s).`,
    inicioEm,
    fimEm,
    enviados,
    erros: resultado.erros,
  }

  salvarEstadoSincronizacao({
    ultimaSincronizacao: fimEm,
    ultimoResultado: syncResult,
  })

  return syncResult
}
