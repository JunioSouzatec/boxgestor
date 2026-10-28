import type { Agendamento } from '@/types/agendamento'
import type { Cliente } from '@/types/cliente'
import type { Moto } from '@/types/moto'

export function rotuloClienteAgenda(
  ag: Pick<Agendamento, 'cliente_id' | 'guest_name'>,
  clientes: Array<Pick<Cliente, 'id' | 'nome'>>
): string {
  const id = ag.cliente_id?.trim()
  if (id) return clientes.find((c) => c.id === id)?.nome ?? '—'
  return ag.guest_name?.trim() || '—'
}

export function rotuloVeiculoAgenda(
  ag: Pick<Agendamento, 'moto_id' | 'guest_vehicle'>,
  motos: Array<Pick<Moto, 'id' | 'marca' | 'modelo' | 'placa'>>
): string {
  const id = ag.moto_id?.trim()
  if (id) {
    const m = motos.find((mo) => mo.id === id)
    return m ? `${m.marca} ${m.modelo} (${m.placa})` : '—'
  }
  return ag.guest_vehicle?.trim() || '—'
}
