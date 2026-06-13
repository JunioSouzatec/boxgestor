import type { CraftDatabase } from '@/types/database'
import type { OrdemServico } from '@/types/ordem-servico'
import type { UsuarioMovimentacao } from '@/types/movimentacao-estoque'
import { processarEstoqueAoSalvarOS } from '@/services/estoque.service'

export { verificarEstoqueInsuficiente } from '@/services/os-pecas.service'
export {
  statusExigeBaixaEstoque,
  deveBaixarEstoqueOS,
  deveDevolverEstoqueOS,
} from '@/services/estoque.service'

export function processarEstoqueAoSalvarOSLegacy(
  db: CraftDatabase,
  os: OrdemServico,
  osAnterior?: OrdemServico
): CraftDatabase {
  return processarEstoqueAoSalvarOS(db, os, osAnterior, {}, os.office_id ?? os.oficina_id)
}

export function processarEstoqueComUsuario(
  db: CraftDatabase,
  os: OrdemServico,
  osAnterior: OrdemServico | undefined,
  usuario: UsuarioMovimentacao,
  officeId: string
): CraftDatabase {
  return processarEstoqueAoSalvarOS(db, os, osAnterior, usuario, officeId)
}
