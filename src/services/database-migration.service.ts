import type { CraftDatabase } from '@/types/database'
import {
  garantirChecklistPadrao,
  migrarOrdensAntigasParaChecklistPadrao,
} from '@/services/checklist-modelo.service'
import { normalizeTenantTimestamps } from '@/services/migration.service'
import { normalizarOS } from '@/services/ordem-servico.service'
import { normalizarLancamentoPagamento } from '@/lib/pagamento-format'

export function migrateDatabase(dados: CraftDatabase): CraftDatabase {
  const officeId = dados.configuracao.office_id ?? dados.configuracao.oficina_id
  const modelos_checklist = garantirChecklistPadrao(dados.modelos_checklist, officeId).map((m) =>
    normalizeTenantTimestamps(m)
  )

  const ordensMigradas = migrarOrdensAntigasParaChecklistPadrao(
    dados.ordens_servico,
    modelos_checklist,
    officeId
  )

  return {
    ...dados,
    configuracao: normalizeTenantTimestamps({
      ...dados.configuracao,
      office_id: officeId,
      oficina_id: dados.configuracao.oficina_id,
      id: dados.configuracao.oficina_id,
    }),
    modelos_checklist,
    clientes: dados.clientes.map((c) => normalizeTenantTimestamps(c)),
    motos: dados.motos.map((m) => normalizeTenantTimestamps(m)),
    pecas: dados.pecas.map((p) => normalizeTenantTimestamps(p)),
    lancamentos: dados.lancamentos.map((l) =>
      normalizeTenantTimestamps(
        normalizarLancamentoPagamento({
          ...l,
          cancelado: l.cancelado ?? false,
        })
      )
    ),
    agendamentos: dados.agendamentos.map((a) => normalizeTenantTimestamps(a)),
    ordens_servico: ordensMigradas.map((os) =>
      normalizeTenantTimestamps(normalizarOS(os, modelos_checklist, officeId))
    ),
  }
}
