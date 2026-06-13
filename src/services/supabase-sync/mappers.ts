import { dataLocalParaIso, localIdParaUuid } from '@/lib/local-id-uuid'
import {
  sanitizarDataSupabase,
  sanitizarNumeroSupabase,
  sanitizarStatusOrcamentoSupabase,
  sanitizarTextoObrigatorioSupabase,
  sanitizarTextoOpcionalSupabase,
} from '@/lib/supabase-sanitize'
import { calcularTotalGeralDeCampos } from '@/services/os-financeiro.service'
import type { Cliente } from '@/types/cliente'
import type { CraftDatabase } from '@/types/database'
import type { Moto } from '@/types/moto'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { OrdemServico } from '@/types/ordem-servico'

export class SyncIdMap {
  private cache = new Map<string, string>()

  async uuid(localId: string): Promise<string> {
    const cached = this.cache.get(localId)
    if (cached) return cached
    const id = await localIdParaUuid(localId)
    this.cache.set(localId, id)
    return id
  }
}

export async function mapearOffice(
  config: ConfiguracaoOficina,
  ids: SyncIdMap
): Promise<Record<string, unknown>> {
  const officeLocalId = config.office_id ?? config.oficina_id ?? config.id
  const id = await ids.uuid(officeLocalId)

  const enderecoPartes = [
    config.endereco,
    config.bairro,
    config.cidade,
    config.estado,
    config.cep,
  ].filter(Boolean)

  return {
    id,
    name: sanitizarTextoObrigatorioSupabase(config.nome, 'Oficina'),
    address: enderecoPartes.join(' — ') || config.endereco || '',
    phone: sanitizarTextoObrigatorioSupabase(config.telefone),
    cnpj: sanitizarTextoOpcionalSupabase(config.cnpj),
    email: sanitizarTextoOpcionalSupabase(config.email),
    created_at: dataLocalParaIso(config.created_at),
    updated_at: dataLocalParaIso(config.updated_at ?? config.created_at),
  }
}

export async function mapearSettings(
  config: ConfiguracaoOficina,
  proximoNumeroOs: number,
  ids: SyncIdMap
): Promise<Record<string, unknown>> {
  const officeLocalId = config.office_id ?? config.oficina_id ?? config.id
  const office_id = await ids.uuid(officeLocalId)
  const agora = new Date().toISOString()

  return {
    id: await ids.uuid(`settings:${officeLocalId}`),
    office_id,
    dark_theme: config.preferencias?.tema_escuro ?? true,
    notifications: config.preferencias?.notificacoes ?? true,
    low_stock_alert: config.preferencias?.alerta_estoque_baixo ?? true,
    next_service_order_num: Math.max(1, Math.floor(proximoNumeroOs)),
    metadata: {
      local_office_id: officeLocalId,
      nome_fantasia: config.nome_fantasia ?? null,
      whatsapp: config.whatsapp ?? null,
      endereco_detalhado: {
        logradouro: config.endereco,
        bairro: config.bairro ?? null,
        cidade: config.cidade ?? null,
        estado: config.estado ?? null,
        cep: config.cep ?? null,
      },
      possui_logo: Boolean(config.logo_url),
      aparencia: config.aparencia ?? null,
    },
    created_at: agora,
    updated_at: agora,
  }
}

export async function mapearCustomer(
  cliente: Cliente,
  officeUuid: string,
  ids: SyncIdMap
): Promise<Record<string, unknown>> {
  return {
    id: await ids.uuid(cliente.id),
    office_id: officeUuid,
    name: sanitizarTextoObrigatorioSupabase(cliente.nome, 'Cliente'),
    phone: sanitizarTextoObrigatorioSupabase(cliente.telefone),
    cpf: sanitizarTextoOpcionalSupabase(cliente.cpf),
    address: sanitizarTextoObrigatorioSupabase(cliente.endereco),
    notes: sanitizarTextoOpcionalSupabase(cliente.observacoes),
    created_at: dataLocalParaIso(cliente.criado_em ?? cliente.created_at),
    updated_at: dataLocalParaIso(cliente.atualizado_em ?? cliente.updated_at ?? cliente.criado_em),
  }
}

export async function mapearMotorcycle(
  moto: Moto,
  officeUuid: string,
  ids: SyncIdMap
): Promise<Record<string, unknown>> {
  return {
    id: await ids.uuid(moto.id),
    office_id: officeUuid,
    customer_id: await ids.uuid(moto.cliente_id),
    brand: sanitizarTextoObrigatorioSupabase(moto.marca, '—'),
    model: sanitizarTextoObrigatorioSupabase(moto.modelo, '—'),
    year: Math.min(2100, Math.max(1900, Math.floor(sanitizarNumeroSupabase(moto.ano, new Date().getFullYear())))),
    plate: sanitizarTextoObrigatorioSupabase(moto.placa, 'S/PLACA'),
    color: sanitizarTextoObrigatorioSupabase(moto.cor),
    mileage: Math.max(0, Math.floor(sanitizarNumeroSupabase(moto.quilometragem, 0))),
    chassis: sanitizarTextoOpcionalSupabase(moto.chassi),
    notes: sanitizarTextoOpcionalSupabase(moto.observacoes),
    created_at: dataLocalParaIso(moto.criado_em ?? moto.created_at),
    updated_at: dataLocalParaIso(moto.atualizado_em ?? moto.updated_at ?? moto.criado_em),
  }
}

export async function mapearServiceOrder(
  os: OrdemServico,
  officeUuid: string,
  ids: SyncIdMap
): Promise<Record<string, unknown>> {
  const total = calcularTotalGeralDeCampos(os)

  return {
    id: await ids.uuid(os.id),
    office_id: officeUuid,
    customer_id: await ids.uuid(os.cliente_id),
    motorcycle_id: await ids.uuid(os.moto_id),
    number: Math.floor(sanitizarNumeroSupabase(os.numero, 0)),
    reported_issue: sanitizarTextoObrigatorioSupabase(os.defeito_relatado),
    diagnosis: sanitizarTextoObrigatorioSupabase(os.diagnostico),
    services_performed: sanitizarTextoObrigatorioSupabase(os.servicos_executados),
    parts_used: {
      pecas: os.pecas_utilizadas ?? [],
      craft_meta: {
        local_id: os.id,
        valor_adicional: sanitizarNumeroSupabase(os.valor_adicional, 0),
        servicos_itens: os.servicos_itens ?? [],
        status_financeiro: os.status_financeiro ?? null,
        data_previsao: os.data_previsao ?? null,
        responsavel: os.responsavel ?? null,
        observacoes_garantia: os.observacoes_garantia ?? null,
        observacoes_orcamento: os.observacoes_orcamento ?? null,
        valor_estimado_historico: os.valor_estimado ?? null,
      },
    },
    parts_value: sanitizarNumeroSupabase(os.valor_pecas, 0),
    labor_value: sanitizarNumeroSupabase(os.valor_mao_obra, 0),
    discount: sanitizarNumeroSupabase(os.desconto, 0),
    total_value: sanitizarNumeroSupabase(total, 0),
    status: os.status,
    entry_checklist: os.checklist_entrada ?? null,
    estimated_value: null,
    budget_date: sanitizarDataSupabase(os.data_orcamento),
    budget_status: sanitizarStatusOrcamentoSupabase(os.status_orcamento),
    entry_mileage:
      os.quilometragem_entrada != null
        ? Math.max(0, Math.floor(sanitizarNumeroSupabase(os.quilometragem_entrada, 0)))
        : null,
    exit_mileage:
      os.quilometragem_saida != null
        ? Math.max(0, Math.floor(sanitizarNumeroSupabase(os.quilometragem_saida, 0)))
        : null,
    warranty_days:
      os.dias_garantia != null
        ? Math.max(0, Math.floor(sanitizarNumeroSupabase(os.dias_garantia, 0)))
        : null,
    warranty_expires_at: sanitizarDataSupabase(os.data_vencimento_garantia),
    created_at: dataLocalParaIso(os.criado_em ?? os.created_at),
    updated_at: dataLocalParaIso(os.atualizado_em ?? os.updated_at ?? os.criado_em),
  }
}

export type DadosSyncFase1 = Pick<
  CraftDatabase,
  'configuracao' | 'clientes' | 'motos' | 'ordens_servico' | 'proximo_numero_os'
>
