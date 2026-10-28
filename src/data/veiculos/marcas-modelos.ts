/**
 * Base simples e expansível de marcas/modelos para sugestão no cadastro de veículos.
 *
 * NÃO é uma base completa do Brasil — são apenas sugestões (datalist). O usuário
 * sempre pode digitar "Outro" valor livremente, e valores antigos/customizados
 * são preservados (o campo aceita texto livre).
 */
import type { TipoVeiculo } from '@/lib/veiculo-campos-sync'

/** Marcas de carro/caminhonete comuns no Brasil. */
export const MARCAS_CARRO: string[] = [
  'Chevrolet',
  'Fiat',
  'Volkswagen',
  'Ford',
  'Renault',
  'Toyota',
  'Honda',
  'Hyundai',
  'Jeep',
  'Nissan',
  'Peugeot',
  'Citroën',
  'Mitsubishi',
  'Kia',
  'BMW',
  'Mercedes-Benz',
  'Audi',
  'Volvo',
  'CAOA Chery',
  'BYD',
  'GWM',
]

/** Marcas de moto comuns no Brasil. */
export const MARCAS_MOTO: string[] = [
  'Honda',
  'Yamaha',
  'Suzuki',
  'Kawasaki',
  'BMW',
  'Dafra',
  'Shineray',
  'Haojue',
  'Royal Enfield',
  'Bajaj',
  'Triumph',
  'KTM',
  'Ducati',
  'Harley-Davidson',
  'Kymco',
  'Zontes',
]

/** Modelos comuns por marca de carro (lista inicial, expansível). */
export const MODELOS_CARRO: Record<string, string[]> = {
  Chevrolet: ['Onix', 'Onix Plus', 'Prisma', 'Celta', 'Cruze', 'Tracker', 'Spin', 'S10', 'Montana', 'Cobalt'],
  Fiat: ['Uno', 'Mobi', 'Argo', 'Cronos', 'Pulse', 'Toro', 'Strada', 'Palio', 'Siena', 'Fastback'],
  Volkswagen: ['Gol', 'Polo', 'Virtus', 'Voyage', 'T-Cross', 'Nivus', 'Saveiro', 'Fox', 'Jetta', 'Amarok'],
  Ford: ['Ka', 'Fiesta', 'Focus', 'EcoSport', 'Ranger', 'Territory', 'Maverick'],
  Renault: ['Kwid', 'Sandero', 'Logan', 'Duster', 'Captur', 'Oroch', 'Stepway'],
  Toyota: ['Corolla', 'Corolla Cross', 'Yaris', 'Hilux', 'SW4', 'Etios', 'RAV4'],
  Honda: ['Civic', 'City', 'Fit', 'HR-V', 'WR-V', 'CR-V'],
  Hyundai: ['HB20', 'HB20S', 'Creta', 'Tucson', 'ix35', 'Azera'],
  Jeep: ['Renegade', 'Compass', 'Commander', 'Gladiator'],
  Nissan: ['Kicks', 'Versa', 'March', 'Frontier', 'Sentra'],
  Peugeot: ['208', '2008', '3008', '208 GT'],
  Citroën: ['C3', 'C4 Cactus', 'Aircross', 'Basalt'],
  Mitsubishi: ['L200', 'Pajero', 'Outlander', 'Eclipse Cross', 'ASX'],
  Kia: ['Sportage', 'Cerato', 'Picanto', 'Sorento'],
  BMW: ['320i', 'X1', 'X3', 'X5', '120i'],
  'Mercedes-Benz': ['Classe A', 'Classe C', 'GLA', 'GLC'],
  Audi: ['A3', 'A4', 'Q3', 'Q5'],
  Volvo: ['XC40', 'XC60', 'XC90'],
  'CAOA Chery': ['Tiggo 5x', 'Tiggo 7', 'Tiggo 8', 'Arrizo 6'],
  BYD: ['Dolphin', 'Song Plus', 'Yuan Plus', 'Seal'],
  GWM: ['Haval H6', 'Ora 03'],
}

/** Modelos comuns por marca de moto (lista inicial, expansível). */
export const MODELOS_MOTO: Record<string, string[]> = {
  Honda: ['CG 160', 'CG 160 Titan', 'CG 160 Fan', 'Biz 125', 'Biz 110i', 'Pop 110i', 'CB 300F', 'CB 500', 'XRE 300', 'Bros 160', 'PCX', 'Elite 125'],
  Yamaha: ['Factor 150', 'Fazer 250', 'YBR 150', 'XTZ 150 Crosser', 'Lander 250', 'NMAX 160', 'MT-03', 'MT-07', 'R3'],
  Suzuki: ['Intruder 125', 'Yes 125', 'GSX-S750', 'V-Strom 650', 'Burgman 125'],
  Kawasaki: ['Ninja 300', 'Ninja 400', 'Z400', 'Z900', 'Versys 650'],
  BMW: ['G 310 R', 'G 310 GS', 'F 750 GS', 'F 850 GS', 'R 1250 GS'],
  Dafra: ['Apache 200', 'NH 190', 'Citycom 300', 'Horizon 150'],
  Shineray: ['Jet 50', 'Phoenix 50', 'XY 125', 'New Jet 50'],
  Haojue: ['DK 150', 'DK 160', 'Master Ride 150', 'Chopper Road 150'],
  'Royal Enfield': ['Meteor 350', 'Classic 350', 'Himalayan', 'Hunter 350'],
  Bajaj: ['Dominar 400', 'Pulsar NS200'],
  Triumph: ['Street Triple', 'Tiger 900', 'Trident 660'],
  KTM: ['Duke 200', 'Duke 390', 'Adventure 390'],
  Ducati: ['Monster', 'Panigale V2', 'Multistrada'],
  'Harley-Davidson': ['Iron 883', 'Forty-Eight', 'Fat Boy', 'Sportster S'],
  Kymco: ['Agility 125', 'Like 150', 'People 150'],
  Zontes: ['ZT 310', 'ZT 350'],
}

/** Rótulo visível de "Outro" (apenas informativo; o campo aceita texto livre). */
export const OPCAO_OUTRO = 'Outro'

function ehTipoCarro(tipo?: TipoVeiculo): boolean {
  return tipo === 'carro' || tipo === 'caminhonete'
}

function ordenarUnico(valores: string[]): string[] {
  return Array.from(new Set(valores)).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

function igualSemCaixa(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR')
}

/** "Outro" é só atalho de UX — não deve ser persistido como marca/modelo. */
export function ehOpcaoOutro(valor: string): boolean {
  return igualSemCaixa(valor, OPCAO_OUTRO)
}

/** Se o usuário escolheu "Outro", devolve vazio para ele digitar o valor real. */
export function valorManualOuVazio(valor: string): string {
  return ehOpcaoOutro(valor) ? '' : valor
}

/**
 * Marcas sugeridas para o tipo. Carro/caminhonete → marcas de carro;
 * moto → marcas de moto; "outro"/indefinido → união (apenas sugestões).
 */
function comOutro(lista: string[]): string[] {
  return lista.includes(OPCAO_OUTRO) ? lista : [...lista, OPCAO_OUTRO]
}

export function marcasPorTipo(tipo?: TipoVeiculo): string[] {
  if (tipo === 'moto') return comOutro([...MARCAS_MOTO])
  if (ehTipoCarro(tipo)) return comOutro([...MARCAS_CARRO])
  return comOutro(ordenarUnico([...MARCAS_CARRO, ...MARCAS_MOTO]))
}

/** Modelos sugeridos para marca+tipo. Lista vazia quando marca desconhecida. */
export function modelosPorMarca(tipo: TipoVeiculo | undefined, marca: string): string[] {
  const chave = marca.trim()
  if (!chave || igualSemCaixa(chave, OPCAO_OUTRO)) return [OPCAO_OUTRO]
  if (tipo === 'moto') return comOutro(MODELOS_MOTO[chave] ? [...MODELOS_MOTO[chave]] : [])
  if (ehTipoCarro(tipo)) return comOutro(MODELOS_CARRO[chave] ? [...MODELOS_CARRO[chave]] : [])
  const carro = MODELOS_CARRO[chave] ?? []
  const moto = MODELOS_MOTO[chave] ?? []
  return comOutro(ordenarUnico([...carro, ...moto]))
}

/** O modelo é um dos modelos sugeridos (conhecidos) para a marca? */
export function ehModeloConhecidoDaMarca(
  tipo: TipoVeiculo | undefined,
  marca: string,
  modelo: string
): boolean {
  if (!modelo.trim() || ehOpcaoOutro(modelo)) return false
  return modelosPorMarca(tipo, marca)
    .filter((m) => !ehOpcaoOutro(m))
    .some((m) => igualSemCaixa(m, modelo))
}

/**
 * Resolve o modelo ao trocar a marca.
 *
 * Regra (item F): se o modelo atual é um modelo CONHECIDO da marca antiga
 * (ou seja, foi sugerido, não é texto livre) e NÃO é conhecido da nova marca,
 * limpa o modelo. Caso contrário (modelo customizado/texto livre, ou vazio, ou
 * já compatível), preserva — assim não apaga dados antigos/customizados.
 */
export function resolverModeloAoTrocarMarca(
  tipo: TipoVeiculo | undefined,
  marcaAntiga: string,
  marcaNova: string,
  modeloAtual: string
): string {
  if (!modeloAtual.trim()) return ''
  if (igualSemCaixa(marcaAntiga, marcaNova)) return modeloAtual
  const eraConhecidoDaAntiga = ehModeloConhecidoDaMarca(tipo, marcaAntiga, modeloAtual)
  const eConhecidoDaNova = ehModeloConhecidoDaMarca(tipo, marcaNova, modeloAtual)
  if (eraConhecidoDaAntiga && !eConhecidoDaNova) return ''
  return modeloAtual
}

/**
 * Ao trocar o tipo (carro ↔ moto), limpa só modelo sugerido incompatível.
 * Customizado/legado permanece.
 */
export function resolverModeloAoTrocarTipo(
  tipoAntigo: TipoVeiculo | undefined,
  tipoNovo: TipoVeiculo | undefined,
  marca: string,
  modeloAtual: string
): string {
  if (!modeloAtual.trim()) return ''
  if (tipoAntigo === tipoNovo) return modeloAtual
  const eraConhecido = ehModeloConhecidoDaMarca(tipoAntigo, marca, modeloAtual)
  const eConhecido = ehModeloConhecidoDaMarca(tipoNovo, marca, modeloAtual)
  if (eraConhecido && !eConhecido) return ''
  return modeloAtual
}
