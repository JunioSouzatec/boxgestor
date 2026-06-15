import { criarDatabaseMinimaOficina } from '@/services/database-migration.service'
import type { CraftDatabase } from '@/types/database'
import type { ConfiguracaoOficina } from '@/types/oficina'

export function obterOfficeIdDaConfiguracao(
  config: Pick<ConfiguracaoOficina, 'office_id' | 'oficina_id' | 'id'> | undefined | null
): string {
  if (!config) return ''
  return (config.office_id ?? config.oficina_id ?? config.id ?? '').trim()
}

export function configuracaoPertenceOffice(
  config: Pick<ConfiguracaoOficina, 'office_id' | 'oficina_id' | 'id'> | undefined | null,
  officeId: string
): boolean {
  if (!officeId.trim()) return false
  const configOfficeId = obterOfficeIdDaConfiguracao(config)
  return configOfficeId === officeId.trim()
}

/** Estado neutro enquanto a oficina correta carrega — sem dados de outra tenant. */
export function criarDatabasePlaceholderOficina(officeId: string): CraftDatabase {
  return criarDatabaseMinimaOficina(officeId, {
    id: officeId,
    oficina_id: officeId,
    office_id: officeId,
    nome: '',
    endereco: '',
    telefone: '',
    preferencias: {
      tema_escuro: true,
      notificacoes: true,
      alerta_estoque_baixo: true,
      cadastro_limpo: true,
    },
  })
}

export function databasePertenceOffice(dados: CraftDatabase, officeId: string): boolean {
  return configuracaoPertenceOffice(dados.configuracao, officeId)
}
