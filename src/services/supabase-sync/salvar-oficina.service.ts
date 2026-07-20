import { MSG } from '@/lib/mensagens-usuario'
import { getCraftPersistenceMode } from '@/lib/supabase'
import { deveUsarSupabaseAuth } from '@/services/auth/auth.factory'
import { emitirEventoPersistencia } from '@/services/persistence-status.events'
import {
  MENSAGEM_FALLBACK_OFICINA,
  MENSAGEM_SUCESSO_OFICINA_SUPABASE,
  persistirConfiguracaoOficinaNoSupabase,
} from '@/services/supabase-sync/supabase-office.persistence'
import { marcarPersistenciaSomenteOficina } from '@/services/supabase-sync/persistencia-opcoes'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import type { CraftDatabase } from '@/types/database'
import type { ConfiguracaoOficina } from '@/types/oficina'

export interface ResultadoSalvarDadosOficina {
  salvouSupabase: boolean
  mensagem: string
  configuracao?: ConfiguracaoOficina
}

const CAMPOS_DIAG: (keyof ConfiguracaoOficina)[] = [
  'nome',
  'nome_fantasia',
  'cnpj',
  'telefone',
  'whatsapp',
  'endereco',
  'bairro',
  'cidade',
  'estado',
  'cep',
  'email',
  'logo_url',
  'logo_removida_em',
  'aparencia',
  'preferencias',
  'horario_funcionamento',
  'pin_autorizacao_valores',
]

function logConfigUpdate(payload: Record<string, unknown>): void {
  console.info('[BoxGestor Config][update]', payload)
}

function statusFilaConfig(officeId: string): {
  pendentes: number
  configPendentes: number
} {
  const pendentes = syncQueueService.listar(officeId, 'pendente')
  const config = pendentes.filter((i) => i.entidade === 'configuracao')
  return {
    pendentes: pendentes.length,
    configPendentes: config.length,
  }
}

function camposAlterados(
  anterior: ConfiguracaoOficina,
  patch: Partial<ConfiguracaoOficina>
): Array<{ campo: string; valor_antigo: unknown; valor_novo: unknown }> {
  const out: Array<{ campo: string; valor_antigo: unknown; valor_novo: unknown }> = []
  for (const campo of CAMPOS_DIAG) {
    if (!(campo in patch)) continue
    const antigo = anterior[campo]
    const novo = patch[campo]
    if (JSON.stringify(antigo ?? null) !== JSON.stringify(novo ?? null)) {
      out.push({
        campo: String(campo),
        valor_antigo: antigo ?? null,
        valor_novo: novo ?? null,
      })
    }
  }
  return out
}

/**
 * Salva configuração localmente (via callback) e persiste no Supabase
 * quando Auth + persistência Supabase estão ativos.
 * Só retorna salvouSupabase=true após confirmação do Supabase.
 */
export async function salvarDadosOficinaComSupabase(
  db: CraftDatabase,
  patch: Partial<ConfiguracaoOficina>,
  salvarLocal: (patch: Partial<ConfiguracaoOficina>) => void
): Promise<ResultadoSalvarDadosOficina> {
  marcarPersistenciaSomenteOficina()

  const officeId = db.configuracao.office_id ?? db.configuracao.oficina_id ?? db.configuracao.id
  const alteracoes = camposAlterados(db.configuracao, patch)
  const filaAntes = statusFilaConfig(officeId)

  logConfigUpdate({
    fase: 'inicio',
    office_id: officeId,
    campos: alteracoes,
    fila: filaAntes,
  })

  const { tipo_oficina: _tipoIgnorado, ...patchSemTipo } = patch
  const configuracaoOtimista: ConfiguracaoOficina = {
    ...db.configuracao,
    ...patchSemTipo,
    tipo_oficina: db.configuracao.tipo_oficina,
    updated_at: new Date().toISOString(),
  }
  // Cache local otimista — será substituído pela leitura confirmada do Supabase.
  salvarLocal(configuracaoOtimista)

  if (getCraftPersistenceMode() !== 'supabase' || !deveUsarSupabaseAuth()) {
    logConfigUpdate({
      fase: 'somente_local',
      office_id: officeId,
      campos: alteracoes,
      resposta_supabase: null,
      fila: statusFilaConfig(officeId),
    })
    return {
      salvouSupabase: false,
      mensagem: MSG.dadosSalvos,
    }
  }

  const resultado = await persistirConfiguracaoOficinaNoSupabase(
    configuracaoOtimista,
    db.proximo_numero_os
  )

  if (resultado.salvouSupabase && resultado.configuracao) {
    // Confirmação remota → atualiza cache local com o que o Supabase devolveu.
    salvarLocal(resultado.configuracao)
    emitirEventoPersistencia({ type: 'supabase_ok' })
    logConfigUpdate({
      fase: 'ok',
      office_id: officeId,
      campos: alteracoes,
      resposta_supabase: {
        ok: true,
        office_uuid: resultado.officeUuid ?? null,
        updated_at: resultado.configuracao.updated_at ?? null,
      },
      erro: null,
      fila: statusFilaConfig(officeId),
    })
    return {
      salvouSupabase: true,
      mensagem: MENSAGEM_SUCESSO_OFICINA_SUPABASE,
      configuracao: resultado.configuracao,
    }
  }

  logConfigUpdate({
    fase: 'erro',
    office_id: officeId,
    campos: alteracoes,
    resposta_supabase: {
      ok: false,
      erros: resultado.erros,
    },
    erro: resultado.mensagem || MENSAGEM_FALLBACK_OFICINA,
    fila: statusFilaConfig(officeId),
  })

  return {
    salvouSupabase: false,
    mensagem: resultado.mensagem || MENSAGEM_FALLBACK_OFICINA,
  }
}

export { MENSAGEM_SUCESSO_OFICINA_SUPABASE, MENSAGEM_FALLBACK_OFICINA }
