import type { MotoInput } from '@/types/moto'

/** Campos de moto no cadastro conjunto com cliente (sem cliente_id) */
export type FormMotoCliente = Omit<MotoInput, 'cliente_id'>

export const formMotoClienteVazio = (): FormMotoCliente => ({
  marca: '',
  modelo: '',
  ano: new Date().getFullYear(),
  placa: '',
  cor: '',
  quilometragem: 0,
  chassi: '',
  observacoes: '',
})

export function motoClienteTemAlgumCampo(form: FormMotoCliente): boolean {
  return Boolean(
    form.marca.trim() ||
      form.modelo.trim() ||
      form.placa.trim() ||
      form.cor.trim() ||
      form.chassi?.trim() ||
      form.observacoes?.trim() ||
      (form.quilometragem ?? 0) > 0
  )
}

export function validarFormMotoCliente(
  form: FormMotoCliente,
  termos?: { artigoVeiculo: string }
): string | null {
  if (!motoClienteTemAlgumCampo(form)) return null
  const art = termos?.artigoVeiculo ?? 'da moto'
  if (!form.marca.trim()) return `Informe a marca ${art}.`
  if (!form.modelo.trim()) return `Informe o modelo ${art}.`
  if (!form.placa.trim()) return `Informe a placa ${art}.`
  return null
}

export function formMotoClienteParaInput(
  form: FormMotoCliente,
  clienteId: string
): MotoInput {
  return {
    cliente_id: clienteId,
    marca: form.marca.trim(),
    modelo: form.modelo.trim(),
    ano: form.ano,
    placa: form.placa.trim().toUpperCase(),
    cor: form.cor.trim(),
    quilometragem: form.quilometragem ?? 0,
    chassi: form.chassi?.trim() || undefined,
    observacoes: form.observacoes?.trim() || undefined,
  }
}

export function labelQuantidadeVeiculos(
  quantidade: number,
  palavraSingular: string,
  palavraPlural: string
): string {
  const plural = palavraPlural.toLowerCase()
  const singular = palavraSingular.toLowerCase()
  if (quantidade === 0) return `Sem ${plural}`
  if (quantidade === 1) return `1 ${singular}`
  return `${quantidade} ${plural}`
}

/** @deprecated use labelQuantidadeVeiculos com termos da oficina */
export function labelQuantidadeMotos(quantidade: number): string {
  return labelQuantidadeVeiculos(quantidade, 'moto', 'Motos')
}
