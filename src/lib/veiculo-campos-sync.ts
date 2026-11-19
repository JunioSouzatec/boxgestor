import type { Moto } from '@/types/moto'
import type { TipoOficina } from '@/types/tipo-oficina'

export type TipoVeiculo = 'moto' | 'carro' | 'caminhonete' | 'outro'

export const TIPOS_VEICULO: { value: TipoVeiculo; label: string }[] = [
  { value: 'moto', label: 'Moto' },
  { value: 'carro', label: 'Carro' },
  { value: 'caminhonete', label: 'Caminhonete' },
  { value: 'outro', label: 'Outro' },
]

/** Separador canônico gravado em motorcycles.notes (nunca exibir na UI). */
const SEPARADOR = '\n---craft-veiculo---\n'

/** Aceita CRLF, espaços e caixa mista — registros antigos vazavam na UI. */
const MARKER_RE = /(?:\r?\n)?-{2,}\s*craft[\s_-]*veiculo\s*-{2,}(?:\r?\n)?/i

/** JSON final com tipo_veiculo (sem marcador legível). */
const JSON_TIPO_TRAIL_RE = /\n?\s*(\{\s*"tipo_veiculo"\s*:[\s\S]*\})\s*$/

interface VeiculoMetaSync {
  tipo_veiculo?: TipoVeiculo
  combustivel?: string
  renavam?: string
  motor?: string
  cambio?: string
}

export function isTipoVeiculo(valor: unknown): valor is TipoVeiculo {
  return valor === 'moto' || valor === 'carro' || valor === 'caminhonete' || valor === 'outro'
}

export function normalizarTipoVeiculo(valor: unknown, padrao: TipoVeiculo = 'moto'): TipoVeiculo {
  if (valor === 'moto' || valor === 'carro' || valor === 'caminhonete' || valor === 'outro') {
    return valor
  }
  return padrao
}

/** Tipos permitidos em novos cadastros conforme segmento da oficina. */
export function tiposVeiculoPermitidosNovos(tipoOficina: TipoOficina): TipoVeiculo[] {
  switch (tipoOficina) {
    case 'carros':
      return ['carro', 'caminhonete', 'outro']
    case 'mista':
      return ['moto', 'carro', 'caminhonete', 'outro']
    case 'motos':
    default:
      return ['moto']
  }
}

export function tipoVeiculoPadraoOficina(tipoOficina: TipoOficina): TipoVeiculo {
  return tipoOficina === 'carros' ? 'carro' : 'moto'
}

/** Valor interno do Select — não é um TipoVeiculo persistido. */
export const SENTINELA_TIPO_VEICULO_NAO_SELECIONADO = '__craft_tipo_nao_selecionado__'

/** Tipo inicial em cadastro novo. Oficina mista não recebe default. */
export function tipoVeiculoInicialCadastroNovo(tipoOficina: TipoOficina): TipoVeiculo | undefined {
  if (tipoOficina === 'carros') return 'carro'
  if (tipoOficina === 'motos') return 'moto'
  return undefined
}

export function mensagemTipoVeiculoObrigatorio(): string {
  return 'Selecione o tipo do veículo (Moto, Carro, Caminhonete ou Outro) antes de salvar.'
}

/** Oficina mista: bloqueia salvar enquanto tipo_veiculo não estiver definido. */
export function validarTipoVeiculoObrigatorio(
  tipoOficina: TipoOficina,
  tipo: TipoVeiculo | undefined
): string | null {
  if (tipoOficina !== 'mista') return null
  if (isTipoVeiculo(tipo)) return null
  return mensagemTipoVeiculoObrigatorio()
}

/**
 * Resolve tipo para persistência sem fallback silencioso para Moto em oficina mista.
 * Retorna null quando mista e tipo ausente.
 */
export function resolverTipoVeiculoParaSalvar(
  tipo: TipoVeiculo | undefined,
  tipoOficina: TipoOficina
): TipoVeiculo | null {
  if (isTipoVeiculo(tipo)) return tipo
  if (tipoOficina === 'mista') return null
  return tipoVeiculoPadraoOficina(tipoOficina)
}

/** Opções do seletor — inclui tipo legado ao editar registro antigo. */
export function obterOpcoesTipoVeiculoFormulario(
  tipoOficina: TipoOficina,
  tipoAtualEdicao?: TipoVeiculo
): { value: TipoVeiculo; label: string }[] {
  const permitidos = new Set(tiposVeiculoPermitidosNovos(tipoOficina))
  const opcoes = TIPOS_VEICULO.filter((t) => permitidos.has(t.value))

  if (tipoAtualEdicao && !permitidos.has(tipoAtualEdicao)) {
    const legado = TIPOS_VEICULO.find((t) => t.value === tipoAtualEdicao)
    if (legado) return [...opcoes, legado]
  }

  return opcoes
}

/** Valida salvar — oficina Carros não aceita moto em cadastro novo. */
export function tipoVeiculoValidoParaSalvar(
  tipoOficina: TipoOficina,
  tipo: TipoVeiculo,
  editando: boolean,
  tipoOriginal?: TipoVeiculo
): boolean {
  if (editando && tipoOriginal === tipo && tipo === 'moto' && tipoOficina === 'carros') {
    return true
  }
  return tiposVeiculoPermitidosNovos(tipoOficina).includes(tipo)
}

function normalizarQuebrasDeLinha(texto: string): string {
  return texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function tentarParseMeta(jsonPart: string): VeiculoMetaSync {
  try {
    const parsed = JSON.parse(jsonPart) as VeiculoMetaSync
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Separa observações reais do metadado interno em notes (legado + atual).
 * Compatível com registros antigos já salvos no banco/localStorage.
 */
export function extrairCamposVeiculoDeNotes(notes?: string | null): {
  observacoes: string | undefined
  meta: VeiculoMetaSync
} {
  if (!notes?.trim()) return { observacoes: undefined, meta: {} }
  const texto = normalizarQuebrasDeLinha(notes)

  const match = MARKER_RE.exec(texto)
  if (match && match.index !== undefined) {
    const observacoes = texto.slice(0, match.index).trim() || undefined
    const jsonPart = texto.slice(match.index + match[0].length).trim()
    return { observacoes, meta: tentarParseMeta(jsonPart) }
  }

  // Fallback: só o JSON no final (ou o campo inteiro é o JSON)
  const trail = JSON_TIPO_TRAIL_RE.exec(texto)
  if (trail && trail.index !== undefined) {
    const observacoes = texto.slice(0, trail.index).trim() || undefined
    return { observacoes, meta: tentarParseMeta(trail[1] ?? '') }
  }

  const trimmed = texto.trim()
  if (trimmed.startsWith('{') && trimmed.includes('"tipo_veiculo"')) {
    const meta = tentarParseMeta(trimmed)
    if (meta.tipo_veiculo) return { observacoes: undefined, meta }
  }

  return { observacoes: trimmed || undefined, meta: {} }
}

/** Texto limpo para formulários — sem bloco ---craft-veiculo---. */
export function limparObservacoesVeiculoParaUi(notes?: string | null): string {
  return extrairCamposVeiculoDeNotes(notes).observacoes ?? ''
}

/**
 * Preenche formulário a partir de moto antiga/nova:
 * - remove metadado da UI
 * - recupera tipo_veiculo / campos do bloco se só existirem em notes
 */
export function prepararMotoParaFormulario(
  moto: Moto,
  tipoPadrao: TipoVeiculo = 'moto'
): {
  observacoes: string
  tipo_veiculo: TipoVeiculo
  combustivel: string
  renavam: string
  motor: string
  cambio: string
} {
  const { observacoes, meta } = extrairCamposVeiculoDeNotes(moto.observacoes)
  return {
    observacoes: observacoes ?? '',
    tipo_veiculo: normalizarTipoVeiculo(moto.tipo_veiculo ?? meta.tipo_veiculo, tipoPadrao),
    combustivel: moto.combustivel ?? meta.combustivel ?? '',
    renavam: moto.renavam ?? meta.renavam ?? '',
    motor: moto.motor ?? meta.motor ?? '',
    cambio: moto.cambio ?? meta.cambio ?? '',
  }
}

/**
 * Garante observações locais sem metadado interno; recupera tipo/campos do bloco se vier misturado.
 */
export function sanitizarMotoObservacoesLocais<T extends Partial<Moto>>(moto: T): T {
  if (moto.observacoes === undefined || moto.observacoes === null) return moto
  const { observacoes, meta } = extrairCamposVeiculoDeNotes(moto.observacoes)
  return {
    ...moto,
    observacoes,
    tipo_veiculo: moto.tipo_veiculo ?? meta.tipo_veiculo,
    combustivel: moto.combustivel ?? meta.combustivel,
    renavam: moto.renavam ?? meta.renavam,
    motor: moto.motor ?? meta.motor,
    cambio: moto.cambio ?? meta.cambio,
  }
}

export function montarNotesVeiculo(
  observacoes: string | undefined,
  campos: Pick<Moto, 'tipo_veiculo' | 'combustivel' | 'renavam' | 'motor' | 'cambio'>
): string | undefined {
  // Nunca re-embutir bloco já presente no texto (evita duplicar / vazar na UI)
  const { observacoes: textoLimpo } = extrairCamposVeiculoDeNotes(observacoes)
  const texto = textoLimpo?.trim() ?? ''
  const meta: VeiculoMetaSync = {}
  if (campos.tipo_veiculo) meta.tipo_veiculo = campos.tipo_veiculo
  if (campos.combustivel?.trim()) meta.combustivel = campos.combustivel.trim()
  if (campos.renavam?.trim()) meta.renavam = campos.renavam.trim()
  if (campos.motor?.trim()) meta.motor = campos.motor.trim()
  if (campos.cambio?.trim()) meta.cambio = campos.cambio.trim()

  const temMeta = Object.keys(meta).length > 0
  if (!texto && !temMeta) return undefined
  if (!temMeta) return texto || undefined
  return `${texto}${SEPARADOR}${JSON.stringify(meta)}`
}

export function aplicarMetaVeiculoEmMoto(
  moto: Moto,
  meta: VeiculoMetaSync,
  observacoesLimpa?: string
): Moto {
  return {
    ...moto,
    observacoes: observacoesLimpa ?? moto.observacoes,
    tipo_veiculo: meta.tipo_veiculo ? normalizarTipoVeiculo(meta.tipo_veiculo) : moto.tipo_veiculo,
    combustivel: meta.combustivel ?? moto.combustivel,
    renavam: meta.renavam ?? moto.renavam,
    motor: meta.motor ?? moto.motor,
    cambio: meta.cambio ?? moto.cambio,
  }
}

function assertTesteVeiculoSync(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

/** Runner local — regras de tipo e contrato de prepararMotoParaFormulario. */
export function executarTestesLocaisVeiculoCamposSync(): void {
  assertTesteVeiculoSync(tipoVeiculoInicialCadastroNovo('mista') === undefined, 'mista sem default')
  assertTesteVeiculoSync(tipoVeiculoInicialCadastroNovo('motos') === 'moto', 'motos default moto')
  assertTesteVeiculoSync(tipoVeiculoInicialCadastroNovo('carros') === 'carro', 'carros default carro')
  assertTesteVeiculoSync(
    tiposVeiculoPermitidosNovos('motos').join(',') === 'moto',
    'oficina de motos não oferece carro'
  )
  assertTesteVeiculoSync(
    !tiposVeiculoPermitidosNovos('motos').includes('carro'),
    'moto não recebe carro'
  )
  assertTesteVeiculoSync(
    tiposVeiculoPermitidosNovos('carros').join(',') === 'carro,caminhonete,outro',
    'oficina de carros mantém opções permitidas'
  )
  assertTesteVeiculoSync(
    !tiposVeiculoPermitidosNovos('carros').includes('moto'),
    'carros não oferece moto em cadastro novo'
  )
  assertTesteVeiculoSync(
    tiposVeiculoPermitidosNovos('mista').join(',') === 'moto,carro,caminhonete,outro',
    'mista lista todos os tipos'
  )
  assertTesteVeiculoSync(
    validarTipoVeiculoObrigatorio('mista', undefined) === mensagemTipoVeiculoObrigatorio(),
    'mista exige escolha explícita'
  )
  assertTesteVeiculoSync(validarTipoVeiculoObrigatorio('motos', undefined) === null, 'motos sem bloqueio')
  assertTesteVeiculoSync(validarTipoVeiculoObrigatorio('carros', undefined) === null, 'carros sem bloqueio extra')
  assertTesteVeiculoSync(resolverTipoVeiculoParaSalvar(undefined, 'mista') === null, 'mista não infere moto')
  assertTesteVeiculoSync(resolverTipoVeiculoParaSalvar(undefined, 'motos') === 'moto', 'motos infere moto')
  assertTesteVeiculoSync(resolverTipoVeiculoParaSalvar(undefined, 'carros') === 'carro', 'carros infere carro')
  assertTesteVeiculoSync(resolverTipoVeiculoParaSalvar('carro', 'motos') === 'carro', 'valor explícito não é reescrito aqui')

  const moto: Moto = {
    id: '1',
    oficina_id: 'o',
    cliente_id: 'c',
    marca: 'Honda',
    modelo: 'CG',
    ano: 2020,
    placa: 'ABC1D23',
    cor: 'Preta',
    quilometragem: 0,
    criado_em: '2020-01-01',
  }
  assertTesteVeiculoSync(
    prepararMotoParaFormulario(moto).tipo_veiculo === 'moto',
    'prepararMotoParaFormulario mantém default moto'
  )
  assertTesteVeiculoSync(
    prepararMotoParaFormulario(moto, 'carro').tipo_veiculo === 'carro',
    'prepararMotoParaFormulario preserva tipoPadrao'
  )
  assertTesteVeiculoSync(
    prepararMotoParaFormulario({ ...moto, tipo_veiculo: 'caminhonete' }, 'moto').tipo_veiculo ===
      'caminhonete',
    'prepararMotoParaFormulario preserva tipo gravado'
  )
}
