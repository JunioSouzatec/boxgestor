import type { TenantEntity } from '@/types/base'
import type { StatusAgendamento } from '@/types/enums'

export interface Agendamento extends TenantEntity {
  data: string
  horario: string
  /** Modo cadastrado: id local ou UUID técnico. Modo rápido: vazio/ausente. */
  cliente_id?: string | null
  /** Modo cadastrado: id local ou UUID técnico. Modo rápido: vazio/ausente. */
  moto_id?: string | null
  /** Modo rápido: nome livre. Modo cadastrado: ausente/null. */
  guest_name?: string | null
  /** Modo rápido: descrição livre do veículo. Modo cadastrado: ausente/null. */
  guest_vehicle?: string | null
  servico: string
  status: StatusAgendamento
  observacoes?: string
  ordem_servico_id?: string
  created_at?: string
  updated_at?: string
  /** Tombstone de exclusão lógica — UI não lista quando preenchido */
  deleted_at?: string | null
}

export type AgendamentoInput = Omit<
  Agendamento,
  'id' | 'oficina_id' | 'office_id' | 'created_at' | 'updated_at' | 'deleted_at'
>

export type ModoAgendamentoIdentidade = 'cadastrado' | 'rapido'

type IdentidadeAgendamento = Pick<
  Agendamento,
  'cliente_id' | 'moto_id' | 'guest_name' | 'guest_vehicle'
>

function textoNaoVazio(valor: string | null | undefined): string | null {
  const t = valor?.trim() ?? ''
  return t ? t : null
}

export function guestNameValido(ag: IdentidadeAgendamento): string | null {
  return textoNaoVazio(ag.guest_name)
}

export function guestVehicleValido(ag: IdentidadeAgendamento): string | null {
  return textoNaoVazio(ag.guest_vehicle)
}

export function clienteIdValido(ag: IdentidadeAgendamento): string | null {
  return textoNaoVazio(ag.cliente_id)
}

export function motoIdValido(ag: IdentidadeAgendamento): string | null {
  return textoNaoVazio(ag.moto_id)
}

/** True se tem guest_name + guest_vehicle válidos e sem FKs. */
export function ehAgendamentoRapido(ag: IdentidadeAgendamento): boolean {
  return (
    Boolean(guestNameValido(ag)) &&
    Boolean(guestVehicleValido(ag)) &&
    !clienteIdValido(ag) &&
    !motoIdValido(ag)
  )
}

/** True se tem cliente_id + moto_id e sem guest. */
export function ehAgendamentoCadastrado(ag: IdentidadeAgendamento): boolean {
  return (
    Boolean(clienteIdValido(ag)) &&
    Boolean(motoIdValido(ag)) &&
    !guestNameValido(ag) &&
    !guestVehicleValido(ag)
  )
}

export function modoAgendamentoIdentidade(
  ag: IdentidadeAgendamento
): ModoAgendamentoIdentidade | null {
  if (ehAgendamentoCadastrado(ag)) return 'cadastrado'
  if (ehAgendamentoRapido(ag)) return 'rapido'
  return null
}

/**
 * Valida identidade XOR (espelha CHECK do banco).
 * Retorna mensagem de erro ou null se ok.
 */
export function validarIdentidadeAgendamento(ag: IdentidadeAgendamento): string | null {
  const modo = modoAgendamentoIdentidade(ag)
  if (modo) return null

  const temCliente = Boolean(clienteIdValido(ag))
  const temMoto = Boolean(motoIdValido(ag))
  const temGuestNome = Boolean(guestNameValido(ag))
  const temGuestVeiculo = Boolean(guestVehicleValido(ag))

  if ((temCliente || temMoto) && (temGuestNome || temGuestVeiculo)) {
    return 'Agendamento não pode misturar cliente cadastrado com dados rápidos.'
  }
  if (temCliente !== temMoto) {
    return 'Informe cliente e veículo cadastrados, ou use agendamento rápido.'
  }
  if (temGuestNome !== temGuestVeiculo) {
    return 'No agendamento rápido, informe nome e veículo.'
  }
  return 'Informe cliente e veículo cadastrados, ou nome e veículo no modo rápido.'
}

/** Normaliza campos opostos ao gravar (evita híbrido). */
export function normalizarIdentidadeAgendamento<T extends IdentidadeAgendamento>(
  ag: T,
  modo: ModoAgendamentoIdentidade
): T {
  if (modo === 'cadastrado') {
    return {
      ...ag,
      guest_name: null,
      guest_vehicle: null,
      cliente_id: clienteIdValido(ag) ?? ag.cliente_id ?? null,
      moto_id: motoIdValido(ag) ?? ag.moto_id ?? null,
    }
  }
  return {
    ...ag,
    cliente_id: null,
    moto_id: null,
    guest_name: guestNameValido(ag),
    guest_vehicle: guestVehicleValido(ag),
  }
}
