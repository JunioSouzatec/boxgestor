import type {
  CamposVeiculoParaConsulta,
  DadosBasicosVeiculoConsulta,
} from '@/services/veiculos/vehicle-plate-lookup.service'
import type { MotoInput } from '@/types/moto'

export type ModoFormularioVeiculo = 'novo' | 'edicao'

export type CampoAplicavelConsultaPlaca = 'marca' | 'modelo' | 'ano' | 'cor' | 'combustivel'

export type ModoAplicacaoConsultaPlaca = 'apenas_vazios' | 'confirmado'

export type ConflitoCampoConsultaPlaca = {
  campo: CampoAplicavelConsultaPlaca
  atual: string
  novo: string
}

const CAMPOS_APLICAVEIS: CampoAplicavelConsultaPlaca[] = [
  'marca',
  'modelo',
  'ano',
  'cor',
  'combustivel',
]

export function anoPadraoCadastroVeiculo(referencia = new Date()): number {
  return referencia.getFullYear()
}

export function rotuloCampoConsultaPlaca(campo: CampoAplicavelConsultaPlaca): string {
  switch (campo) {
    case 'marca':
      return 'Marca'
    case 'modelo':
      return 'Modelo'
    case 'ano':
      return 'Ano'
    case 'cor':
      return 'Cor'
    case 'combustivel':
      return 'Combustível'
    default:
      return campo
  }
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

function valoresEquivalentes(campo: CampoAplicavelConsultaPlaca, a: string, b: string): boolean {
  if (campo === 'ano') {
    const na = Number(a)
    const nb = Number(b)
    return Number.isFinite(na) && Number.isFinite(nb) && na === nb
  }
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'accent' }) === 0
}

/** Evidência de edição manual além do ano padrão (placa não conta — costuma estar preenchida na consulta). */
export function evidenciaEdicaoManualVeiculo(campos: CamposVeiculoParaConsulta): boolean {
  return Boolean(
    texto(campos.marca) ||
      texto(campos.modelo) ||
      texto(campos.cor) ||
      texto(campos.combustivel) ||
      texto(campos.chassi) ||
      texto(campos.motor) ||
      texto(campos.tipo_veiculo)
  )
}

export function anoVeiculoConsideradoPreenchido(
  campos: CamposVeiculoParaConsulta,
  modoFormulario: ModoFormularioVeiculo,
  anoPadrao = anoPadraoCadastroVeiculo(),
  anoConsultado?: number
): boolean {
  const ano = campos.ano
  if (typeof ano !== 'number' || !Number.isFinite(ano)) return false

  const anoAtual = Math.floor(ano)
  if (modoFormulario === 'edicao') return true

  if (anoConsultado !== undefined && anoAtual === anoConsultado) return false

  if (anoAtual !== anoPadrao) return true

  if (anoConsultado !== undefined && anoAtual !== anoConsultado) return true

  return evidenciaEdicaoManualVeiculo(campos)
}

export function campoVeiculoConsideradoPreenchido(
  campo: CampoAplicavelConsultaPlaca,
  campos: CamposVeiculoParaConsulta,
  modoFormulario: ModoFormularioVeiculo,
  anoPadrao = anoPadraoCadastroVeiculo(),
  anoConsultado?: number
): boolean {
  if (campo === 'ano') {
    return anoVeiculoConsideradoPreenchido(
      campos,
      modoFormulario,
      anoPadrao,
      anoConsultado
    )
  }
  if (campo === 'combustivel') return Boolean(texto(campos.combustivel))
  if (campo === 'marca') return Boolean(texto(campos.marca))
  if (campo === 'modelo') return Boolean(texto(campos.modelo))
  if (campo === 'cor') return Boolean(texto(campos.cor))
  return false
}

export function camposAtuaisDeFormMotoCliente(form: FormMotoCliente): CamposVeiculoParaConsulta {
  return {
    marca: form.marca,
    modelo: form.modelo,
    ano: form.ano,
    cor: form.cor,
  }
}

export function filtrarCamposAplicaveisConsulta(
  dados: DadosBasicosVeiculoConsulta,
  incluirCombustivel = false
): Partial<Record<CampoAplicavelConsultaPlaca, string>> {
  const out: Partial<Record<CampoAplicavelConsultaPlaca, string>> = {}
  const marca = texto(dados.marca)
  const modelo = texto(dados.modelo)
  const cor = texto(dados.cor)
  const combustivel = texto(dados.combustivel)
  if (marca) out.marca = marca
  if (modelo) out.modelo = modelo
  if (cor) out.cor = cor
  if (incluirCombustivel && combustivel) out.combustivel = combustivel
  if (typeof dados.ano === 'number' && Number.isFinite(dados.ano)) {
    out.ano = String(Math.floor(dados.ano))
  }
  return out
}

export function detectarConflitosConsultaPlaca(opts: {
  camposAtuais: CamposVeiculoParaConsulta
  dados: DadosBasicosVeiculoConsulta
  modoFormulario: ModoFormularioVeiculo
  incluirCombustivel?: boolean
  anoPadrao?: number
}): ConflitoCampoConsultaPlaca[] {
  const aplicaveis = filtrarCamposAplicaveisConsulta(
    opts.dados,
    opts.incluirCombustivel ?? false
  )
  const anoPadrao = opts.anoPadrao ?? anoPadraoCadastroVeiculo()
  const anoConsultado =
    typeof opts.dados.ano === 'number' && Number.isFinite(opts.dados.ano)
      ? Math.floor(opts.dados.ano)
      : undefined
  const conflitos: ConflitoCampoConsultaPlaca[] = []

  for (const campo of CAMPOS_APLICAVEIS) {
    const novo = aplicaveis[campo]
    if (!novo) continue
    if (
      !campoVeiculoConsideradoPreenchido(
        campo,
        opts.camposAtuais,
        opts.modoFormulario,
        anoPadrao,
        anoConsultado
      )
    ) {
      continue
    }
    const atual =
      campo === 'ano'
        ? String(opts.camposAtuais.ano ?? '')
        : texto(opts.camposAtuais[campo])
    if (!valoresEquivalentes(campo, atual, novo)) {
      conflitos.push({ campo, atual, novo })
    }
  }
  return conflitos
}

export function snapshotCamposConsultaPlaca(campos: CamposVeiculoParaConsulta): string {
  const normalizado: Record<string, string> = {}
  for (const campo of [...CAMPOS_APLICAVEIS, 'chassi', 'motor'] as const) {
    if (campo === 'ano') {
      if (typeof campos.ano === 'number' && Number.isFinite(campos.ano)) {
        normalizado.ano = String(campos.ano)
      }
      continue
    }
    const valor = texto(campos[campo as keyof CamposVeiculoParaConsulta])
    if (valor) normalizado[campo] = valor
  }
  return JSON.stringify(normalizado)
}

export type PatchConsultaPlacaForm = Partial<
  Pick<CamposVeiculoParaConsulta, 'marca' | 'modelo' | 'ano' | 'cor' | 'combustivel'>
>

export function montarAtualizacaoConsultaPlaca(opts: {
  formAtual: CamposVeiculoParaConsulta
  dados: DadosBasicosVeiculoConsulta
  modo: ModoAplicacaoConsultaPlaca
  modoFormulario: ModoFormularioVeiculo
  incluirCombustivel?: boolean
  anoPadrao?: number
}): PatchConsultaPlacaForm {
  const aplicaveis = filtrarCamposAplicaveisConsulta(
    opts.dados,
    opts.incluirCombustivel ?? false
  )
  const anoPadrao = opts.anoPadrao ?? anoPadraoCadastroVeiculo()
  const anoConsultado =
    typeof opts.dados.ano === 'number' && Number.isFinite(opts.dados.ano)
      ? Math.floor(opts.dados.ano)
      : undefined
  const patch: PatchConsultaPlacaForm = {}
  const aplicar = new Set<CampoAplicavelConsultaPlaca>()

  for (const campo of CAMPOS_APLICAVEIS) {
    if (!aplicaveis[campo]) continue
    if (opts.modo === 'confirmado') {
      aplicar.add(campo)
      continue
    }
    if (
      !campoVeiculoConsideradoPreenchido(
        campo,
        opts.formAtual,
        opts.modoFormulario,
        anoPadrao,
        anoConsultado
      )
    ) {
      aplicar.add(campo)
    }
  }

  if (aplicar.has('marca') || aplicar.has('modelo')) {
    if (aplicaveis.marca) patch.marca = aplicaveis.marca
    if (aplicaveis.modelo) patch.modelo = aplicaveis.modelo
  }
  if (aplicar.has('ano') && aplicaveis.ano) {
    patch.ano = Number(aplicaveis.ano)
  }
  if (aplicar.has('cor') && aplicaveis.cor) {
    patch.cor = aplicaveis.cor
  }
  if (aplicar.has('combustivel') && aplicaveis.combustivel) {
    patch.combustivel = aplicaveis.combustivel
  }

  return patch
}

export function formatarMensagemConfirmacaoConsultaPlaca(
  conflitos: ConflitoCampoConsultaPlaca[],
  dadosSimulados: boolean
): string {
  const linhas = conflitos.map(
    (c) =>
      `• ${rotuloCampoConsultaPlaca(c.campo)}: "${c.atual}" → "${c.novo}"`
  )
  const base = [
    'Os campos abaixo já possuem valores diferentes e serão substituídos:',
    '',
    ...linhas,
  ]
  if (dadosSimulados) {
    base.push(
      '',
      'DADOS SIMULADOS — ambiente de testes. Não representam consulta real.',
      'Confirme apenas se deseja usar estes valores fictícios no formulário.'
    )
  }
  return base.join('\n')
}

/** Campos de moto no cadastro conjunto com cliente (sem cliente_id) */
export type FormMotoCliente = Omit<MotoInput, 'cliente_id'>

export const formMotoClienteVazio = (): FormMotoCliente => ({
  tipo_veiculo: undefined,
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
    tipo_veiculo: form.tipo_veiculo,
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
