import { localIdParaUuid } from '@/lib/local-id-uuid'
import {
  normalizarCpfCliente,
  normalizarNomeCliente,
  normalizarTelefoneCliente,
} from '@/services/clientes/deduplicate-clientes.service'
import {
  obterLocalIdPorUuid,
  registrarMapeamentoId,
} from '@/services/supabase-sync/id-registry'
import type { Cliente } from '@/types/cliente'
import type { CraftDatabase } from '@/types/database'
import type { Moto } from '@/types/moto'
import type { ConfiguracaoOficina, PreferenciasSistema, AparienciaOficina } from '@/types/oficina'
import type { OrdemServico, PecaUtilizada, AjusteMaoObraOS } from '@/types/ordem-servico'
import type { StatusFinanceiroOS, StatusOrcamento, StatusOS } from '@/types/enums'
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
  office_id: string
  dark_theme: boolean
  notifications: boolean
  low_stock_alert: boolean
  next_service_order_num: number
  metadata: Record<string, unknown> | null
}

interface CustomerRow {
  id: string
  name: string
  phone: string
  cpf: string | null
  address: string
  notes: string | null
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
    responsavel?: string | null
    observacoes_garantia?: string | null
    observacoes_orcamento?: string | null
    valor_estimado_historico?: number | null
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
  budget_status: StatusOrcamento | null
  entry_mileage: number | null
  exit_mileage: number | null
  warranty_days: number | null
  warranty_expires_at: string | null
  created_at: string
  updated_at: string
}

function isoParaDataLocal(iso?: string): string {
  if (!iso) return new Date().toISOString().slice(0, 10)
  return iso.slice(0, 10)
}

async function resolverLocalId(
  uuid: string,
  candidatos: string[],
  prefixoFallback: string
): Promise<string> {
  const registrado = obterLocalIdPorUuid(uuid)
  if (registrado) return registrado

  for (const localId of candidatos) {
    if (await localIdParaUuid(localId) === uuid) {
      registrarMapeamentoId(localId, uuid)
      return localId
    }
  }

  const fallback = `${prefixoFallback}-${uuid.slice(0, 8)}`
  registrarMapeamentoId(fallback, uuid)
  return fallback
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
  registrarMapeamentoId(officeLocalId, row.id)

  const metadata = (settings?.metadata ?? {}) as Record<string, unknown>
  const enderecoDetalhado = (metadata.endereco_detalhado ?? {}) as Record<string, string | null>

  const preferencias: PreferenciasSistema = {
    tema_escuro: settings?.dark_theme ?? true,
    notificacoes: settings?.notifications ?? true,
    alerta_estoque_baixo: settings?.low_stock_alert ?? true,
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
    cnpj: row.cnpj ?? undefined,
    email: row.email ?? undefined,
    aparencia: (metadata.aparencia as AparienciaOficina | undefined) ?? undefined,
    preferencias,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
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

export async function mapearCustomerReverso(
  row: CustomerRow,
  officeLocalId: string,
  candidatos: string[],
  clientesReferencia: Cliente[] = []
): Promise<Cliente> {
  const registrado = obterLocalIdPorUuid(row.id)
  if (registrado) {
    return {
      id: registrado,
      oficina_id: officeLocalId,
      office_id: officeLocalId,
      nome: row.name,
      telefone: row.phone,
      cpf: row.cpf ?? undefined,
      endereco: row.address,
      observacoes: row.notes ?? undefined,
      criado_em: isoParaDataLocal(row.created_at),
      atualizado_em: isoParaDataLocal(row.updated_at),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }

  for (const localId of candidatos) {
    if ((await localIdParaUuid(localId)) === row.id) {
      registrarMapeamentoId(localId, row.id)
      return {
        id: localId,
        oficina_id: officeLocalId,
        office_id: officeLocalId,
        nome: row.name,
        telefone: row.phone,
        cpf: row.cpf ?? undefined,
        endereco: row.address,
        observacoes: row.notes ?? undefined,
        criado_em: isoParaDataLocal(row.created_at),
        atualizado_em: isoParaDataLocal(row.updated_at),
        created_at: row.created_at,
        updated_at: row.updated_at,
      }
    }
  }

  const matchLocal = encontrarClienteLocalPorChaves(row, clientesReferencia)
  const localId = matchLocal
    ? matchLocal.id
    : await resolverLocalId(row.id, candidatos, 'cli')

  if (matchLocal) {
    registrarMapeamentoId(localId, row.id)
  }

  return {
    id: localId,
    oficina_id: officeLocalId,
    office_id: officeLocalId,
    nome: row.name,
    telefone: row.phone,
    cpf: row.cpf ?? undefined,
    endereco: row.address,
    observacoes: row.notes ?? undefined,
    criado_em: isoParaDataLocal(row.created_at),
    atualizado_em: isoParaDataLocal(row.updated_at),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function mapearMotorcycleReverso(
  row: MotorcycleRow,
  officeLocalId: string,
  candidatosMoto: string[],
  mapaClienteUuidParaLocal: Map<string, string>
): Promise<Moto> {
  const localId = await resolverLocalId(row.id, candidatosMoto, 'moto')
  const clienteLocalId =
    mapaClienteUuidParaLocal.get(row.customer_id) ??
    (await resolverLocalId(row.customer_id, [], 'cli'))

  return {
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
    observacoes: row.notes ?? undefined,
    criado_em: isoParaDataLocal(row.created_at),
    atualizado_em: isoParaDataLocal(row.updated_at),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
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
    status_orcamento: row.budget_status ?? undefined,
    observacoes_orcamento: meta?.observacoes_orcamento ?? undefined,
    quilometragem_entrada: row.entry_mileage ?? undefined,
    quilometragem_saida: row.exit_mileage ?? undefined,
    dias_garantia: row.warranty_days ?? undefined,
    data_vencimento_garantia: row.warranty_expires_at ?? undefined,
    observacoes_garantia: meta?.observacoes_garantia ?? undefined,
    data_previsao: meta?.data_previsao ?? undefined,
    responsavel: meta?.responsavel ?? undefined,
    status_financeiro: meta?.status_financeiro ?? undefined,
    servicos_itens: meta?.servicos_itens ?? [],
    ajuste_mao_obra: meta?.ajuste_mao_obra ?? undefined,
  }
}

export type DadosFase1Remotos = Pick<
  CraftDatabase,
  'configuracao' | 'clientes' | 'motos' | 'ordens_servico' | 'proximo_numero_os'
>

export type {
  OfficeRow,
  SettingsRow,
  CustomerRow,
  MotorcycleRow,
  ServiceOrderRow,
}
