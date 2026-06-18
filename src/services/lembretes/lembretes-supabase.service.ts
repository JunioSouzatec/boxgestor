import { getCraftPersistenceMode, isSupabaseConfigured } from '@/lib/supabase'
import {
  carregarLembretesDoSupabase,
  contarLembretesNoSupabase,
  persistirLembretesNoSupabase,
  type LembretesOfficeRemoto,
  type ResultadoCarregamentoLembretes,
  type ResultadoPersistenciaLembretes,
} from '@/services/lembretes/supabase-lembretes.persistence'
import type { LembreteCliente, RegraLembrete } from '@/types/lembrete'

export type { LembretesOfficeRemoto, ResultadoCarregamentoLembretes, ResultadoPersistenciaLembretes }

export function lembretesSupabaseAtivo(): boolean {
  return getCraftPersistenceMode() === 'supabase' && isSupabaseConfigured()
}

export async function listarLembretesSupabase(
  officeId: string
): Promise<ResultadoCarregamentoLembretes> {
  return carregarLembretesDoSupabase(officeId)
}

export async function salvarLembreteSupabase(
  officeId: string,
  lembrete: LembreteCliente,
  regras: RegraLembrete[] = []
): Promise<ResultadoPersistenciaLembretes> {
  return persistirLembretesNoSupabase(officeId, regras, [lembrete])
}

export async function atualizarLembreteSupabase(
  officeId: string,
  lembrete: LembreteCliente,
  regras: RegraLembrete[] = []
): Promise<ResultadoPersistenciaLembretes> {
  return persistirLembretesNoSupabase(officeId, regras, [lembrete])
}

export async function excluirOuCancelarLembreteSupabase(
  officeId: string,
  lembrete: LembreteCliente,
  regras: RegraLembrete[] = []
): Promise<ResultadoPersistenciaLembretes> {
  return persistirLembretesNoSupabase(officeId, regras, [{ ...lembrete, status_fixo: 'cancelado' }])
}

export async function listarHistoricoSupabase(officeId: string): Promise<ResultadoCarregamentoLembretes> {
  return carregarLembretesDoSupabase(officeId)
}

export async function registrarHistoricoSupabase(
  officeId: string,
  lembrete: LembreteCliente,
  regras: RegraLembrete[] = []
): Promise<ResultadoPersistenciaLembretes> {
  return persistirLembretesNoSupabase(officeId, regras, [lembrete])
}

export async function listarHistoricoPorCliente(
  officeId: string,
  clienteId: string
): Promise<ResultadoCarregamentoLembretes> {
  const resultado = await carregarLembretesDoSupabase(officeId)
  if (!resultado.ok || !resultado.dados) return resultado
  return {
    ...resultado,
    dados: {
      ...resultado.dados,
      lembretes: resultado.dados.lembretes.filter((l) => l.cliente_id === clienteId),
    },
  }
}

export async function listarHistoricoPorMoto(
  officeId: string,
  motoId: string
): Promise<ResultadoCarregamentoLembretes> {
  const resultado = await carregarLembretesDoSupabase(officeId)
  if (!resultado.ok || !resultado.dados) return resultado
  return {
    ...resultado,
    dados: {
      ...resultado.dados,
      lembretes: resultado.dados.lembretes.filter((l) => l.moto_id === motoId),
    },
  }
}

export async function listarHistoricoPorOs(
  officeId: string,
  osId: string
): Promise<ResultadoCarregamentoLembretes> {
  const resultado = await carregarLembretesDoSupabase(officeId)
  if (!resultado.ok || !resultado.dados) return resultado
  return {
    ...resultado,
    dados: {
      ...resultado.dados,
      lembretes: resultado.dados.lembretes.filter((l) => l.ordem_servico_id === osId),
    },
  }
}

export async function persistirOfficeLembretesSupabase(
  officeId: string,
  regras: RegraLembrete[],
  lembretes: LembreteCliente[]
): Promise<ResultadoPersistenciaLembretes> {
  return persistirLembretesNoSupabase(officeId, regras, lembretes)
}

export { contarLembretesNoSupabase }
