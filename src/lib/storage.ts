/** @deprecated Importe de @/services/repository/local.repository */
export {
  localCraftRepository as storage,
  LocalCraftRepository as CraftStorage,
  localCraftRepository,
} from '@/services/repository/local.repository'
export type { ICraftRepository as CraftRepository } from '@/services/repository/types'

import { localCraftRepository } from '@/services/repository/local.repository'
import type { CraftDatabase } from '@/types/database'
import { OFFICE_ID } from '@/types/base'

/** Compatibilidade com LocalCraftRepository assíncrono legado */
export class LocalCraftRepository {
  async carregar(): Promise<CraftDatabase> {
    return localCraftRepository.carregar(OFFICE_ID)
  }

  async salvar(dados: CraftDatabase): Promise<void> {
    localCraftRepository.salvar(OFFICE_ID, dados)
  }
}
