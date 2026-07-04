import { exportarBackupJson } from '@/services/backup/backup.service'
import { criarModeloChecklistPadrao } from '@/services/checklist-modelo.service'
import { limparHistoricoComunicacaoPorOffice } from '@/services/comunicacao/comunicacao.service'
import { limparMensagensAgendadasPorOffice } from '@/services/comunicacao/mensagens-agendadas.service'
import { limparLembretesOperacionaisPorOffice } from '@/services/lembretes/lembretes.service'
import { limparAuditoriaOrfaos } from '@/services/pagamentos/payment-orphan.storage'
import { localCraftRepository } from '@/services/repository/local.repository'
import { limparRegistroIds } from '@/services/supabase-sync/id-registry'
import { limparDadosOperacionaisSupabase } from '@/services/supabase-sync/supabase-office-reset.service'
import { limparUltimoErroSupabase } from '@/services/supabase-sync/supabase-last-error.storage'
import { limparEstadoSincronizacao } from '@/services/supabase-sync/sync-state.storage'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import type { CraftDatabase } from '@/types/database'

export type OpcaoLimpezaTeste = 'operacao' | 'operacao_estoque'

export interface ResultadoLimpezaTeste {
  ok: boolean
  mensagem: string
  avisosSupabase?: string[]
}

function criarDatabaseOperacionalVazio(
  dadosAtuais: CraftDatabase,
  officeId: string,
  opcao: OpcaoLimpezaTeste
): CraftDatabase {
  const limparEstoque = opcao === 'operacao_estoque'
  const configuracao = {
    ...dadosAtuais.configuracao,
    id: officeId,
    office_id: officeId,
    oficina_id: officeId,
  }

  return {
    clientes: [],
    motos: [],
    ordens_servico: [],
    pecas: limparEstoque ? [] : dadosAtuais.pecas,
    fornecedores: limparEstoque ? [] : dadosAtuais.fornecedores,
    movimentacoes_estoque: limparEstoque ? [] : dadosAtuais.movimentacoes_estoque,
    lancamentos: [],
    agendamentos: [],
    modelos_checklist: [criarModeloChecklistPadrao(officeId)],
    servicos_catalogo: [],
    perfis_comissao: dadosAtuais.perfis_comissao ?? [],
    configuracao,
    proximo_numero_os: 1,
  }
}

export function limparCacheLocalOperacional(officeId: string): void {
  syncQueueService.limparPorOffice(officeId)
  limparRegistroIds()
  limparAuditoriaOrfaos()
  limparEstadoSincronizacao()
  limparLembretesOperacionaisPorOffice(officeId)
  limparHistoricoComunicacaoPorOffice(officeId)
  limparMensagensAgendadasPorOffice(officeId)
  limparUltimoErroSupabase()
}

export async function limparDadosTesteOficina(params: {
  officeLocalId: string
  dadosAtuais: CraftDatabase
  opcao: OpcaoLimpezaTeste
}): Promise<ResultadoLimpezaTeste> {
  const { officeLocalId, dadosAtuais, opcao } = params

  const resultadoSupabase = await limparDadosOperacionaisSupabase(
    officeLocalId,
    opcao === 'operacao_estoque'
  )

  const dbVazio = criarDatabaseOperacionalVazio(dadosAtuais, officeLocalId, opcao)
  localCraftRepository.salvar(officeLocalId, dbVazio)
  limparCacheLocalOperacional(officeLocalId)

  if (!resultadoSupabase.ok && resultadoSupabase.erros.length > 0) {
    return {
      ok: true,
      mensagem:
        'Dados locais limpos. Alguns registros remotos não puderam ser apagados — verifique a conexão com o Supabase.',
      avisosSupabase: resultadoSupabase.erros,
    }
  }

  return {
    ok: true,
    mensagem: 'Dados de teste limpos com sucesso.',
  }
}

/** Exporta backup JSON antes da limpeza (mesmo fluxo do card de backup). */
export function exportarBackupAntesLimpeza(officeId: string, dados: CraftDatabase): void {
  exportarBackupJson(officeId, dados)
}
