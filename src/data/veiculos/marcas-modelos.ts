/**
 * Base simples e expansível de marcas/modelos para sugestão no cadastro de veículos.
 *
 * NÃO é uma base completa do Brasil — são sugestões populares. O usuário
 * sempre pode digitar valor livre, e valores antigos/customizados são preservados.
 * Listas exibidas ao usuário saem ordenadas (Outro no final).
 */
import type { TipoVeiculo } from '@/lib/veiculo-campos-sync'

/** Marcas de carro/caminhonete comuns no Brasil. */
export const MARCAS_CARRO: string[] = [
  'Audi',
  'BMW',
  'BYD',
  'CAOA Chery',
  'Chevrolet',
  'Citroën',
  'Fiat',
  'Ford',
  'GWM',
  'Honda',
  'Hyundai',
  'JAC',
  'Jeep',
  'Kia',
  'Land Rover',
  'Mercedes-Benz',
  'Mitsubishi',
  'Nissan',
  'Peugeot',
  'RAM',
  'Renault',
  'Suzuki',
  'Toyota',
  'Volkswagen',
  'Volvo',
]

/** Marcas de moto comuns no Brasil. */
export const MARCAS_MOTO: string[] = [
  'Bajaj',
  'BMW',
  'Dafra',
  'Ducati',
  'Haojue',
  'Harley-Davidson',
  'Honda',
  'Kawasaki',
  'KTM',
  'Kymco',
  'Royal Enfield',
  'Shineray',
  'Suzuki',
  'Triumph',
  'Voltz',
  'Yamaha',
  'Zontes',
]

/** Modelos comuns por marca de carro (lista inicial, expansível). */
export const MODELOS_CARRO: Record<string, string[]> = {
  Audi: ['A3', 'A4', 'A5', 'Q3', 'Q5', 'Q7'],
  BMW: ['118i', '120i', '320i', 'X1', 'X3', 'X5', 'X6'],
  BYD: ['Dolphin', 'Dolphin Mini', 'King', 'Seal', 'Song Plus', 'Yuan Plus'],
  'CAOA Chery': ['Arrizo 6', 'Tiggo 5x', 'Tiggo 7', 'Tiggo 8'],
  Chevrolet: [
    'Agile',
    'Astra',
    'Blazer',
    'Camaro',
    'Captiva',
    'Celta',
    'Classic',
    'Cobalt',
    'Corsa',
    'Cruze',
    'Equinox',
    'Kadett',
    'Meriva',
    'Montana',
    'Onix',
    'Onix Plus',
    'Prisma',
    'S10',
    'Spin',
    'Tracker',
    'Trailblazer',
    'Vectra',
    'Zafira',
  ],
  Citroën: ['Aircross', 'Basalt', 'C3', 'C4 Cactus', 'C4 Lounge'],
  Fiat: [
    '500',
    'Argo',
    'Cronos',
    'Doblo',
    'Ducato',
    'Fastback',
    'Fiorino',
    'Grand Siena',
    'Idea',
    'Mobi',
    'Palio',
    'Pulse',
    'Punto',
    'Siena',
    'Strada',
    'Toro',
    'Uno',
  ],
  Ford: [
    'EcoSport',
    'Edge',
    'Fiesta',
    'Focus',
    'Fusion',
    'Ka',
    'Maverick',
    'Mustang',
    'Ranger',
    'Territory',
  ],
  GWM: ['Haval H6', 'Ora 03', 'Poer'],
  Honda: ['Accord', 'City', 'Civic', 'CR-V', 'Fit', 'HR-V', 'WR-V', 'ZR-V'],
  Hyundai: ['Azera', 'Creta', 'Elantra', 'HB20', 'HB20S', 'i30', 'Santa Fe', 'Tucson', 'Venue', 'ix35'],
  JAC: ['E-JS1', 'T40', 'T50'],
  Jeep: ['Cherokee', 'Commander', 'Compass', 'Gladiator', 'Renegade', 'Wrangler'],
  Kia: ['Cerato', 'Picanto', 'Sorento', 'Soul', 'Sportage', 'Stonic'],
  'Land Rover': ['Defender', 'Discovery', 'Evoque', 'Range Rover'],
  'Mercedes-Benz': ['Classe A', 'Classe C', 'Classe E', 'GLA', 'GLB', 'GLC'],
  Mitsubishi: ['ASX', 'Eclipse Cross', 'L200', 'Outlander', 'Pajero', 'Pajero Sport'],
  Nissan: ['Frontier', 'Kicks', 'Livina', 'March', 'Sentra', 'Tiida', 'Versa', 'X-Trail'],
  Peugeot: ['2008', '208', '208 GT', '3008', '308', '5008'],
  RAM: ['1500', '2500', 'Rampage'],
  Renault: [
    'Captur',
    'Clio',
    'Duster',
    'Fluence',
    'Kangoo',
    'Kwid',
    'Logan',
    'Megane',
    'Oroch',
    'Sandero',
    'Stepway',
  ],
  Suzuki: ['Grand Vitara', 'Jimny', 'S-Cross', 'Swift', 'Vitara'],
  Toyota: [
    'Bandeirante',
    'Camry',
    'Corolla',
    'Corolla Cross',
    'Etios',
    'Fielder',
    'Hilux',
    'Prius',
    'RAV4',
    'SW4',
    'Yaris',
  ],
  Volkswagen: [
    'Amarok',
    'CrossFox',
    'Fox',
    'Gol',
    'Golf',
    'Jetta',
    'Kombi',
    'Nivus',
    'Passat',
    'Polo',
    'Saveiro',
    'SpaceFox',
    'T-Cross',
    'Taos',
    'Tiguan',
    'Up',
    'Virtus',
    'Voyage',
  ],
  Volvo: ['XC40', 'XC60', 'XC90'],
}

/** Modelos comuns por marca de moto. */
export const MODELOS_MOTO: Record<string, string[]> = {
  Bajaj: ['Avenger 220', 'Dominar 250', 'Dominar 400', 'Pulsar 150', 'Pulsar NS160', 'Pulsar NS200'],
  BMW: ['F 750 GS', 'F 850 GS', 'G 310 GS', 'G 310 R', 'R 1250 GS', 'S 1000 RR'],
  Dafra: ['Apache 200', 'Citycom 300', 'Horizon 150', 'NH 190', 'Next 300'],
  Ducati: ['Monster', 'Multistrada', 'Panigale V2', 'Scrambler'],
  Haojue: ['Chopper Road 150', 'DK 150', 'DK 160', 'Master Ride 150'],
  'Harley-Davidson': ['Fat Boy', 'Forty-Eight', 'Iron 883', 'Sportster S', 'Street 750'],
  Honda: [
    'ADV 150',
    'Bros 160',
    'CB 300F',
    'CB 500',
    'CB 500F',
    'CG 125',
    'CG 160',
    'CG 160 Fan',
    'CG 160 Titan',
    'Elite 125',
    'Hornet',
    'NXR 160',
    'PCX',
    'Pop 110i',
    'SH 150',
    'Twister 250',
    'XRE 190',
    'XRE 300',
    'Biz 110i',
    'Biz 125',
  ],
  Kawasaki: ['Ninja 300', 'Ninja 400', 'Ninja 650', 'Versys 300', 'Versys 650', 'Z400', 'Z900'],
  KTM: ['Adventure 390', 'Duke 200', 'Duke 390', 'Duke 890'],
  Kymco: ['Agility 125', 'Like 150', 'People 150'],
  'Royal Enfield': ['Classic 350', 'Himalayan', 'Hunter 350', 'Interceptor 650', 'Meteor 350'],
  Shineray: ['Explorer 150', 'Jet 50', 'New Jet 50', 'Phoenix 50', 'Worker 125', 'XY 125'],
  Suzuki: ['Burgman 125', 'GSX-S750', 'GSX-S1000', 'Hayabusa', 'Intruder 125', 'V-Strom 650', 'Yes 125'],
  Triumph: ['Bonneville', 'Speed Twin', 'Street Triple', 'Tiger 900', 'Trident 660'],
  Voltz: ['EV1', 'EVS'],
  Yamaha: [
    'Crosser 150',
    'Crypton',
    'Factor 125',
    'Factor 150',
    'Fazer 150',
    'Fazer 250',
    'FZ15',
    'Lander 250',
    'MT-03',
    'MT-07',
    'MT-09',
    'NMAX 160',
    'Neo 125',
    'R3',
    'Tenere 250',
    'XTZ 150 Crosser',
    'YBR 125',
    'YBR 150',
  ],
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
 * Ordena sugestões em pt-BR e garante "Outro" sempre no final.
 * Impede listas bagunçadas mesmo se a constante de origem for reordenada.
 */
export function ordenarSugestoes(valores: string[]): string[] {
  const unicos = ordenarUnico(valores.filter((v) => v.trim() && !ehOpcaoOutro(v)))
  return [...unicos, OPCAO_OUTRO]
}

/**
 * Marcas sugeridas para o tipo. Carro/caminhonete → marcas de carro;
 * moto → marcas de moto; "outro"/indefinido → união (apenas sugestões).
 */
export function marcasPorTipo(tipo?: TipoVeiculo): string[] {
  if (tipo === 'moto') return ordenarSugestoes(MARCAS_MOTO)
  if (ehTipoCarro(tipo)) return ordenarSugestoes(MARCAS_CARRO)
  return ordenarSugestoes([...MARCAS_CARRO, ...MARCAS_MOTO])
}

/** Modelos sugeridos para marca+tipo. Lista vazia quando marca desconhecida. */
export function modelosPorMarca(tipo: TipoVeiculo | undefined, marca: string): string[] {
  const chave = marca.trim()
  if (!chave || igualSemCaixa(chave, OPCAO_OUTRO)) return [OPCAO_OUTRO]
  if (tipo === 'moto') return ordenarSugestoes(MODELOS_MOTO[chave] ?? [])
  if (ehTipoCarro(tipo)) return ordenarSugestoes(MODELOS_CARRO[chave] ?? [])
  const carro = MODELOS_CARRO[chave] ?? []
  const moto = MODELOS_MOTO[chave] ?? []
  return ordenarSugestoes([...carro, ...moto])
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
 * Se o modelo atual é um modelo CONHECIDO da marca antiga
 * (sugerido, não texto livre) e NÃO é conhecido da nova marca,
 * limpa o modelo. Caso contrário (customizado/legado, vazio ou
 * já compatível), preserva.
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
