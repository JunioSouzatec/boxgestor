import type { Moto } from '@/types/moto'
import type { TipoOficina } from '@/types/tipo-oficina'

export type TipoVeiculo = 'moto' | 'carro' | 'caminhonete' | 'outro'

export const TIPOS_VEICULO: { value: TipoVeiculo; label: string }[] = [
  { value: 'moto', label: 'Moto' },
  { value: 'carro', label: 'Carro' },
  { value: 'caminhonete', label: 'Caminhonete' },
  { value: 'outro', label: 'Outro' },
]

const SEPARADOR = '\n---craft-veiculo---\n'

interface VeiculoMetaSync {
  tipo_veiculo?: TipoVeiculo
  combustivel?: string
  renavam?: string
  motor?: string
  cambio?: string
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

export function extrairCamposVeiculoDeNotes(notes?: string | null): {
  observacoes: string | undefined
  meta: VeiculoMetaSync
} {
  if (!notes?.trim()) return { observacoes: undefined, meta: {} }
  const idx = notes.indexOf(SEPARADOR)
  if (idx < 0) return { observacoes: notes.trim() || undefined, meta: {} }
  const observacoes = notes.slice(0, idx).trim() || undefined
  const jsonPart = notes.slice(idx + SEPARADOR.length).trim()
  try {
    const parsed = JSON.parse(jsonPart) as VeiculoMetaSync
    return { observacoes, meta: parsed ?? {} }
  } catch {
    return { observacoes: notes.trim() || undefined, meta: {} }
  }
}

export function montarNotesVeiculo(
  observacoes: string | undefined,
  campos: Pick<Moto, 'tipo_veiculo' | 'combustivel' | 'renavam' | 'motor' | 'cambio'>
): string | undefined {
  const texto = observacoes?.trim() ?? ''
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
