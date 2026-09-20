import { localIdParaUuid } from '@/lib/local-id-uuid'
import { getDataLocalHoje } from '@/lib/data-local'
import { placasIguais } from '@/lib/placa-normalizar'
import {
  normalizarCpfCliente,
  normalizarNomeCliente,
  normalizarTelefoneCliente,
} from '@/services/clientes/deduplicate-clientes.service'
import {
  mappingEhHashDeterministico,
  obterLocalIdPorUuid,
  obterOrigemMapeamentoId,
  obterUuidPorLocalId,
  registrarMapeamentoIdConfirmado,
} from '@/services/supabase-sync/id-registry'
import {
  HEAL_CLI_LOCAL,
  HEAL_CUSTOMER_REAL,
  HEAL_MOTO_LOCAL,
  HEAL_MOTO_REAL,
  idRegistryObservado,
  idsTecnicosLimitados,
  logRegistryHeal,
  marcarHealCustomerExecutou,
  marcarHealVehicleExecutou,
} from '@/services/supabase-sync/registry-heal-log'
import type { Cliente } from '@/types/cliente'
import type { CraftDatabase } from '@/types/database'
import type { Moto } from '@/types/moto'
import {
  aplicarMetaVeiculoEmMoto,
  extrairCamposVeiculoDeNotes,
} from '@/lib/veiculo-campos-sync'
import { normalizarTipoOficina } from '@/types/tipo-oficina'
import { normalizarComissoesConfig } from '@/types/comissoes'
import { normalizarCaixaConfig } from '@/types/caixa-config'
import { normalizarDadosFiscaisOficina } from '@/types/fiscal'
import { normalizarFiscalConfig } from '@/types/fiscal-config'
import { mesclarMetadataCliente, type MetadataCliente } from '@/types/fiscal-cliente'
import { getPermissoesEquipeSeguras } from '@/types/permissoes-equipe'
import type { ConfiguracaoOficina, PreferenciasSistema, AparienciaOficina } from '@/types/oficina'
import type { OrdemServico, PecaUtilizada, AjusteMaoObraOS } from '@/types/ordem-servico'
import type { StatusFinanceiroOS, StatusOS } from '@/types/enums'
import { normalizarStatusOrcamentoCarregado } from '@/lib/orcamento-fluxo'
import type { ServicoOSItem } from '@/types/servico-catalogo'

interface OfficeRow {
  id: string
  name: string
  address: string
  phone: string
  cnpj: string | null
  email: string | null
  created_at: string
  updated_at: string
}

interface SettingsRow {
  id?: string
  office_id: string
  dark_theme: boolean
  notifications: boolean
  low_stock_alert: boolean
  next_service_order_num: number
  metadata: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
}

interface CustomerRow {
  id: string
  name: string
  phone: string
  cpf: string | null
  address: string
  notes: string | null
  metadata?: Record<string, unknown> | null
  deleted_at?: string | null
  created_at: string
  updated_at: string
}

interface MotorcycleRow {
  id: string
  customer_id: string
  brand: string
  model: string
  year: number
  plate: string
  color: string
  mileage: number
  chassis: string | null
  notes: string | null
  deleted_at?: string | null
  created_at: string
  updated_at: string
}

interface PartsUsedPayload {
  pecas?: PecaUtilizada[]
  craft_meta?: {
    local_id?: string
    valor_adicional?: number
    servicos_itens?: ServicoOSItem[]
    ajuste_mao_obra?: AjusteMaoObraOS | null
    status_financeiro?: StatusFinanceiroOS | null
    data_previsao?: string | null
    data_entrada?: string | null
    data_saida?: string | null
    estoque_baixado?: boolean | null
    responsavel?: string | null
    responsavel_id?: string | null
    comissao_snapshot?: import('@/types/comissoes').ComissaoRegraSnapshotOS | null
    observacoes_garantia?: string | null
    observacoes_orcamento?: string | null
    modo_documento?: string | null
    valor_estimado_historico?: number | null
    os_gerada_id?: string | null
    os_gerada_numero?: number | null
    orcamento_origem_id?: string | null
    orcamento_origem_numero?: number | null
    orcamento_convertido_em?: string | null
    orcamento_convertido_por?: string | null
    criado_por_id?: string | null
    criado_por_nome?: string | null
    historico_eventos?: import('@/types/os-historico').EventoHistoricoOS[] | null
    aprovacao_cliente?: import('@/types/aprovacao-orcamento').AprovacaoClienteMeta | null
    /** Soft delete da OS (publicado em craft_meta; sem coluna na tabela) */
    deleted_at?: string | null
  }
}

interface ServiceOrderRow {
  id: string
  customer_id: string
  motorcycle_id: string
  number: number
  reported_issue: string
  diagnosis: string
  services_performed: string
  parts_used: PartsUsedPayload | PecaUtilizada[] | null
  parts_value: number
  labor_value: number
  discount: number
  total_value: number
  status: StatusOS
  entry_checklist: OrdemServico['checklist_entrada'] | null
  estimated_value: number | null
  budget_date: string | null
  budget_status: string | null
  entry_mileage: number | null
  exit_mileage: number | null
  warranty_days: number | null
  warranty_expires_at: string | null
  created_at: string
  updated_at: string
}

function isoParaDataLocal(iso?: string): string {
  if (!iso) return getDataLocalHoje()
  return iso.slice(0, 10)
}

async function resolverLocalId(
  uuid: string,
  candidatos: string[],
  prefixoFallback: string
): Promise<string> {
  const registrado = obterLocalIdPorUuid(uuid)
  if (registrado) {
    registrarMapeamentoIdConfirmado(registrado, uuid, 'reverse_resolverLocalId')
    return registrado
  }

  for (const localId of candidatos) {
    if (await localIdParaUuid(localId) === uuid) {
      registrarMapeamentoIdConfirmado(localId, uuid, 'reverse_resolverLocalId')
      return localId
    }
  }

  const fallback = `${prefixoFallback}-${uuid.slice(0, 8)}`
  registrarMapeamentoIdConfirmado(fallback, uuid, 'reverse_resolverLocalId')
  return fallback
}

function idsLocaisReais(candidatos: string[], extras: string[] = []): Set<string> {
  return new Set(
    [...candidatos, ...extras].map((id) => id.trim()).filter(Boolean)
  )
}

function ehSelfMapFantasma(
  registrado: string | undefined,
  rowId: string,
  idsLocais: Set<string>
): boolean {
  if (!registrado) return false
  const local = registrado.trim()
  const remoto = rowId.trim()
  return local === remoto && !idsLocais.has(remoto)
}

async function escolherLocalIdReverso(input: {
  rowId: string
  candidatos: string[]
  idsLocaisReais: Set<string>
  matchSemantico?: string
  prefixoFallback: string
}): Promise<{ localId: string; caminho: string }> {
  const rowId = input.rowId.trim()
  const registrado = obterLocalIdPorUuid(rowId)
  const fantasma = ehSelfMapFantasma(registrado, rowId, input.idsLocaisReais)

  for (const candidato of input.candidatos) {
    const localId = candidato.trim()
    if (localId && (await localIdParaUuid(localId)) === rowId) {
      return { localId, caminho: 'hash_legitimo' }
    }
  }

  const semantico = input.matchSemantico?.trim()
  if (semantico && (await mappingEhHashDeterministico(semantico))) {
    return { localId: semantico, caminho: 'match_semantico' }
  }

  if (registrado && !fantasma) return { localId: registrado, caminho: 'self_map' }
  if (semantico) return { localId: semantico, caminho: 'match_semantico' }
  if (fantasma && registrado) return { localId: registrado, caminho: 'self_map' }

  return {
    localId: `${input.prefixoFallback}-${rowId.slice(0, 8)}`,
    caminho: 'fallback',
  }
}

async function promoverHashHistoricoParaRow(
  rowId: string,
  localIds: Array<string | undefined>,
  caller = 'promoverHashHistoricoParaRow'
): Promise<number> {
  const remoto = rowId.trim()
  if (!remoto) return 0
  const vistos = new Set<string>()
  let promovidos = 0
  for (const bruto of localIds) {
    const localId = bruto?.trim()
    if (!localId || vistos.has(localId)) continue
    vistos.add(localId)
    if (await mappingEhHashDeterministico(localId)) {
      registrarMapeamentoIdConfirmado(localId, remoto, caller)
      promovidos++
    }
  }
  return promovidos
}

function extrairPartsUsed(raw: ServiceOrderRow['parts_used']): PartsUsedPayload {
  if (!raw) return { pecas: [] }
  if (Array.isArray(raw)) return { pecas: raw }
  return raw
}

export async function mapearOfficeReverso(
  row: OfficeRow,
  settings: SettingsRow | null,
  officeLocalId: string
): Promise<ConfiguracaoOficina> {
  registrarMapeamentoIdConfirmado(officeLocalId, row.id, 'reverse_office')

  const metadata = (settings?.metadata ?? {}) as Record<string, unknown>
  const enderecoDetalhado = (metadata.endereco_detalhado ?? {}) as Record<string, string | null>

  const preferencias: PreferenciasSistema = {
    tema_escuro: settings?.dark_theme ?? true,
    notificacoes: settings?.notifications ?? true,
    alerta_estoque_baixo: settings?.low_stock_alert ?? true,
    os_modo:
      metadata.os_modo === 'simples' || metadata.os_modo === 'completa'
        ? metadata.os_modo
        : 'completa',
    os_destaque_numero:
      typeof metadata.os_destaque_numero === 'boolean' ? metadata.os_destaque_numero : true,
    os_sugerir_recibo:
      typeof metadata.os_sugerir_recibo === 'boolean' ? metadata.os_sugerir_recibo : false,
  }

  return {
    id: officeLocalId,
    oficina_id: officeLocalId,
    office_id: officeLocalId,
    nome: row.name,
    nome_fantasia: (metadata.nome_fantasia as string | undefined) ?? undefined,
    endereco: enderecoDetalhado.logradouro ?? row.address.split(' — ')[0] ?? row.address,
    bairro: enderecoDetalhado.bairro ?? undefined,
    cidade: enderecoDetalhado.cidade ?? undefined,
    estado: enderecoDetalhado.estado ?? undefined,
    cep: enderecoDetalhado.cep ?? undefined,
    telefone: row.phone,
    whatsapp: (metadata.whatsapp as string | undefined) ?? undefined,
    logo_url:
      metadata.logo_removida_em && !metadata.logo_url
        ? undefined
        : ((metadata.logo_url as string | undefined) ?? undefined),
    logo_removida_em: (metadata.logo_removida_em as string | undefined) ?? undefined,
    cnpj: row.cnpj ?? undefined,
    email: row.email ?? undefined,
    aparencia: (metadata.aparencia as AparienciaOficina | undefined) ?? undefined,
    tipo_oficina: normalizarTipoOficina(metadata.tipo_oficina),
    comissoes_config: normalizarComissoesConfig(
      metadata.comissoes_config as import('@/types/comissoes').ComissoesConfigOficina | undefined
    ),
    permissions: getPermissoesEquipeSeguras({
      permissions: metadata.permissions as import('@/types/permissoes-equipe').PermissoesEquipeConfig | undefined,
      comissoes_config: normalizarComissoesConfig(
        metadata.comissoes_config as import('@/types/comissoes').ComissoesConfigOficina | undefined
      ),
    }),
    caixa_config: normalizarCaixaConfig(metadata.caixa_config),
    fiscal: normalizarDadosFiscaisOficina(metadata.fiscal),
    fiscal_config: normalizarFiscalConfig(metadata.fiscal_config),
    mensagens_prontas:
      (metadata.mensagens_prontas as import('@/types/comunicacao').ModeloMensagem[] | undefined) ??
      undefined,
    pin_autorizacao_valores: (metadata.pin_autorizacao_valores as string | undefined) ?? undefined,
    office_slug: (metadata.office_slug as string | undefined) ?? undefined,
    preferencias,
    created_at: row.created_at,
    updated_at:
      settings?.updated_at && settings.updated_at > row.updated_at
        ? settings.updated_at
        : row.updated_at,
  }
}

function clienteCasaComRow(row: CustomerRow, cliente: Cliente): boolean {
  const cpfRow = normalizarCpfCliente(row.cpf)
  const telRow = normalizarTelefoneCliente(row.phone)
  if (cpfRow.length >= 11 && normalizarCpfCliente(cliente.cpf) === cpfRow) return true
  if (telRow.length < 8) return false
  return normalizarTelefoneCliente(cliente.telefone) === telRow
}

function encontrarClienteLocalPorChaves(
  row: CustomerRow,
  clientesReferencia: Cliente[]
): Cliente | undefined {
  const cpfRow = normalizarCpfCliente(row.cpf)
  const telRow = normalizarTelefoneCliente(row.phone)
  const nomeRow = normalizarNomeCliente(row.name)

  if (cpfRow.length >= 11) {
    const porCpf = clientesReferencia.find(
      (c) => normalizarCpfCliente(c.cpf) === cpfRow
    )
    if (porCpf) return porCpf
  }

  if (telRow.length >= 8) {
    const porTelNome = clientesReferencia.find(
      (c) =>
        normalizarTelefoneCliente(c.telefone) === telRow &&
        normalizarNomeCliente(c.nome) === nomeRow
    )
    if (porTelNome) return porTelNome

    const porTel = clientesReferencia.find(
      (c) => normalizarTelefoneCliente(c.telefone) === telRow
    )
    if (porTel) return porTel
  }

  return undefined
}

function listarClientesLocaisPorChaves(
  row: CustomerRow,
  clientesReferencia: Cliente[]
): Cliente[] {
  return clientesReferencia.filter((c) => clienteCasaComRow(row, c))
}

function encontrarMotoLocalPorPlaca(
  row: MotorcycleRow,
  motosReferencia: Moto[]
): Moto | undefined {
  if (!row.plate?.trim()) return undefined
  return motosReferencia.find((m) => placasIguais(m.placa, row.plate))
}

function listarMotosLocaisPorPlaca(
  row: MotorcycleRow,
  motosReferencia: Moto[]
): Moto[] {
  if (!row.plate?.trim()) return []
  return motosReferencia.filter((m) => placasIguais(m.placa, row.plate))
}

function metadataClienteDeRow(row: CustomerRow): MetadataCliente | undefined {
  return mesclarMetadataCliente((row.metadata as MetadataCliente | null) ?? null, null)
}

function clienteDeCustomerRow(
  row: CustomerRow,
  officeLocalId: string,
  localId: string
): Cliente {
  return {
    id: localId,
    oficina_id: officeLocalId,
    office_id: officeLocalId,
    nome: row.name,
    telefone: row.phone,
    cpf: row.cpf ?? undefined,
    endereco: row.address,
    observacoes: row.notes ?? undefined,
    metadata: metadataClienteDeRow(row),
    deleted_at: row.deleted_at ?? undefined,
    criado_em: isoParaDataLocal(row.created_at),
    atualizado_em: isoParaDataLocal(row.updated_at),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function mapearCustomerReverso(
  row: CustomerRow,
  officeLocalId: string,
  candidatos: string[],
  clientesReferencia: Cliente[] = []
): Promise<Cliente> {
  const idsLocais = idsLocaisReais(
    candidatos,
    clientesReferencia.map((c) => c.id)
  )
  const matchLocal = encontrarClienteLocalPorChaves(row, clientesReferencia)
  const deveLogar =
    idRegistryObservado(row.id) ||
    idRegistryObservado(matchLocal?.id) ||
    row.id === HEAL_CUSTOMER_REAL
  if (deveLogar) marcarHealCustomerExecutou()
  const mappingAntes = deveLogar
    ? obterUuidPorLocalId(matchLocal?.id ?? HEAL_CLI_LOCAL)
    : undefined
  const origemAntes = deveLogar
    ? obterOrigemMapeamentoId(matchLocal?.id ?? HEAL_CLI_LOCAL)
    : undefined
  const selfMapEncontrado = deveLogar ? obterLocalIdPorUuid(row.id) : undefined
  const entidadeLocalComSelfMap = Boolean(
    selfMapEncontrado && idsLocais.has(selfMapEncontrado)
  )
  const escolhido = await escolherLocalIdReverso({
    rowId: row.id,
    candidatos,
    idsLocaisReais: idsLocais,
    matchSemantico: matchLocal?.id,
    prefixoFallback: 'cli',
  })
  const localId = escolhido.localId

  registrarMapeamentoIdConfirmado(localId, row.id, 'reverse_customer', 'remote_row')
  const promovidos = await promoverHashHistoricoParaRow(
    row.id,
    [matchLocal?.id, ...listarClientesLocaisPorChaves(row, clientesReferencia).map((c) => c.id)],
    'reverse_customer'
  )
  if (deveLogar || idRegistryObservado(localId)) {
    logRegistryHeal({
      etapa: 'mapearCustomerReverso',
      remoteId: row.id,
      localIdEncontrado: localId,
      mappingAntes: mappingAntes ?? null,
      origemAntes: origemAntes ?? null,
      hashDeterministico: await localIdParaUuid(HEAL_CLI_LOCAL),
      selfMapEncontrado: selfMapEncontrado ?? null,
      entidadeLocalComSelfMap,
      matchSemanticoEncontrado: Boolean(matchLocal?.id),
      localIdSemantico: matchLocal?.id ?? null,
      tentouPromover: promovidos > 0,
      mappingDepois: obterUuidPorLocalId(HEAL_CLI_LOCAL) ?? obterUuidPorLocalId(localId) ?? null,
      origemDepois:
        obterOrigemMapeamentoId(HEAL_CLI_LOCAL) ?? obterOrigemMapeamentoId(localId) ?? null,
      caminhoVencedor: escolhido.caminho,
      candidatos: idsTecnicosLimitados(candidatos),
      idsReferencia: idsTecnicosLimitados(clientesReferencia.map((c) => c.id)),
      contemAliasLocal: candidatos.includes(HEAL_CLI_LOCAL) || clientesReferencia.some((c) => c.id === HEAL_CLI_LOCAL),
      contemUuidCru: candidatos.includes(HEAL_CUSTOMER_REAL) || clientesReferencia.some((c) => c.id === HEAL_CUSTOMER_REAL),
      motivoSkip: null,
    })
  }
  return clienteDeCustomerRow(row, officeLocalId, localId)
}

export async function mapearMotorcycleReverso(
  row: MotorcycleRow,
  officeLocalId: string,
  candidatosMoto: string[],
  mapaClienteUuidParaLocal: Map<string, string>,
  motosReferencia: Moto[] = []
): Promise<Moto> {
  const idsLocais = idsLocaisReais(
    candidatosMoto,
    motosReferencia.map((m) => m.id)
  )
  const matchPlaca = encontrarMotoLocalPorPlaca(row, motosReferencia)
  const deveLogar =
    idRegistryObservado(row.id) ||
    idRegistryObservado(matchPlaca?.id) ||
    row.id === HEAL_MOTO_REAL
  if (deveLogar) marcarHealVehicleExecutou()
  const mappingAntes = deveLogar
    ? obterUuidPorLocalId(matchPlaca?.id ?? HEAL_MOTO_LOCAL)
    : undefined
  const origemAntes = deveLogar
    ? obterOrigemMapeamentoId(matchPlaca?.id ?? HEAL_MOTO_LOCAL)
    : undefined
  const selfMapEncontrado = deveLogar ? obterLocalIdPorUuid(row.id) : undefined
  const entidadeLocalComSelfMap = Boolean(
    selfMapEncontrado && idsLocais.has(selfMapEncontrado)
  )
  const escolhido = await escolherLocalIdReverso({
    rowId: row.id,
    candidatos: candidatosMoto,
    idsLocaisReais: idsLocais,
    matchSemantico: matchPlaca?.id,
    prefixoFallback: 'moto',
  })
  const localId = escolhido.localId
  registrarMapeamentoIdConfirmado(localId, row.id, 'reverse_vehicle', 'remote_row')
  const promovidos = await promoverHashHistoricoParaRow(
    row.id,
    [matchPlaca?.id, ...listarMotosLocaisPorPlaca(row, motosReferencia).map((m) => m.id)],
    'reverse_vehicle'
  )
  if (deveLogar || idRegistryObservado(localId)) {
    logRegistryHeal({
      etapa: 'mapearMotorcycleReverso',
      remoteId: row.id,
      localIdEncontrado: localId,
      mappingAntes: mappingAntes ?? null,
      origemAntes: origemAntes ?? null,
      hashDeterministico: await localIdParaUuid(HEAL_MOTO_LOCAL),
      selfMapEncontrado: selfMapEncontrado ?? null,
      entidadeLocalComSelfMap,
      matchSemanticoEncontrado: Boolean(matchPlaca?.id),
      localIdSemantico: matchPlaca?.id ?? null,
      tentouPromover: promovidos > 0,
      mappingDepois: obterUuidPorLocalId(HEAL_MOTO_LOCAL) ?? obterUuidPorLocalId(localId) ?? null,
      origemDepois:
        obterOrigemMapeamentoId(HEAL_MOTO_LOCAL) ?? obterOrigemMapeamentoId(localId) ?? null,
      caminhoVencedor: escolhido.caminho,
      candidatos: idsTecnicosLimitados(candidatosMoto),
      idsReferencia: idsTecnicosLimitados(motosReferencia.map((m) => m.id)),
      contemAliasLocal:
        candidatosMoto.includes(HEAL_MOTO_LOCAL) || motosReferencia.some((m) => m.id === HEAL_MOTO_LOCAL),
      contemUuidCru:
        candidatosMoto.includes(HEAL_MOTO_REAL) || motosReferencia.some((m) => m.id === HEAL_MOTO_REAL),
      motivoSkip: null,
    })
  }
  const clienteLocalId =
    mapaClienteUuidParaLocal.get(row.customer_id) ??
    (await resolverLocalId(row.customer_id, [], 'cli'))

  const { observacoes, meta } = extrairCamposVeiculoDeNotes(row.notes)
  const motoBase = {
    id: localId,
    oficina_id: officeLocalId,
    office_id: officeLocalId,
    cliente_id: clienteLocalId,
    marca: row.brand,
    modelo: row.model,
    ano: row.year,
    placa: row.plate,
    cor: row.color,
    quilometragem: row.mileage,
    chassi: row.chassis ?? undefined,
    observacoes,
    deleted_at: row.deleted_at ?? undefined,
    criado_em: isoParaDataLocal(row.created_at),
    atualizado_em: isoParaDataLocal(row.updated_at),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
  return aplicarMetaVeiculoEmMoto(motoBase, meta, observacoes)
}

export async function mapearServiceOrderReverso(
  row: ServiceOrderRow,
  officeLocalId: string,
  candidatosOs: string[],
  mapaClienteUuidParaLocal: Map<string, string>,
  mapaMotoUuidParaLocal: Map<string, string>
): Promise<OrdemServico> {
  const partsPayload = extrairPartsUsed(row.parts_used)
  const meta = partsPayload.craft_meta

  const candidatosComMeta = meta?.local_id
    ? [meta.local_id, ...candidatosOs]
    : candidatosOs

  const localId = await resolverLocalId(row.id, candidatosComMeta, 'os')

  registrarMapeamentoIdConfirmado(localId, row.id, 'reverse_service_order')

  const clienteLocalId =
    mapaClienteUuidParaLocal.get(row.customer_id) ??
    (await resolverLocalId(row.customer_id, [], 'cli'))

  const motoLocalId =
    mapaMotoUuidParaLocal.get(row.motorcycle_id) ??
    (await resolverLocalId(row.motorcycle_id, [], 'moto'))

  return {
    id: localId,
    oficina_id: officeLocalId,
    office_id: officeLocalId,
    cliente_id: clienteLocalId,
    moto_id: motoLocalId,
    numero: row.number,
    defeito_relatado: row.reported_issue,
    diagnostico: row.diagnosis,
    servicos_executados: row.services_performed,
    pecas_utilizadas: partsPayload.pecas ?? [],
    valor_pecas: Number(row.parts_value),
    valor_mao_obra: Number(row.labor_value),
    valor_adicional: meta?.valor_adicional ?? 0,
    desconto: Number(row.discount),
    valor_total: Number(row.total_value),
    status: row.status,
    criado_em: isoParaDataLocal(row.created_at),
    atualizado_em: isoParaDataLocal(row.updated_at),
    created_at: row.created_at,
    updated_at: row.updated_at,
    checklist_entrada: row.entry_checklist ?? undefined,
    valor_estimado: meta?.valor_estimado_historico != null ? Number(meta.valor_estimado_historico) : undefined,
    data_orcamento: row.budget_date ?? undefined,
    status_orcamento: normalizarStatusOrcamentoCarregado(row.budget_status),
    observacoes_orcamento: meta?.observacoes_orcamento ?? undefined,
    modo_documento:
      meta?.modo_documento === 'orcamento' ? 'orcamento' : 'os',
    quilometragem_entrada: row.entry_mileage ?? undefined,
    quilometragem_saida: row.exit_mileage ?? undefined,
    dias_garantia: row.warranty_days ?? undefined,
    data_vencimento_garantia: row.warranty_expires_at ?? undefined,
    observacoes_garantia: meta?.observacoes_garantia ?? undefined,
    data_previsao: meta?.data_previsao ?? undefined,
    data_entrada: meta?.data_entrada ?? undefined,
    data_saida: meta?.data_saida ?? undefined,
    estoque_baixado: meta?.estoque_baixado ?? false,
    responsavel: meta?.responsavel ?? undefined,
    responsavel_id: meta?.responsavel_id ?? undefined,
    comissao_snapshot: meta?.comissao_snapshot ?? undefined,
    status_financeiro: meta?.status_financeiro ?? undefined,
    servicos_itens: meta?.servicos_itens ?? [],
    ajuste_mao_obra: meta?.ajuste_mao_obra ?? undefined,
    os_gerada_id: meta?.os_gerada_id ?? undefined,
    os_gerada_numero: meta?.os_gerada_numero ?? undefined,
    orcamento_origem_id: meta?.orcamento_origem_id ?? undefined,
    orcamento_origem_numero: meta?.orcamento_origem_numero ?? undefined,
    orcamento_convertido_em: meta?.orcamento_convertido_em ?? undefined,
    orcamento_convertido_por: meta?.orcamento_convertido_por ?? undefined,
    criado_por_id: meta?.criado_por_id ?? undefined,
    criado_por_nome: meta?.criado_por_nome ?? undefined,
    historico_eventos: meta?.historico_eventos ?? undefined,
    aprovacao_cliente: meta?.aprovacao_cliente ?? undefined,
    deleted_at: meta?.deleted_at ?? undefined,
  }
}

export type DadosFase1Remotos = Pick<
  CraftDatabase,
  'configuracao' | 'clientes' | 'motos' | 'ordens_servico' | 'proximo_numero_os'
> & {
  servicos_catalogo?: CraftDatabase['servicos_catalogo']
}

export type {
  OfficeRow,
  SettingsRow,
  CustomerRow,
  MotorcycleRow,
  ServiceOrderRow,
}
