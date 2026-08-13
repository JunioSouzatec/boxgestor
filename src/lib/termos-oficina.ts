import type { LucideIcon } from 'lucide-react'
import { Bike, Car } from 'lucide-react'
import {
  normalizarTipoOficina,
  type TipoOficina,
} from '@/types/tipo-oficina'

export interface TermosOficina {
  tipo: TipoOficina
  /** Moto | Carro | Veículo */
  veiculo: string
  /** Motos | Carros | Veículos */
  veiculos: string
  /** Nova moto | Novo carro | Novo veículo */
  novoVeiculo: string
  /** Dados da moto | Dados do carro | Dados do veículo */
  dadosVeiculo: string
  /** Moto | Carro | Veículo — rótulo em PDF/recibo */
  labelDocumento: string
  /** moto | carro | veículo — textos corridos */
  palavraVeiculo: string
  /** da moto | do carro | do veículo */
  artigoVeiculo: string
  /** sua moto | seu carro | seu veículo */
  possessivoVeiculo: string
  /** da sua moto | do seu carro | do seu veículo */
  artigoPossessivoVeiculo: string
  /** Documento da moto | Documento do carro | Documento do veículo */
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

/** Oficina de carros — termo específico "carro". */
const TERMOS_CARROS: TermosOficina = {
  tipo: 'carros',
  veiculo: 'Carro',
  veiculos: 'Carros',
  novoVeiculo: 'Novo carro',
  dadosVeiculo: 'Dados do carro',
  labelDocumento: 'Carro',
  palavraVeiculo: 'carro',
  artigoVeiculo: 'do carro',
  possessivoVeiculo: 'seu carro',
  artigoPossessivoVeiculo: 'do seu carro',
  documentoVeiculo: 'Documento do carro',
}

/** Oficina mista/geral — termo genérico "veículo". */
const TERMOS_VEICULOS: TermosOficina = {
  tipo: 'mista',
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

export function isOficinaMoto(tipo: unknown): boolean {
  return normalizarTipoOficina(tipo) === 'motos'
}

export function isOficinaCarro(tipo: unknown): boolean {
  return normalizarTipoOficina(tipo) === 'carros'
}

export function isOficinaMista(tipo: unknown): boolean {
  return normalizarTipoOficina(tipo) === 'mista'
}

export function obterTermosOficina(tipo: unknown): TermosOficina {
  const normalizado = normalizarTipoOficina(tipo)
  if (normalizado === 'motos') return TERMOS_MOTOS
  if (normalizado === 'carros') return TERMOS_CARROS
  return TERMOS_VEICULOS
}

/** Alias: rótulo singular do veículo conforme tipo. */
export function getLabelVeiculo(tipo: unknown): string {
  return obterTermosOficina(tipo).veiculo
}

/** Alias: rótulo plural. */
export function getLabelVeiculos(tipo: unknown): string {
  return obterTermosOficina(tipo).veiculos
}

/** Rótulo plural (Motos | Carros | Veículos) conforme tipo da oficina. */
export function getRotuloVeiculoPorTipo(tipo: unknown, plural = true): string {
  const termos = obterTermosOficina(tipo)
  return plural ? termos.veiculos : termos.veiculo
}

/** Ícone Lucide: Bike (motos) | Car (carros/mista). */
export function getIconeVeiculo(tipo: unknown): LucideIcon {
  return isOficinaMoto(tipo) ? Bike : Car
}

/** Mensagem vazia da listagem de veículos no Admin e telas similares. */
export function msgNenhumVeiculoCadastrado(tipo: unknown): string {
  const termos = obterTermosOficina(tipo)
  if (termos.tipo === 'motos') return 'Nenhuma moto cadastrada.'
  if (termos.tipo === 'carros') return 'Nenhum carro cadastrado.'
  return 'Nenhum veículo cadastrado.'
}

/** Contador "X cadastrados/as" conforme tipo. */
export function rotuloVeiculosCadastrados(tipo: unknown): string {
  const termos = obterTermosOficina(tipo)
  if (termos.tipo === 'motos') return 'Motos cadastradas'
  if (termos.tipo === 'carros') return 'Carros cadastrados'
  return 'Veículos cadastrados'
}

/**
 * Adapta templates de comunicação ao tipo da oficina.
 * Mensagens padrão preferem "veículo"; em oficina de motos vira "moto".
 * Em carros/mista, "moto" fixo é substituído — "veículo" permanece genérico.
 */
export function adaptarTextoLembrete(texto: string, termos: TermosOficina): string {
  const placeholders: string[] = []
  const protegido = texto.replace(/\{\{[^}]+\}\}/g, (match) => {
    placeholders.push(match)
    return `\x00PH${placeholders.length - 1}\x00`
  })

  let adaptado = protegido
    .replace(/\bda sua moto\b/gi, termos.artigoPossessivoVeiculo)
    .replace(/\bda moto\b/gi, termos.artigoVeiculo)
    .replace(/\bsua moto\b/gi, termos.possessivoVeiculo)
    .replace(/\bmoto\b/gi, termos.palavraVeiculo)

  if (termos.tipo === 'motos') {
    adaptado = adaptado
      .replace(/\bdo seu veículo\b/gi, termos.artigoPossessivoVeiculo)
      .replace(/\bseu veículo\b/gi, termos.possessivoVeiculo)
      .replace(/\bdo veículo\b/gi, termos.artigoVeiculo)
      .replace(/\bda veículo\b/gi, termos.artigoVeiculo)
      .replace(/\bveículo\b/gi, (match) => (match[0] === 'V' ? 'Moto' : 'moto'))
  }

  return adaptado.replace(/\x00PH(\d+)\x00/g, (_, index) => placeholders[Number(index)] ?? '')
}

/** Alias pedido pelo helper central. */
export function getLabelTipoVeiculo(tipo: unknown): string {
  return getLabelVeiculo(tipo)
}

export function msgVeiculoSalvoComSucesso(termos: TermosOficina): string {
  return `${termos.veiculo} salvo com sucesso.`
}

export function msgCadastrePrimeiroVeiculo(termos: TermosOficina): string {
  return `Cadastre primeiro ${termos.palavraVeiculo}`
}
