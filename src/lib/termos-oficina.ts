import {
  normalizarTipoOficina,
  type TipoOficina,
} from '@/types/tipo-oficina'

export interface TermosOficina {
  tipo: TipoOficina
  /** Moto | Veículo */
  veiculo: string
  /** Motos | Veículos */
  veiculos: string
  /** Nova moto | Novo veículo */
  novoVeiculo: string
  /** Dados da moto | Dados do veículo */
  dadosVeiculo: string
  /** Moto | Veículo — rótulo em PDF/recibo */
  labelDocumento: string
  /** moto | veículo — lembretes e textos corridos */
  palavraVeiculo: string
  /** da moto | do veículo */
  artigoVeiculo: string
  /** sua moto | seu veículo */
  possessivoVeiculo: string
  /** da sua moto | do seu veículo — lembretes */
  artigoPossessivoVeiculo: string
  /** Documento da moto | Documento do veículo — checklist */
  documentoVeiculo: string
}

const TERMOS_MOTOS: TermosOficina = {
  tipo: 'motos',
  veiculo: 'Moto',
  veiculos: 'Motos',
  novoVeiculo: 'Nova moto',
  dadosVeiculo: 'Dados da moto',
  labelDocumento: 'Moto',
  palavraVeiculo: 'moto',
  artigoVeiculo: 'da moto',
  possessivoVeiculo: 'sua moto',
  artigoPossessivoVeiculo: 'da sua moto',
  documentoVeiculo: 'Documento da moto',
}

const TERMOS_VEICULOS: TermosOficina = {
  tipo: 'carros',
  veiculo: 'Veículo',
  veiculos: 'Veículos',
  novoVeiculo: 'Novo veículo',
  dadosVeiculo: 'Dados do veículo',
  labelDocumento: 'Veículo',
  palavraVeiculo: 'veículo',
  artigoVeiculo: 'do veículo',
  possessivoVeiculo: 'seu veículo',
  artigoPossessivoVeiculo: 'do seu veículo',
  documentoVeiculo: 'Documento do veículo',
}

export function obterTermosOficina(tipo: unknown): TermosOficina {
  const normalizado = normalizarTipoOficina(tipo)
  if (normalizado === 'motos') return TERMOS_MOTOS
  return { ...TERMOS_VEICULOS, tipo: normalizado }
}

/** Rótulo plural (Motos | Veículos) conforme tipo da oficina. */
export function getRotuloVeiculoPorTipo(tipo: unknown, plural = true): string {
  const termos = obterTermosOficina(tipo)
  return plural ? termos.veiculos : termos.veiculo
}

/** Mensagem vazia da listagem de veículos no Admin e telas similares. */
export function msgNenhumVeiculoCadastrado(tipo: unknown): string {
  const termos = obterTermosOficina(tipo)
  if (termos.tipo === 'motos') return 'Nenhuma moto cadastrada.'
  return 'Nenhum veículo cadastrado.'
}

/** Contador "X cadastrados/as" conforme tipo. */
export function rotuloVeiculosCadastrados(tipo: unknown): string {
  const termos = obterTermosOficina(tipo)
  if (termos.tipo === 'motos') return 'Motos cadastradas'
  return 'Veículos cadastrados'
}

/** Substitui o termo genérico "moto" em templates de lembrete pelo termo da oficina. */
export function adaptarTextoLembrete(texto: string, termos: TermosOficina): string {
  if (termos.tipo === 'motos') return texto
  return texto
    .replace(/\bda moto\b/gi, termos.artigoVeiculo)
    .replace(/\bda sua moto\b/gi, `${termos.artigoVeiculo.replace(/^d/, 'd')} ${termos.possessivoVeiculo}`)
    .replace(/\bsua moto\b/gi, termos.possessivoVeiculo)
    .replace(/\bmoto\b/gi, termos.palavraVeiculo)
}

export function msgVeiculoSalvoComSucesso(termos: TermosOficina): string {
  return `${termos.veiculo} salvo com sucesso.`
}

export function msgCadastrePrimeiroVeiculo(termos: TermosOficina): string {
  return `Cadastre primeiro ${termos.palavraVeiculo}`
}
