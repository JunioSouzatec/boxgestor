import type { CraftDatabase } from '@/types/database'
import type { OrdemServico } from '@/types/ordem-servico'
import type { StatusOS } from '@/types/enums'
import { verificarEstoqueInsuficiente } from '@/services/os-pecas.service'

const STATUS_BAIXA: StatusOS[] = ['finalizada', 'entregue']

export function statusExigeBaixaEstoque(status: StatusOS): boolean {
  return STATUS_BAIXA.includes(status)
}

export function deveBaixarEstoqueOS(os: OrdemServico, osAnterior?: OrdemServico): boolean {
  if (os.estoque_baixado) return false
  if (!statusExigeBaixaEstoque(os.status)) return false
  if (osAnterior?.estoque_baixado) return false
  return true
}

export function aplicarBaixaEstoqueOS(db: CraftDatabase, os: OrdemServico): CraftDatabase {
  let pecas = db.pecas

  for (const pu of os.pecas_utilizadas ?? []) {
    if (!pu.peca_id || pu.manual) continue
    pecas = pecas.map((p) =>
      p.id === pu.peca_id
        ? { ...p, quantidade: Math.max(0, p.quantidade - pu.quantidade) }
        : p
    )
  }

  const ordens_servico = db.ordens_servico.map((o) =>
    o.id === os.id ? { ...o, estoque_baixado: true } : o
  )

  return { ...db, pecas, ordens_servico }
}

export function processarEstoqueAoSalvarOS(
  db: CraftDatabase,
  os: OrdemServico,
  osAnterior?: OrdemServico
): CraftDatabase {
  if (!deveBaixarEstoqueOS(os, osAnterior)) return db
  return aplicarBaixaEstoqueOS(db, os)
}

export { verificarEstoqueInsuficiente }
