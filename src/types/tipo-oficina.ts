export type TipoOficina = 'motos' | 'carros' | 'mista'

export const TIPOS_OFICINA: TipoOficina[] = ['motos', 'carros', 'mista']

export const TIPO_OFICINA_PADRAO: TipoOficina = 'motos'

export const LABEL_TIPO_OFICINA: Record<TipoOficina, string> = {
  motos: 'Motos',
  carros: 'Carros',
  mista: 'Mista',
}

/** Labels para cadastro / onboarding. */
export const LABEL_TIPO_OFICINA_CADASTRO: Record<TipoOficina, string> = {
  motos: 'Oficina de motos',
  carros: 'Oficina de carros',
  mista: 'Oficina geral / mista',
}

export const DESCRICAO_TIPO_OFICINA_CADASTRO: Record<TipoOficina, string> = {
  motos: 'Textos e ícones usam “moto”.',
  carros: 'Textos e ícones usam “carro” / “veículo”.',
  mista: 'Textos e ícones usam “veículo” (atende carros e motos).',
}

/** Oficinas antigas sem tipo definido continuam como motos. */
export function normalizarTipoOficina(valor: unknown): TipoOficina {
  if (valor === 'carros' || valor === 'mista' || valor === 'motos') return valor
  return TIPO_OFICINA_PADRAO
}

export function labelTipoOficina(valor: unknown): string {
  return LABEL_TIPO_OFICINA[normalizarTipoOficina(valor)]
}
