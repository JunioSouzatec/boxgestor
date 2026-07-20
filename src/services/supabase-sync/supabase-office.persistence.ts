import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { MSG } from '@/lib/mensagens-usuario'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { deveUsarSupabaseAuth } from '@/services/auth/auth.factory'
import { getCurrentSupabaseSession } from '@/services/auth/supabase-auth-safe.service'
import {
  formatarErroSupabaseParaUsuario,
  isErroRlsSupabase,
} from '@/services/supabase-sync/supabase-phase1.persistence'
import {
  mapearOffice,
  mapearSettings,
  SyncIdMap,
} from '@/services/supabase-sync/mappers'
import {
  mapearOfficeReverso,
  type OfficeRow,
  type SettingsRow,
} from '@/services/supabase-sync/reverse-mappers'
import {
  limparUltimoErroSupabase,
  registrarUltimoErroSupabase,
} from '@/services/supabase-sync/supabase-last-error.storage'
import {
  sanitizarTextoObrigatorioSupabase,
  sanitizarTextoOpcionalSupabase,
} from '@/lib/supabase-sanitize'
import type { SyncErro } from '@/services/supabase-sync/supabase-sync.types'
import { normalizarTipoOficina } from '@/types/tipo-oficina'
import { normalizarComissoesConfig } from '@/types/comissoes'
import { normalizarPermissoesEquipe } from '@/types/permissoes-equipe'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { PostgrestError } from '@supabase/supabase-js'

export const MENSAGEM_SUCESSO_OFICINA_SUPABASE = MSG.dadosSalvos

export const MENSAGEM_FALLBACK_OFICINA = MSG.semConexao

export interface ResultadoSalvarOficinaSupabase {
  ok: boolean
  salvouSupabase: boolean
  mensagem: string
  erros: SyncErro[]
  configuracao?: ConfiguracaoOficina
  officeUuid?: string
}

export interface ResultadoTesteSalvarOficina {
  ok: boolean
  mensagem: string
  office_id?: string
  nome_fantasia_antes?: string | null
  nome_fantasia_depois?: string | null
  updated_at?: string
  erro?: string
}

const MAX_LOGO_METADATA = 280_000

function sanitizarLinha(linha: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [chave, valor] of Object.entries(linha)) {
    if (valor !== undefined) out[chave] = valor
  }
  return out
}

function logoParaMetadata(logoUrl?: string): string | null {
  if (!logoUrl?.trim()) return null
  if (logoUrl.length > MAX_LOGO_METADATA) return null
  return logoUrl.trim()
}

function mesclarMetadataSettings(
  existente: Record<string, unknown>,
  novo: Record<string, unknown>,
  config: ConfiguracaoOficina
): Record<string, unknown> {
  const removida = Boolean(config.logo_removida_em) && !logoParaMetadata(config.logo_url)
  const logoNovo = removida ? null : logoParaMetadata(config.logo_url)
  const logoExistente = removida ? null : (existente.logo_url as string | null | undefined)

  const aparenciaExistente =
    (existente.aparencia as Record<string, unknown> | null | undefined) ?? undefined
  const aparenciaEnviada = config.aparencia
    ? {
        ...aparenciaExistente,
        ...config.aparencia,
        // Só grava limpeza quando o campo veio como string (inclui '').
        nome_exibido:
          typeof config.aparencia.nome_exibido === 'string'
            ? sanitizarTextoOpcionalSupabase(config.aparencia.nome_exibido)
            : sanitizarTextoOpcionalSupabase(
                (aparenciaExistente?.nome_exibido as string | null | undefined) ?? null
              ),
        cores: config.aparencia.cores ?? aparenciaExistente?.cores ?? null,
      }
    : null

  // Sem logo na config (URL vazia / removida): gravar null — não reaproveitar metadata antiga.
  const logoFinal = removida
    ? null
    : logoNovo ?? (config.logo_url?.trim() ? logoExistente : null) ?? null

  return {
    ...existente,
    ...novo,
    // config carrega o valor completo intencional (mantido ou limpo);
    // NÃO cair em existente, senão um campo limpo ressuscita o valor antigo.
    nome_fantasia: sanitizarTextoOpcionalSupabase(config.nome_fantasia),
    whatsapp: sanitizarTextoOpcionalSupabase(config.whatsapp),
    endereco_detalhado: {
      logradouro: sanitizarTextoOpcionalSupabase(config.endereco),
      bairro: sanitizarTextoOpcionalSupabase(config.bairro),
      cidade: sanitizarTextoOpcionalSupabase(config.cidade),
      estado: sanitizarTextoOpcionalSupabase(config.estado),
      cep: sanitizarTextoOpcionalSupabase(config.cep),
    },
    logo_url: logoFinal,
    possui_logo: Boolean(logoFinal),
    logo_removida_em: removida ? config.logo_removida_em ?? new Date().toISOString() : null,
    aparencia: aparenciaEnviada ?? existente.aparencia ?? null,
    /** tipo_oficina só pode ser alterado pelo Admin Sistema — preserva valor remoto */
    tipo_oficina: normalizarTipoOficina(existente.tipo_oficina ?? config.tipo_oficina),
    comissoes_config: normalizarComissoesConfig(
      config.comissoes_config ??
        (existente.comissoes_config as import('@/types/comissoes').ComissoesConfigOficina | undefined)
    ),
    permissions: normalizarPermissoesEquipe(
      config.permissions ??
        (existente.permissions as import('@/types/permissoes-equipe').PermissoesEquipeConfig | undefined)
    ),
    mensagens_prontas: config.mensagens_prontas ?? existente.mensagens_prontas ?? null,
    sincronizado_em: new Date().toISOString(),
    origem: 'salvar_dados_oficina',
  }
}

function logErroSalvarOficina(
  contexto: string,
  officeUuid: string,
  payload: unknown,
  error: PostgrestError | { message?: string; code?: string }
): void {
  console.error(`[Craft Supabase] ${contexto}`, {
    office_id: officeUuid,
    payload,
    codigo: error.code,
    mensagem: error.message,
  })
}

/** Carrega configuração da oficina do Supabase (offices + settings) */
export async function carregarConfiguracaoOficinaDoSupabase(
  officeLocalId: string
): Promise<{ ok: boolean; configuracao?: ConfiguracaoOficina; officeUuid?: string; erro?: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, erro: 'Supabase não configurado' }
  }

  const contexto = await obterContextoOfficeSupabase(officeLocalId)
  const officeUuid = contexto?.officeUuid
  if (!officeUuid) {
    return { ok: false, erro: 'Profile sem office_id' }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return { ok: false, erro: 'Cliente Supabase indisponível' }
  }

  const [officeRes, settingsRes] = await Promise.all([
    supabase.from('offices').select('*').eq('id', officeUuid).maybeSingle(),
    supabase.from('settings').select('*').eq('office_id', officeUuid).maybeSingle(),
  ])

  if (officeRes.error) {
    return { ok: false, erro: officeRes.error.message }
  }
  if (!officeRes.data) {
    return { ok: false, erro: 'Office não encontrada no Supabase' }
  }

  const configuracao = await mapearOfficeReverso(
    officeRes.data as OfficeRow,
    (settingsRes.data as SettingsRow | null) ?? null,
    officeLocalId
  )

  return { ok: true, configuracao, officeUuid }
}

/**
 * Persiste explicitamente offices + settings da oficina logada.
 * Aguarda resposta do Supabase e confirma que o registro foi atualizado.
 */
export async function persistirConfiguracaoOficinaNoSupabase(
  configuracao: ConfiguracaoOficina,
  proximoNumeroOs: number
): Promise<ResultadoSalvarOficinaSupabase> {
  const erros: SyncErro[] = []

  if (!isSupabaseConfigured() || !deveUsarSupabaseAuth()) {
    return {
      ok: true,
      salvouSupabase: false,
      mensagem: 'Dados salvos localmente.',
      erros: [],
    }
  }

  const session = await getCurrentSupabaseSession()
  if (!session?.user?.id) {
    return {
      ok: false,
      salvouSupabase: false,
      mensagem: MENSAGEM_FALLBACK_OFICINA,
      erros: [{ entidade: 'auth', mensagem: 'Sessão Supabase não encontrada' }],
    }
  }

  const contexto = await obterContextoOfficeSupabase(
    configuracao.office_id ?? configuracao.oficina_id ?? configuracao.id
  )

  if (!contexto?.officeUuid) {
    console.error('[Craft Supabase] Salvar oficina — sem office_id no profile', {
      user_id: session.user.id,
    })
    return {
      ok: false,
      salvouSupabase: false,
      mensagem: 'Usuário sem oficina vinculada no Supabase.',
      erros: [{ entidade: 'profile', mensagem: 'office_id não encontrado no profile' }],
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      salvouSupabase: false,
      mensagem: MENSAGEM_FALLBACK_OFICINA,
      erros: [{ entidade: 'conexão', mensagem: 'Cliente Supabase indisponível' }],
    }
  }

  const officeUuid = contexto.officeUuid
  const agora = new Date().toISOString()

  const ids = new SyncIdMap()
  ids.seed(configuracao.id, officeUuid)
  ids.seed(configuracao.office_id ?? configuracao.id, officeUuid)

  const configComUuid: ConfiguracaoOficina = {
    ...configuracao,
    id: officeUuid,
    office_id: officeUuid,
    oficina_id: officeUuid,
    updated_at: agora,
  }

  try {
    const officeRow = await mapearOffice(configComUuid, ids)
    const payloadOffice = sanitizarLinha({
      name: sanitizarTextoObrigatorioSupabase(configComUuid.nome, 'Oficina'),
      address: officeRow.address as string,
      phone: sanitizarTextoObrigatorioSupabase(configComUuid.telefone),
      cnpj: sanitizarTextoOpcionalSupabase(configComUuid.cnpj),
      email: sanitizarTextoOpcionalSupabase(configComUuid.email),
      updated_at: agora,
    })

    if (import.meta.env.DEV) {
      console.info('[Craft Supabase] UPDATE offices', { office_id: officeUuid, payload: payloadOffice })
    }

    const { data: officeAtualizado, error: officeError } = await supabase
      .from('offices')
      .update(payloadOffice as never)
      .eq('id', officeUuid)
      .select('id, name, updated_at')
      .maybeSingle()

    if (officeError) {
      logErroSalvarOficina('Erro UPDATE offices', officeUuid, payloadOffice, officeError)
      registrarUltimoErroSupabase({
        mensagem: officeError.message,
        entidade: 'offices',
        codigo: officeError.code,
      })
      erros.push({
        entidade: 'Oficina',
        id: officeUuid,
        mensagem: formatarErroSupabaseParaUsuario(officeError),
      })
    } else if (!officeAtualizado) {
      const msg = 'Nenhuma linha atualizada em offices (RLS ou office_id incorreto).'
      logErroSalvarOficina('UPDATE offices sem linhas', officeUuid, payloadOffice, { message: msg })
      erros.push({ entidade: 'Oficina', id: officeUuid, mensagem: msg })
    }

    const { data: settingsExistente, error: settingsReadError } = await supabase
      .from('settings')
      .select('id, created_at, metadata, updated_at')
      .eq('office_id', officeUuid)
      .maybeSingle()

    if (settingsReadError) {
      logErroSalvarOficina('Erro SELECT settings', officeUuid, {}, settingsReadError)
      erros.push({
        entidade: 'Configurações',
        id: officeUuid,
        mensagem: formatarErroSupabaseParaUsuario(settingsReadError),
      })
    }

    const settingsRow = await mapearSettings(configComUuid, proximoNumeroOs, ids)
    settingsRow.office_id = officeUuid

    const metadataExistente = ((settingsExistente as SettingsRow | null)?.metadata ??
      {}) as Record<string, unknown>
    settingsRow.metadata = mesclarMetadataSettings(
      metadataExistente,
      settingsRow.metadata as Record<string, unknown>,
      configComUuid
    )

    const settingsRemoto = settingsExistente as { id: string; created_at?: string } | null
    if (settingsRemoto?.id) {
      settingsRow.id = settingsRemoto.id
      if (settingsRemoto.created_at) settingsRow.created_at = settingsRemoto.created_at
    }

    settingsRow.updated_at = agora

    const payloadSettings = sanitizarLinha({
      id: settingsRow.id,
      office_id: officeUuid,
      dark_theme: settingsRow.dark_theme,
      notifications: settingsRow.notifications,
      low_stock_alert: settingsRow.low_stock_alert,
      next_service_order_num: settingsRow.next_service_order_num,
      metadata: settingsRow.metadata,
      created_at: settingsRow.created_at,
      updated_at: agora,
    })

    if (import.meta.env.DEV) {
      console.info('[Craft Supabase] UPSERT settings', {
        office_id: officeUuid,
        metadata: payloadSettings.metadata,
      })
    }

    const { data: settingsAtualizado, error: settingsError } = await supabase
      .from('settings')
      .upsert(payloadSettings as never, { onConflict: 'office_id' })
      .select('id, office_id, metadata, updated_at')
      .maybeSingle()

    if (settingsError) {
      logErroSalvarOficina('Erro UPSERT settings', officeUuid, payloadSettings, settingsError)
      registrarUltimoErroSupabase({
        mensagem: settingsError.message,
        entidade: 'settings',
        codigo: settingsError.code,
      })
      erros.push({
        entidade: 'Configurações',
        id: officeUuid,
        mensagem: formatarErroSupabaseParaUsuario(settingsError),
      })
    } else if (!settingsAtualizado) {
      const msg = 'Settings não confirmado após upsert.'
      logErroSalvarOficina('UPSERT settings sem retorno', officeUuid, payloadSettings, { message: msg })
      erros.push({ entidade: 'Configurações', id: officeUuid, mensagem: msg })
    }

    if (erros.length > 0) {
      const primeiro = erros[0]
      return {
        ok: false,
        salvouSupabase: false,
        mensagem: isErroRlsSupabase({ message: primeiro?.mensagem ?? '' } as PostgrestError)
          ? primeiro.mensagem
          : MENSAGEM_FALLBACK_OFICINA,
        erros,
      }
    }

    const recarregado = await carregarConfiguracaoOficinaDoSupabase(
      configuracao.office_id ?? configuracao.oficina_id ?? configuracao.id
    )

    if (!recarregado.ok || !recarregado.configuracao) {
      return {
        ok: false,
        salvouSupabase: false,
        mensagem: MENSAGEM_FALLBACK_OFICINA,
        erros: [
          {
            entidade: 'verificação',
            mensagem: recarregado.erro ?? 'Não foi possível confirmar dados no Supabase',
          },
        ],
      }
    }

    const camposVerificar: Array<{
      campo: string
      enviado: string | null
      lido: string | null
    }> = [
      {
        campo: 'nome_fantasia',
        enviado: sanitizarTextoOpcionalSupabase(configComUuid.nome_fantasia),
        lido: sanitizarTextoOpcionalSupabase(recarregado.configuracao.nome_fantasia),
      },
      {
        campo: 'whatsapp',
        enviado: sanitizarTextoOpcionalSupabase(configComUuid.whatsapp),
        lido: sanitizarTextoOpcionalSupabase(recarregado.configuracao.whatsapp),
      },
      {
        campo: 'cnpj',
        enviado: sanitizarTextoOpcionalSupabase(configComUuid.cnpj),
        lido: sanitizarTextoOpcionalSupabase(recarregado.configuracao.cnpj),
      },
    ]

    if (typeof configComUuid.aparencia?.nome_exibido === 'string') {
      camposVerificar.push({
        campo: 'nome_exibido',
        enviado: sanitizarTextoOpcionalSupabase(configComUuid.aparencia.nome_exibido),
        lido: sanitizarTextoOpcionalSupabase(recarregado.configuracao.aparencia?.nome_exibido),
      })
    }

    const divergencia = camposVerificar.find((c) => c.enviado !== c.lido)
    if (divergencia) {
      console.error('[BoxGestor Config][update]', {
        fase: 'verificacao_falhou',
        office_id: officeUuid,
        campo: divergencia.campo,
        valor_enviado: divergencia.enviado,
        valor_lido: divergencia.lido,
      })
      return {
        ok: false,
        salvouSupabase: false,
        mensagem: MENSAGEM_FALLBACK_OFICINA,
        erros: [
          {
            entidade: 'verificação',
            mensagem: `Campo ${divergencia.campo} não confirmado no Supabase após salvar.`,
          },
        ],
      }
    }

    limparUltimoErroSupabase()
    return {
      ok: true,
      salvouSupabase: true,
      mensagem: MENSAGEM_SUCESSO_OFICINA_SUPABASE,
      erros: [],
      configuracao: recarregado.configuracao,
      officeUuid,
    }
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : 'Erro ao salvar oficina'
    console.error('[BoxGestor Config][update]', {
      fase: 'erro_inesperado',
      office_id: officeUuid,
      erro: mensagem,
    })
    registrarUltimoErroSupabase({ mensagem, entidade: 'oficina' })
    return {
      ok: false,
      salvouSupabase: false,
      mensagem: MENSAGEM_FALLBACK_OFICINA,
      erros: [{ entidade: 'Oficina', mensagem }],
    }
  }
}

/** Teste de diagnóstico: grava e relê nome_fantasia no Supabase */
export async function testarSalvarOficinaNoSupabase(
  officeLocalId: string
): Promise<ResultadoTesteSalvarOficina> {
  const carregado = await carregarConfiguracaoOficinaDoSupabase(officeLocalId)
  if (!carregado.ok || !carregado.configuracao || !carregado.officeUuid) {
    return { ok: false, mensagem: carregado.erro ?? 'Falha ao carregar oficina' }
  }

  const antes =
    (carregado.configuracao.nome_fantasia as string | undefined) ??
    null
  const token = Date.now().toString(36).slice(-5)
  const nomeTeste = `Teste BoxGestor ${token}`

  const resultado = await persistirConfiguracaoOficinaNoSupabase(
    { ...carregado.configuracao, nome_fantasia: nomeTeste },
    1001
  )

  if (!resultado.salvouSupabase) {
    return {
      ok: false,
      mensagem: 'Falha ao salvar teste no Supabase',
      office_id: carregado.officeUuid,
      nome_fantasia_antes: antes,
      erro: resultado.erros[0]?.mensagem ?? resultado.mensagem,
    }
  }

  const relido = await carregarConfiguracaoOficinaDoSupabase(officeLocalId)
  const depois = relido.configuracao?.nome_fantasia ?? null
  const persistiu = depois === nomeTeste

  if (antes) {
    await persistirConfiguracaoOficinaNoSupabase(
      { ...carregado.configuracao, nome_fantasia: antes },
      1001
    )
  }

  return {
    ok: persistiu,
    mensagem: persistiu
      ? `Teste OK: nome_fantasia persistiu como "${depois}".`
      : `Teste falhou: esperado "${nomeTeste}", lido "${depois ?? 'null'}".`,
    office_id: carregado.officeUuid,
    nome_fantasia_antes: antes,
    nome_fantasia_depois: depois,
    updated_at: relido.configuracao?.updated_at,
    erro: persistiu ? undefined : 'Valor não persistiu após reler do Supabase',
  }
}
