import type { CraftDatabase } from '@/types/database'
import { normalizeTenantTimestamps } from '@/services/migration.service'
import { normalizarOS } from '@/services/ordem-servico.service'

export function migrateDatabase(dados: CraftDatabase): CraftDatabase {
  return {
    ...dados,
    configuracao: normalizeTenantTimestamps({
      ...dados.configuracao,
      office_id: dados.configuracao.office_id ?? dados.configuracao.oficina_id,
      oficina_id: dados.configuracao.oficina_id,
      id: dados.configuracao.oficina_id,
    }),
    clientes: dados.clientes.map((c) => normalizeTenantTimestamps(c)),
    motos: dados.motos.map((m) => normalizeTenantTimestamps(m)),
    pecas: dados.pecas.map((p) => normalizeTenantTimestamps(p)),
    lancamentos: dados.lancamentos.map((l) => normalizeTenantTimestamps(l)),
    agendamentos: dados.agendamentos.map((a) => normalizeTenantTimestamps(a)),
    ordens_servico: dados.ordens_servico.map((os) =>
      normalizeTenantTimestamps(normalizarOS(os))
    ),
  }
}
