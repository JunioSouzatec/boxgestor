/**
 * Serviço preparado para consulta básica por placa (A2+).
 * A1: stub — não chama Edge Function, fetch externo nem secret.
 */

export interface DadosBasicosVeiculoConsulta {
  placa: string
  marca?: string
  modelo?: string
  versao?: string
  ano?: number
  cor?: string
  combustivel?: string
  chassi?: string
  motor?: string
  tipo_veiculo?: string
  fonte?: string
}

/** Campos do formulário que a consulta poderá preencher no futuro (A3). */
export type CamposVeiculoParaConsulta = Partial<{
  marca: string
  modelo: string
  ano: number
  cor: string
  combustivel: string
  chassi: string
  motor: string
  tipo_veiculo: string
}>

export const MSG_CONSULTA_PLACA_INATIVA = 'Consulta por placa ainda não está ativa.'

export const MSG_CONSULTA_PLACA_PREPARACAO =
  'Consulta por placa em preparação. Em breve será possível preencher automaticamente os dados básicos do veículo.'

/**
 * Stub A1 — sempre rejeita de forma controlada.
 * Em A2 passará a chamar a Edge Function autenticada `vehicle-plate-lookup`.
 */
export async function consultarPlacaVeiculo(
  _placa: string
): Promise<DadosBasicosVeiculoConsulta> {
  throw new Error(MSG_CONSULTA_PLACA_INATIVA)
}
