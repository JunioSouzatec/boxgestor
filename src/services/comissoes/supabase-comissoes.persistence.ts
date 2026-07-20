import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { aguardarSessaoAuthSupabase } from '@/lib/supabase-session-ready'
import {
  mapearPerfilComissaoDoSupabase,
  mapearPerfilComissaoParaSupabase,
  type EmployeeCommissionProfileRow,
} from '@/services/comissoes/comissoes-mappers'
import { registrarUltimoErroSupabase } from '@/services/supabase-sync/supabase-last-error.storage'
import type { SyncErro } from '@/services/supabase-sync/supabase-sync.types'
import {
  abrirCircuitSyncModulo,
  circuitSyncModuloAberto,
  fecharCircuitSyncModulo,
  isErroAuthOuPermissao,
} from '@/services/sync/remote-sync-circuit'
import type { PerfilComissaoFuncionario } from '@/types/comissoes'

export interface ResultadoCarregamentoComissoes {
  ok: boolean
  perfis: PerfilComissaoFuncionario[]
  erros: SyncErro[]
}

export interface ResultadoPersistenciaComissoes {
  ok: boolean
  erros: SyncErro[]
  enviados: number
  removidos: number
}

function sanitizarLinha(linha: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [chave, valor] of Object.entries(linha)) {
    if (valor !== undefined) out[chave] = valor
  }
  return out
}

async function resolverOfficeUuid(officeIdLocal: string): Promise<string | null> {
  const contexto = await obterContextoOfficeSupabase(officeIdLocal)
  return contexto?.officeUuid ?? null
}

export async function carregarPerfisComissaoDoSupabase(
  officeIdLocal: string
): Promise<ResultadoCarregamentoComissoes> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      perfis: [],
      erros: [{ entidade: 'Funcionário', mensagem: 'Supabase não configurado' }],
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      perfis: [],
      erros: [{ entidade: 'Funcionário', mensagem: 'Cliente Supabase indisponível' }],
    }
  }

  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) {
    return {
      ok: false,
      perfis: [],
      erros: [{ entidade: 'Funcionário', mensagem: 'Sem office_id no perfil' }],
    }
  }

  const { data, error } = await supabase
    .from('employee_commission_profiles')
    .select('*')
    .eq('office_id', officeUuid)
    .order('nome')

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('does not exist') || msg.includes('relation')) {
      return {
        ok: false,
        perfis: [],
        erros: [
          {
            entidade: 'Funcionário',
            mensagem:
              'Tabela employee_commission_profiles não encontrada. Execute docs/supabase-financeiro-funcionarios-comissoes.sql',
          },
        ],
      }
    }
    registrarUltimoErroSupabase({ mensagem: error.message, entidade: 'funcionarios_comissao' })
    return { ok: false, perfis: [], erros: [{ entidade: 'Funcionário', mensagem: error.message }] }
  }

  const perfis: PerfilComissaoFuncionario[] = []
  for (const row of (data ?? []) as EmployeeCommissionProfileRow[]) {
    perfis.push(await mapearPerfilComissaoDoSupabase(row, officeIdLocal))
  }

  return { ok: true, perfis, erros: [] }
}

export async function persistirPerfisComissaoNoSupabase(
  officeIdLocal: string,
  perfis: PerfilComissaoFuncionario[]
): Promise<ResultadoPersistenciaComissoes> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      erros: [{ entidade: 'Funcionário', mensagem: 'Supabase não configurado' }],
      enviados: 0,
      removidos: 0,
    }
  }

  if (circuitSyncModuloAberto('comissoes', officeIdLocal)) {
    return {
      ok: false,
      erros: [{ entidade: 'Funcionário', mensagem: 'Sync comissões pausado após erro de autenticação' }],
      enviados: 0,
      removidos: 0,
    }
  }

  const sessao = await aguardarSessaoAuthSupabase({ tentativas: 6, silencioso: true })
  if (!sessao) {
    return {
      ok: false,
      erros: [{ entidade: 'Funcionário', mensagem: 'Sem sessão Auth' }],
      enviados: 0,
      removidos: 0,
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      erros: [{ entidade: 'Funcionário', mensagem: 'Cliente Supabase indisponível' }],
      enviados: 0,
      removidos: 0,
    }
  }

  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) {
    return {
      ok: false,
      erros: [{ entidade: 'Funcionário', mensagem: 'Sem office_id no perfil' }],
      enviados: 0,
      removidos: 0,
    }
  }

  const erros: SyncErro[] = []
  let enviados = 0

  for (const perfil of perfis) {
    if (circuitSyncModuloAberto('comissoes', officeIdLocal)) break
    const row = await mapearPerfilComissaoParaSupabase(perfil, officeUuid)
    const { error } = await supabase
      .from('employee_commission_profiles')
      .upsert(sanitizarLinha(row as unknown as Record<string, unknown>) as never, {
        onConflict: 'id',
      })
    if (error) {
      erros.push({ entidade: 'Funcionário', id: perfil.id, mensagem: error.message })
      if (isErroAuthOuPermissao(error.message)) {
        abrirCircuitSyncModulo('comissoes', officeIdLocal, error.message)
        break
      }
    } else {
      enviados++
    }
  }

  const localIds = new Set(perfis.map((p) => p.id))
  let removidos = 0

  if (!circuitSyncModuloAberto('comissoes', officeIdLocal)) {
    const { data: remotos, error: listError } = await supabase
      .from('employee_commission_profiles')
      .select('id, local_id')
      .eq('office_id', officeUuid)

    if (listError) {
      erros.push({ entidade: 'Funcionário', mensagem: listError.message })
      if (isErroAuthOuPermissao(listError.message)) {
        abrirCircuitSyncModulo('comissoes', officeIdLocal, listError.message)
      }
    } else {
      for (const row of (remotos ?? []) as { id: string; local_id: string | null }[]) {
        const lid = row.local_id?.trim() || row.id
        if (!localIds.has(lid)) {
          const { error: delError } = await supabase
            .from('employee_commission_profiles')
            .delete()
            .eq('id', row.id)
          if (delError) {
            erros.push({ entidade: 'Funcionário', id: lid, mensagem: delError.message })
          } else {
            removidos++
          }
        }
      }
    }
  }

  if (erros.length > 0) {
    registrarUltimoErroSupabase({
      mensagem: erros[0]?.mensagem ?? 'Erro ao salvar funcionários',
      entidade: 'funcionarios_comissao',
    })
  } else {
    fecharCircuitSyncModulo('comissoes', officeIdLocal)
  }

  return {
    ok: erros.length === 0,
    erros,
    enviados,
    removidos,
  }
}
