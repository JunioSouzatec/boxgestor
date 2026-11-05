/**
 * Verificação de placa no cadastro persistido da oficina (antes de consulta externa).
 * Supabase: consulta motorcycles com office_id + RLS do usuário.
 * Modo local: repositório completo da oficina (não lista parcial do React).
 */
import { getCraftPersistenceMode, getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { normalizarPlaca, placasIguais } from '@/lib/placa-normalizar'
import { extrairCamposVeiculoDeNotes } from '@/lib/veiculo-campos-sync'
import {
  mensagemBloqueioPlacaVeiculoExistente,
  MSG_BLOQUEIO_SALVAR_VERIFICACAO_PLACA_INCONCLUSIVA,
} from '@/lib/moto-form'
import { encontrarVeiculoPorPlacaExata } from '@/services/busca-placa.service'
import { localCraftRepository } from '@/services/repository/local.repository'
import { obterUuidPorLocalId } from '@/services/supabase-sync/id-registry'
import type { Moto } from '@/types/moto'

export type StatusVerificacaoPlacaOficina = 'encontrado' | 'nao_encontrado' | 'erro'

export type VeiculoOficinaPorPlaca = {
  motoId: string
  placa: string
  marca: string
  modelo: string
  ano?: number
  cor?: string
  combustivel?: string
  clienteId: string
  clienteNome?: string
  origem: 'local' | 'supabase'
  dadosCompletos: boolean
}

export type ResultadoVerificacaoPlacaOficina =
  | { status: 'encontrado'; veiculo: VeiculoOficinaPorPlaca }
  | { status: 'nao_encontrado' }
  | { status: 'erro'; codigo: string; mensagem: string }

export const MSG_VERIFICACAO_PLACA_ERRO =
  'Não foi possível confirmar se esta placa já está cadastrada na oficina. Tente novamente antes de consultar o fornecedor.'

export const MSG_VERIFICACAO_PLACA_OFFLINE =
  'Sem conexão para confirmar no servidor se a placa já existe. Conecte-se e tente novamente.'

type MotorcycleRowRemoto = {
  id: string
  brand: string
  model: string
  year: number
  plate: string
  color: string
  customer_id: string
  notes: string | null
  deleted_at?: string | null
}

export function veiculoOficinaDadosCompletos(v: {
  marca: string
  modelo: string
  ano?: number
  cor?: string
}): boolean {
  return Boolean(
    v.marca.trim() &&
      v.modelo.trim() &&
      typeof v.ano === 'number' &&
      v.ano > 0 &&
      Boolean(v.cor?.trim())
  )
}

export function motoLocalParaVeiculoOficina(
  moto: Moto,
  clienteNome?: string
): VeiculoOficinaPorPlaca {
  const { meta } = extrairCamposVeiculoDeNotes(moto.observacoes)
  const veiculo: VeiculoOficinaPorPlaca = {
    motoId: moto.id,
    placa: moto.placa,
    marca: moto.marca,
    modelo: moto.modelo,
    ano: moto.ano,
    cor: moto.cor,
    combustivel: meta.combustivel,
    clienteId: moto.cliente_id,
    clienteNome,
    origem: 'local',
    dadosCompletos: false,
  }
  veiculo.dadosCompletos = veiculoOficinaDadosCompletos(veiculo)
  return veiculo
}

function motoRemotaParaVeiculoOficina(
  row: MotorcycleRowRemoto,
  clienteNome?: string
): VeiculoOficinaPorPlaca {
  const { meta } = extrairCamposVeiculoDeNotes(row.notes)
  const veiculo: VeiculoOficinaPorPlaca = {
    motoId: row.id,
    placa: row.plate,
    marca: row.brand,
    modelo: row.model,
    ano: row.year,
    cor: row.color,
    combustivel: meta.combustivel,
    clienteId: row.customer_id,
    clienteNome,
    origem: 'supabase',
    dadosCompletos: false,
  }
  veiculo.dadosCompletos = veiculoOficinaDadosCompletos(veiculo)
  return veiculo
}

function buscarMotoLocalCompleta(
  officeId: string,
  placaNorm: string,
  excluirMotoId?: string
): Moto | undefined {
  const db = localCraftRepository.carregar(officeId)
  const motos = db.motos.filter((m) => !m.deleted_at)
  return encontrarVeiculoPorPlacaExata(placaNorm, motos, excluirMotoId)
}

function linhaCorrespondePlaca(row: { plate: string }, placaNorm: string): boolean {
  return placasIguais(row.plate, placaNorm)
}

export type VerificarPlacaOficinaDeps = {
  officeId: string
  placa: string
  excluirMotoId?: string
  resolverNomeCliente?: (clienteId: string) => string | undefined
  /** Testes — substitui consulta Supabase. */
  buscarRemoto?: (
    officeUuid: string,
    placaNorm: string
  ) => Promise<
    | { ok: true; row: MotorcycleRowRemoto | null }
    | { ok: false; codigo: string; mensagem: string }
  >
  /** Testes — força online/offline. */
  online?: boolean
  exigeConfirmacaoRemota?: boolean
}

async function buscarMotoSupabasePorPlaca(
  officeUuid: string,
  placaNorm: string
): Promise<
  | { ok: true; row: MotorcycleRowRemoto | null }
  | { ok: false; codigo: string; mensagem: string }
> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      codigo: 'SUPABASE_INDISPONIVEL',
      mensagem: MSG_VERIFICACAO_PLACA_ERRO,
    }
  }

  const sel =
    'id, brand, model, year, plate, color, customer_id, notes, deleted_at' as const

  const { data: exato, error: errExato } = await supabase
    .from('motorcycles')
    .select(sel)
    .eq('office_id', officeUuid)
    .is('deleted_at', null)
    .eq('plate', placaNorm)
    .maybeSingle()

  if (errExato) {
    return {
      ok: false,
      codigo: 'SUPABASE_ERRO',
      mensagem: MSG_VERIFICACAO_PLACA_ERRO,
    }
  }

  if (exato && linhaCorrespondePlaca(exato as MotorcycleRowRemoto, placaNorm)) {
    return { ok: true, row: exato as MotorcycleRowRemoto }
  }

  const { data: linhas, error: errLista } = await supabase
    .from('motorcycles')
    .select(sel)
    .eq('office_id', officeUuid)
    .is('deleted_at', null)

  if (errLista) {
    return {
      ok: false,
      codigo: 'SUPABASE_ERRO',
      mensagem: MSG_VERIFICACAO_PLACA_ERRO,
    }
  }

  const match = (linhas ?? []).find((r) =>
    linhaCorrespondePlaca(r as MotorcycleRowRemoto, placaNorm)
  ) as MotorcycleRowRemoto | undefined

  return { ok: true, row: match ?? null }
}

async function resolverNomeClienteRemoto(
  officeUuid: string,
  customerId: string
): Promise<string | undefined> {
  const supabase = getSupabaseClient()
  if (!supabase) return undefined
  const { data } = await supabase
    .from('customers')
    .select('name')
    .eq('office_id', officeUuid)
    .eq('id', customerId)
    .maybeSingle()
  const nome = data && typeof (data as { name?: unknown }).name === 'string'
    ? (data as { name: string }).name.trim()
    : ''
  return nome || undefined
}

/**
 * Verifica se a placa já existe no cadastro da oficina.
 * Em modo Supabase online, exige confirmação remota; falha remota → status erro (não presume placa nova).
 */
export async function verificarPlacaCadastradaNaOficina(
  deps: VerificarPlacaOficinaDeps
): Promise<ResultadoVerificacaoPlacaOficina> {
  const placaNorm = normalizarPlaca(deps.placa)
  if (!placaNorm) {
    return { status: 'erro', codigo: 'PLACA_INVALIDA', mensagem: 'Placa inválida.' }
  }

  const local = buscarMotoLocalCompleta(deps.officeId, placaNorm, deps.excluirMotoId)
  const modoSupabase =
    deps.exigeConfirmacaoRemota ??
    (getCraftPersistenceMode() === 'supabase' && isSupabaseConfigured())
  const online = deps.online ?? (typeof navigator === 'undefined' ? true : navigator.onLine)

  if (modoSupabase && !online) {
    if (local) {
      const nome = deps.resolverNomeCliente?.(local.cliente_id)
      return {
        status: 'encontrado',
        veiculo: motoLocalParaVeiculoOficina(local, nome),
      }
    }
    return {
      status: 'erro',
      codigo: 'OFFLINE_SEM_CONFIRMACAO',
      mensagem: MSG_VERIFICACAO_PLACA_OFFLINE,
    }
  }

  if (!modoSupabase) {
    if (local) {
      const nome = deps.resolverNomeCliente?.(local.cliente_id)
      return {
        status: 'encontrado',
        veiculo: motoLocalParaVeiculoOficina(local, nome),
      }
    }
    return { status: 'nao_encontrado' }
  }

  const contexto = await obterContextoOfficeSupabase(deps.officeId)
  if (!contexto?.officeUuid) {
    return {
      status: 'erro',
      codigo: 'OFFICE_CONTEXTO',
      mensagem: MSG_VERIFICACAO_PLACA_ERRO,
    }
  }

  const remoto = deps.buscarRemoto
    ? await deps.buscarRemoto(contexto.officeUuid, placaNorm)
    : await buscarMotoSupabasePorPlaca(contexto.officeUuid, placaNorm)

  if (!remoto.ok) {
    if (local) {
      const nome = deps.resolverNomeCliente?.(local.cliente_id)
      return {
        status: 'encontrado',
        veiculo: motoLocalParaVeiculoOficina(local, nome),
      }
    }
    return {
      status: 'erro',
      codigo: remoto.codigo,
      mensagem: remoto.mensagem,
    }
  }

  if (remoto.row) {
    if (deps.excluirMotoId) {
      const uuidEditando = obterUuidPorLocalId(deps.excluirMotoId)
      if (uuidEditando && remoto.row.id === uuidEditando) {
        return { status: 'nao_encontrado' }
      }
      const db = localCraftRepository.carregar(deps.officeId)
      const proprio = db.motos.find((m) => m.id === deps.excluirMotoId && !m.deleted_at)
      if (proprio && placasIguais(proprio.placa, placaNorm)) {
        return { status: 'nao_encontrado' }
      }
    }
    let clienteNome = deps.resolverNomeCliente?.(remoto.row.customer_id)
    if (!clienteNome) {
      clienteNome = await resolverNomeClienteRemoto(
        contexto.officeUuid,
        remoto.row.customer_id
      )
    }
    return {
      status: 'encontrado',
      veiculo: motoRemotaParaVeiculoOficina(remoto.row, clienteNome),
    }
  }

  if (local) {
    const nome = deps.resolverNomeCliente?.(local.cliente_id)
    return {
      status: 'encontrado',
      veiculo: motoLocalParaVeiculoOficina(local, nome),
    }
  }

  return { status: 'nao_encontrado' }
}

export type ValidarPlacaAntesSalvarVeiculoOpts = {
  officeId: string
  placa: string
  excluirMotoId?: string
  resolverNomeCliente?: (clienteId: string) => string | undefined
  rotuloVeiculo?: string
  verificarPlacaOficina?: typeof verificarPlacaCadastradaNaOficina
}

/**
 * Bloqueia criação (ou troca de placa) se a placa já existir na oficina.
 * Retorna mensagem de erro ou null se pode salvar.
 */
export async function validarPlacaAntesSalvarVeiculo(
  opts: ValidarPlacaAntesSalvarVeiculoOpts
): Promise<string | null> {
  const placa = opts.placa.trim()
  if (!placa) return null

  const verificar = opts.verificarPlacaOficina ?? verificarPlacaCadastradaNaOficina
  const resultado = await verificar({
    officeId: opts.officeId,
    placa,
    excluirMotoId: opts.excluirMotoId,
    resolverNomeCliente: opts.resolverNomeCliente,
  })

  if (resultado.status === 'encontrado') {
    const v = resultado.veiculo
    return mensagemBloqueioPlacaVeiculoExistente(
      {
        placa: v.placa,
        marca: v.marca,
        modelo: v.modelo,
        clienteNome: v.clienteNome,
        clienteId: v.clienteId,
      },
      opts.rotuloVeiculo ?? 'veículo'
    )
  }

  if (resultado.status === 'erro') {
    if (resultado.mensagem.includes('gravação foi bloqueada')) {
      return resultado.mensagem
    }
    return MSG_BLOQUEIO_SALVAR_VERIFICACAO_PLACA_INCONCLUSIVA
  }

  return null
}

function assertVerificacao(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

/** Runner local — `npx tsx` via scripts/test-plate-lookup-form-auto-fill.ts */
export async function executarTestesLocaisVerificacaoPlacaOficina(): Promise<void> {
  assertVerificacao(
    veiculoOficinaDadosCompletos({ marca: 'A', modelo: 'B', ano: 2020, cor: 'Prata' }),
    'completo ok'
  )
  assertVerificacao(
    !veiculoOficinaDadosCompletos({ marca: 'A', modelo: 'B', ano: undefined, cor: '' }),
    'incompleto ok'
  )

  const officeId = '__test_plate_verify_office__'
  const db = localCraftRepository.carregar(officeId)
  const moto: Moto = {
    id: 'm1',
    oficina_id: officeId,
    office_id: officeId,
    cliente_id: 'c1',
    marca: 'MARCA',
    modelo: 'MOD',
    ano: 2019,
    placa: 'ABC1D23',
    cor: 'Azul',
    quilometragem: 0,
    criado_em: '2025-01-01',
  }
  localCraftRepository.salvar(officeId, {
    ...db,
    motos: [...db.motos.filter((m) => m.id !== 'm1'), moto],
  })

  const encontrado = await verificarPlacaCadastradaNaOficina({
    officeId,
    placa: 'abc-1d23',
    exigeConfirmacaoRemota: false,
  })
  assertVerificacao(encontrado.status === 'encontrado', 'local encontrado')
  if (encontrado.status === 'encontrado') {
    assertVerificacao(encontrado.veiculo.motoId === 'm1', 'id moto')
  }

  const excluido = await verificarPlacaCadastradaNaOficina({
    officeId,
    placa: 'ABC1D23',
    excluirMotoId: 'm1',
    exigeConfirmacaoRemota: false,
  })
  assertVerificacao(excluido.status === 'nao_encontrado', 'excluir self')

  const remoto = await verificarPlacaCadastradaNaOficina({
    officeId: 'x',
    placa: 'ZZZ9Z99',
    exigeConfirmacaoRemota: true,
    online: true,
    buscarRemoto: async () => ({
      ok: true,
      row: {
        id: 'uuid-remoto',
        brand: 'R',
        model: 'S',
        year: 2021,
        plate: 'ZZZ9Z99',
        color: 'Preto',
        customer_id: 'cust-1',
        notes: null,
      },
    }),
    resolverNomeCliente: () => 'Cliente Teste',
  })
  assertVerificacao(remoto.status === 'encontrado', 'remoto mock')
  if (remoto.status === 'encontrado') {
    assertVerificacao(remoto.veiculo.origem === 'supabase', 'origem supabase')
    assertVerificacao(remoto.veiculo.clienteNome === 'Cliente Teste', 'nome cliente')
  }

  const erroRemoto = await verificarPlacaCadastradaNaOficina({
    officeId: 'x',
    placa: 'NEW0001',
    exigeConfirmacaoRemota: true,
    online: true,
    buscarRemoto: async () => ({
      ok: false,
      codigo: 'SUPABASE_ERRO',
      mensagem: MSG_VERIFICACAO_PLACA_ERRO,
    }),
  })
  assertVerificacao(erroRemoto.status === 'erro', 'erro remoto sem local')

  const ausente = await verificarPlacaCadastradaNaOficina({
    officeId: 'x',
    placa: 'NEW0002',
    exigeConfirmacaoRemota: true,
    online: true,
    buscarRemoto: async () => ({ ok: true, row: null }),
  })
  assertVerificacao(ausente.status === 'nao_encontrado', 'nao encontrado remoto')

  const bloqueio = await validarPlacaAntesSalvarVeiculo({
    officeId,
    placa: 'ABC1D23',
    verificarPlacaOficina: async () => ({
      status: 'encontrado',
      veiculo: motoLocalParaVeiculoOficina(moto, 'Cliente X'),
    }),
  })
  assertVerificacao(typeof bloqueio === 'string' && bloqueio.includes('ABC1D23'), 'bloqueio salvar')

  const livre = await validarPlacaAntesSalvarVeiculo({
    officeId,
    placa: 'ABC1D23',
    excluirMotoId: 'm1',
    verificarPlacaOficina: async () => ({ status: 'nao_encontrado' }),
  })
  assertVerificacao(livre === null, 'edicao propria placa livre')
}
