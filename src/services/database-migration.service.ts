import { normalizarComissoesConfig } from '@/types/comissoes'
import { normalizarTipoOficina } from '@/types/tipo-oficina'
import { dadosIniciais } from '@/data/seed'
import type { CraftDatabase } from '@/types/database'
import type { ConfiguracaoOficina, PreferenciasSistema } from '@/types/oficina'
import {
  garantirChecklistPadrao,
  migrarOrdensAntigasParaChecklistPadrao,
} from '@/services/checklist-modelo.service'
import { normalizeTenantTimestamps } from '@/services/migration.service'
import { normalizarOS } from '@/services/ordem-servico.service'
import { normalizarLancamentoPagamento } from '@/lib/pagamento-format'
import { normalizarPeca } from '@/services/estoque.service'
import { normalizarServicoCatalogo } from '@/services/servico-catalogo.service'
import { OFFICE_ID } from '@/types/base'

const PREFERENCIAS_PADRAO: PreferenciasSistema = {
  tema_escuro: true,
  notificacoes: true,
  alerta_estoque_baixo: true,
}

/** Banco mínimo sem dados demo — apenas estrutura vazia da oficina. */
export function criarDatabaseMinimaOficina(
  officeId: string,
  configuracao: ConfiguracaoOficina
): CraftDatabase {
  return migrateDatabase({
    clientes: [],
    motos: [],
    ordens_servico: [],
    pecas: [],
    fornecedores: [],
    movimentacoes_estoque: [],
    lancamentos: [],
    agendamentos: [],
    modelos_checklist: [],
    servicos_catalogo: [],
    perfis_comissao: [],
    proximo_numero_os: 1001,
    configuracao: {
      ...configuracao,
      id: officeId,
      oficina_id: officeId,
      office_id: officeId,
      preferencias: {
        ...configuracao.preferencias,
        cadastro_limpo: true,
      },
    },
  })
}

/** Garante estrutura mínima para dados antigos ou parcialmente corrompidos no localStorage */
export function garantirEstruturaDatabase(dados: Partial<CraftDatabase>): CraftDatabase {
  const seedConfig = dadosIniciais.configuracao
  const officeId =
    dados.configuracao?.office_id ??
    dados.configuracao?.oficina_id ??
    seedConfig.office_id ??
    OFFICE_ID

  const cadastroLimpo = dados.configuracao?.preferencias?.cadastro_limpo === true

  const configuracao: CraftDatabase['configuracao'] = cadastroLimpo
    ? {
        id: officeId,
        oficina_id: officeId,
        office_id: officeId,
        nome: dados.configuracao?.nome?.trim() ?? '',
        endereco: dados.configuracao?.endereco?.trim() ?? '',
        telefone: dados.configuracao?.telefone?.trim() ?? '',
        whatsapp: dados.configuracao?.whatsapp?.trim() || dados.configuracao?.telefone?.trim(),
        cidade: dados.configuracao?.cidade?.trim() || undefined,
        estado: dados.configuracao?.estado?.trim() || undefined,
        cnpj: dados.configuracao?.cnpj?.trim() || undefined,
        email: dados.configuracao?.email?.trim() || undefined,
        created_at: dados.configuracao?.created_at,
        updated_at: dados.configuracao?.updated_at ?? dados.configuracao?.created_at,
        preferencias: {
          ...PREFERENCIAS_PADRAO,
          ...dados.configuracao?.preferencias,
          cadastro_limpo: true,
        },
      }
    : {
        ...seedConfig,
        ...dados.configuracao,
        id: dados.configuracao?.id ?? officeId,
        oficina_id: dados.configuracao?.oficina_id ?? officeId,
        office_id: officeId,
        nome: dados.configuracao?.nome ?? seedConfig.nome,
        endereco: dados.configuracao?.endereco ?? seedConfig.endereco,
        telefone: dados.configuracao?.telefone ?? seedConfig.telefone,
        preferencias: {
          ...PREFERENCIAS_PADRAO,
          ...dados.configuracao?.preferencias,
        },
      }

  return {
    clientes: dados.clientes ?? [],
    motos: dados.motos ?? [],
    ordens_servico: dados.ordens_servico ?? [],
    pecas: dados.pecas ?? [],
    fornecedores: dados.fornecedores ?? [],
    movimentacoes_estoque: dados.movimentacoes_estoque ?? [],
    lancamentos: dados.lancamentos ?? [],
    agendamentos: dados.agendamentos ?? [],
    modelos_checklist: dados.modelos_checklist ?? [],
    servicos_catalogo: dados.servicos_catalogo ?? [],
    perfis_comissao: dados.perfis_comissao ?? [],
    proximo_numero_os: cadastroLimpo
      ? (dados.proximo_numero_os ?? 1001)
      : (dados.proximo_numero_os ?? dadosIniciais.proximo_numero_os ?? 1),
    configuracao,
  }
}

export function migrateDatabase(dados: Partial<CraftDatabase>): CraftDatabase {
  const base = garantirEstruturaDatabase(dados)
  const officeId = base.configuracao.office_id ?? base.configuracao.oficina_id
  const tipoOficina = normalizarTipoOficina(base.configuracao.tipo_oficina)
  const modelos_checklist = garantirChecklistPadrao(
    base.modelos_checklist,
    officeId,
    tipoOficina
  ).map((m) => normalizeTenantTimestamps(m))

  const ordensMigradas = migrarOrdensAntigasParaChecklistPadrao(
    base.ordens_servico,
    modelos_checklist,
    officeId,
    tipoOficina
  )

  return {
    ...base,
    configuracao: normalizeTenantTimestamps({
      ...base.configuracao,
      office_id: officeId,
      oficina_id: base.configuracao.oficina_id,
      id: base.configuracao.oficina_id,
      tipo_oficina: normalizarTipoOficina(base.configuracao.tipo_oficina),
      comissoes_config: normalizarComissoesConfig(base.configuracao.comissoes_config),
    }),
    perfis_comissao: (base.perfis_comissao ?? []).map((p) =>
      normalizeTenantTimestamps({ ...p, office_id: officeId, oficina_id: officeId })
    ),
    modelos_checklist,
    servicos_catalogo: base.servicos_catalogo.map((s) =>
      normalizeTenantTimestamps(
        normalizarServicoCatalogo(
          { ...s, office_id: officeId, oficina_id: officeId },
          base.pecas
        )
      )
    ),
    clientes: base.clientes.map((c) => normalizeTenantTimestamps(c)),
    motos: base.motos.map((m) => normalizeTenantTimestamps(m)),
    pecas: base.pecas.map((p) =>
      normalizeTenantTimestamps(normalizarPeca({ ...p, office_id: officeId, oficina_id: officeId }))
    ),
    fornecedores: base.fornecedores.map((f) =>
      normalizeTenantTimestamps({ ...f, office_id: officeId, oficina_id: officeId, ativo: f.ativo ?? true })
    ),
    movimentacoes_estoque: base.movimentacoes_estoque.map((m) =>
      normalizeTenantTimestamps({ ...m, office_id: officeId, oficina_id: officeId })
    ),
    lancamentos: base.lancamentos.map((l) =>
      normalizeTenantTimestamps(
        normalizarLancamentoPagamento({
          ...l,
          cancelado: l.cancelado ?? false,
        })
      )
    ),
    agendamentos: base.agendamentos.map((a) => normalizeTenantTimestamps(a)),
    ordens_servico: ordensMigradas.map((os) =>
      normalizeTenantTimestamps(normalizarOS(os, modelos_checklist, officeId, base.pecas))
    ),
  }
}
