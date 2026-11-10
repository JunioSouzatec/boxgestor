import type { LucideIcon } from 'lucide-react'
import { Bike, Car } from 'lucide-react'
import {
  extrairCamposVeiculoDeNotes,
  type TipoVeiculo,
} from '@/lib/veiculo-campos-sync'
import {
  normalizarTipoOficina,
  type TipoOficina,
} from '@/types/tipo-oficina'
import type { Moto } from '@/types/moto'

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
  /** Placeholder do campo marca no cadastro */
  placeholderMarca: string
  /** Placeholder do campo modelo no cadastro */
  placeholderModelo: string
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
  placeholderMarca: 'Ex.: Honda',
  placeholderModelo: 'Ex.: CG 160',
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
  placeholderMarca: 'Ex.: Chevrolet',
  placeholderModelo: 'Ex.: Celta',
}

/** Linguagem neutra para comunicação (tipo desconhecido ou sem veículo associado). */
const TERMOS_NEUTRO_COMUNICACAO: TermosOficina = {
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
  placeholderMarca: 'Ex.: Chevrolet, Honda',
  placeholderModelo: 'Ex.: Celta, CG 160',
}

/** Caminhonete — possessivo feminino em mensagens ao cliente. */
const TERMOS_CAMINHONETE: TermosOficina = {
  tipo: 'mista',
  veiculo: 'Caminhonete',
  veiculos: 'Caminhonetes',
  novoVeiculo: 'Nova caminhonete',
  dadosVeiculo: 'Dados da caminhonete',
  labelDocumento: 'Caminhonete',
  palavraVeiculo: 'caminhonete',
  artigoVeiculo: 'da caminhonete',
  possessivoVeiculo: 'sua caminhonete',
  artigoPossessivoVeiculo: 'da sua caminhonete',
  documentoVeiculo: 'Documento da caminhonete',
  placeholderMarca: 'Ex.: Chevrolet',
  placeholderModelo: 'Ex.: S10',
}

/** Oficina mista/geral — termo genérico "veículo" (menus e UI). */
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
  placeholderMarca: 'Ex.: Chevrolet, Honda',
  placeholderModelo: 'Ex.: Celta, CG 160',
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

function isTipoVeiculoConhecido(valor: unknown): valor is TipoVeiculo {
  return (
    valor === 'moto' ||
    valor === 'carro' ||
    valor === 'caminhonete' ||
    valor === 'outro'
  )
}

/**
 * Tipo explícito do registro (campo ou meta em notes) — sem fallback para moto/carro da oficina.
 */
export function resolverTipoVeiculoRegistro(
  moto: Pick<Moto, 'tipo_veiculo' | 'observacoes'> | null | undefined
): TipoVeiculo | undefined {
  if (!moto) return undefined
  if (isTipoVeiculoConhecido(moto.tipo_veiculo)) return moto.tipo_veiculo
  const { meta } = extrairCamposVeiculoDeNotes(moto.observacoes)
  if (isTipoVeiculoConhecido(meta.tipo_veiculo)) return meta.tipo_veiculo
  return undefined
}

/**
 * Termos para mensagens WhatsApp/lembretes conforme o veículo (não o segmento da oficina).
 */
export function obterTermosComunicacaoVeiculo(
  tipoVeiculo: TipoVeiculo | undefined,
  opts?: { veiculoAssociado?: boolean }
): TermosOficina {
  if (opts?.veiculoAssociado === false) return { ...TERMOS_NEUTRO_COMUNICACAO }
  switch (tipoVeiculo) {
    case 'moto':
      return { ...TERMOS_MOTOS }
    case 'carro':
      return { ...TERMOS_CARROS }
    case 'caminhonete':
      return { ...TERMOS_CAMINHONETE }
    case 'outro':
      return { ...TERMOS_NEUTRO_COMUNICACAO }
    default:
      return { ...TERMOS_NEUTRO_COMUNICACAO }
  }
}

export function obterTermosComunicacaoDeMoto(
  moto: Pick<Moto, 'tipo_veiculo' | 'observacoes'> | null | undefined
): TermosOficina {
  if (!moto) return obterTermosComunicacaoVeiculo(undefined, { veiculoAssociado: false })
  return obterTermosComunicacaoVeiculo(resolverTipoVeiculoRegistro(moto), {
    veiculoAssociado: true,
  })
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

  if (termos.tipo === 'motos' || termos.tipo === 'carros') {
    adaptado = adaptado
      .replace(/\bdo seu veículo\b/gi, termos.artigoPossessivoVeiculo)
      .replace(/\bseu veículo\b/gi, termos.possessivoVeiculo)
      .replace(/\bdo veículo\b/gi, termos.artigoVeiculo)
      .replace(/\bda veículo\b/gi, termos.artigoVeiculo)
      .replace(/\bveículo\b/gi, (match) =>
        match[0] === 'V' ? termos.veiculo : termos.palavraVeiculo
      )
  }

  return adaptado.replace(/\x00PH(\d+)\x00/g, (_, index) => placeholders[Number(index)] ?? '')
}

/**
 * Trecho natural para mensagens WhatsApp/comunicação.
 * Sem veículo/placa: retorna só o possessivo ("seu carro"), sem "Não informado".
 */
export function formatarReferenciaVeiculoMensagem(
  marcaModelo: string | null | undefined,
  placa: string | null | undefined,
  termos: TermosOficina,
  estilo: 'artigo_possessivo' | 'possessivo' = 'artigo_possessivo'
): string {
  const limpar = (v: string | null | undefined) =>
    (v ?? '')
      .trim()
      .replace(/^Não informad[oa]$/i, '')
  const nome = limpar(marcaModelo)
  const p = limpar(placa)
  const base =
    estilo === 'possessivo' ? termos.possessivoVeiculo : termos.artigoPossessivoVeiculo
  if (nome && p) return `${base} ${nome} (placa ${p})`
  if (nome) return `${base} ${nome}`
  if (p) return `${base} (placa ${p})`
  return base
}

/** Versão com destaque WhatsApp (*negrito*) para templates legados. */
export function formatarReferenciaVeiculoDestaque(
  marcaModelo: string | null | undefined,
  placa: string | null | undefined,
  termos: TermosOficina
): string {
  const limpar = (v: string | null | undefined) =>
    (v ?? '')
      .trim()
      .replace(/^Não informad[oa]$/i, '')
  const nome = limpar(marcaModelo)
  const p = limpar(placa)
  const base = termos.possessivoVeiculo
  if (nome && p) return `${base} *${nome}* (placa *${p}*)`
  if (nome) return `${base} *${nome}*`
  if (p) return `${base} (placa *${p}*)`
  return base
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
