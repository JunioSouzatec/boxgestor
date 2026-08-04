/**
 * RC2 Venda Balcão — erros amigáveis + log seguro de diagnóstico.
 */
import { isErroRlsSupabase } from '@/services/supabase-sync/supabase-phase1.persistence'

export type EtapaVendaBalcao =
  | 'validacao'
  | 'criar_counter_sales'
  | 'criar_counter_sale_items'
  | 'baixar_estoque'
  | 'registrar_movimentacao'
  | 'atualizar_craft_meta'
  | 'desconhecida'

export interface ErroSupabaseLike {
  message?: string
  details?: string
  hint?: string
  code?: string
}

export function extrairErroSupabase(erro: unknown): ErroSupabaseLike {
  if (!erro || typeof erro !== 'object') {
    return { message: typeof erro === 'string' ? erro : undefined }
  }
  const e = erro as Record<string, unknown>
  return {
    message: typeof e.message === 'string' ? e.message : undefined,
    details: typeof e.details === 'string' ? e.details : undefined,
    hint: typeof e.hint === 'string' ? e.hint : undefined,
    code: typeof e.code === 'string' ? e.code : undefined,
  }
}

export class VendaBalcaoSaveError extends Error {
  etapa: EtapaVendaBalcao
  causeRaw?: unknown

  constructor(etapa: EtapaVendaBalcao, cause: unknown, mensagem?: string) {
    const msg =
      mensagem ??
      // evita recursão: mapeia só a causa bruta
      mapearMensagemEtapa(etapa, cause)
    super(msg)
    this.name = 'VendaBalcaoSaveError'
    this.etapa = etapa
    this.causeRaw = cause
  }
}

export function logErroVendaBalcao(params: {
  etapa: EtapaVendaBalcao
  erro: unknown
  payload?: Record<string, unknown>
}): void {
  const raiz =
    params.erro instanceof VendaBalcaoSaveError && params.erro.causeRaw != null
      ? params.erro.causeRaw
      : params.erro
  const supabase = extrairErroSupabase(raiz)
  console.error('[VendaBalcao] falha ao salvar', {
    etapa:
      params.erro instanceof VendaBalcaoSaveError
        ? params.erro.etapa
        : params.etapa,
    code: supabase.code ?? null,
    message: supabase.message ?? null,
    details: supabase.details ?? null,
    hint: supabase.hint ?? null,
    payload: params.payload ?? null,
  })
}

function causaRaiz(erro: unknown): unknown {
  if (erro instanceof VendaBalcaoSaveError && erro.causeRaw != null) return erro.causeRaw
  if (erro && typeof erro === 'object' && 'cause' in erro) {
    const cause = (erro as { cause?: unknown }).cause
    if (cause != null) return cause
  }
  return erro
}

function mapearMensagemEtapa(etapa: EtapaVendaBalcao, erro: unknown): string {
  return mensagemErroVendaBalcaoParaUsuario(etapa, erro)
}

/** Mensagem para UI — sem stack/SQL cru. */
export function mensagemErroVendaBalcaoParaUsuario(
  etapa: EtapaVendaBalcao,
  erro: unknown
): string {
  const etapaEfetiva =
    erro instanceof VendaBalcaoSaveError ? erro.etapa : etapa
  const raiz = causaRaiz(erro)
  const supabase = extrairErroSupabase(raiz)
  const msg = (supabase.message ?? '').toLowerCase()
  const code = supabase.code ?? ''
  const textoBruto =
    (erro instanceof Error ? erro.message : '') ||
    (typeof raiz === 'string' ? raiz : '') ||
    supabase.message ||
    ''

  if (
    textoBruto.includes('Quantidade indisponível') ||
    msg.includes('quantidade indisponível')
  ) {
    return 'Não foi possível salvar a venda: item sem estoque suficiente.'
  }
  if (textoBruto.includes('Peça não encontrada')) {
    return 'Não foi possível salvar a venda: peça não encontrada no estoque local.'
  }

  if (isErroRlsSupabase(supabase) || code === '42501') {
    return 'Não foi possível salvar a venda: sem permissão para registrar venda balcão.'
  }

  if (code === '23503' || msg.includes('foreign key')) {
    if (msg.includes('inventory_item') || msg.includes('inventory_items')) {
      return 'Não foi possível salvar a venda: peça ainda não sincronizada no estoque remoto.'
    }
    if (msg.includes('seller_user') || msg.includes('auth.users')) {
      return 'Não foi possível salvar a venda: responsável inválido para o registro.'
    }
    return 'Não foi possível salvar a venda: falha ao registrar item da venda.'
  }

  if (
    code === '23514' ||
    code === '23502' ||
    code === '22P02' ||
    msg.includes('check constraint') ||
    msg.includes('invalid input')
  ) {
    return 'Não foi possível salvar a venda: dados inválidos no formulário.'
  }

  if (code === '23505' || msg.includes('duplicate key')) {
    return 'Não foi possível salvar a venda: registro já existe (tente recarregar a lista).'
  }

  // Já é mensagem amigável da própria camada
  if (textoBruto.startsWith('Não foi possível salvar a venda:')) {
    return textoBruto
  }

  switch (etapaEfetiva) {
    case 'criar_counter_sales':
      return 'Não foi possível salvar a venda: falha ao registrar a venda.'
    case 'criar_counter_sale_items':
      return 'Não foi possível salvar a venda: falha ao registrar item da venda.'
    case 'baixar_estoque':
    case 'registrar_movimentacao':
      return 'Não foi possível salvar a venda: falha ao baixar estoque.'
    case 'atualizar_craft_meta':
      return 'Não foi possível salvar a venda: falha ao confirmar baixa de estoque.'
    case 'validacao':
      return textoBruto || 'Não foi possível salvar a venda: verifique os itens.'
    default:
      return 'Não foi possível salvar a venda. Tente novamente.'
  }
}
