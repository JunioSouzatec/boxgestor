import { dadosIniciais } from '@/data/seed'
import type { CraftDatabase } from '@/types/database'
import type { PreferenciasSistema } from '@/types/oficina'
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

/** Garante estrutura mínima para dados antigos ou parcialmente corrompidos no localStorage */
export function garantirEstruturaDatabase(dados: Partial<CraftDatabase>): CraftDatabase {
  const seedConfig = dadosIniciais.configuracao
  const officeId =
    dados.configuracao?.office_id ??
    dados.configuracao?.oficina_id ??
    seedConfig.office_id ??
    OFFICE_ID

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
    proximo_numero_os: dados.proximo_numero_os ?? dadosIniciais.proximo_numero_os ?? 1,
    configuracao: {
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
    },
  }
}

export function migrateDatabase(dados: Partial<CraftDatabase>): CraftDatabase {
  const base = garantirEstruturaDatabase(dados)
  const officeId = base.configuracao.office_id ?? base.configuracao.oficina_id
  const modelos_checklist = garantirChecklistPadrao(base.modelos_checklist, officeId).map((m) =>
    normalizeTenantTimestamps(m)
  )

  const ordensMigradas = migrarOrdensAntigasParaChecklistPadrao(
    base.ordens_servico,
    modelos_checklist,
    officeId
  )

  return {
    ...base,
    configuracao: normalizeTenantTimestamps({
      ...base.configuracao,
      office_id: officeId,
      oficina_id: base.configuracao.oficina_id,
      id: base.configuracao.oficina_id,
    }),
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
