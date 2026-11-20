import type {
  CamposVeiculoParaConsulta,
  DadosBasicosVeiculoConsulta,
} from '@/services/veiculos/vehicle-plate-lookup.service'
import type { MotoInput } from '@/types/moto'

/** Campos de moto no cadastro conjunto com cliente (sem cliente_id). */
export type FormMotoCliente = Omit<MotoInput, 'cliente_id' | 'ano'> & {
  /** Ausente no cadastro novo. Número só após digitação ou consulta por placa. */
  ano?: number
}

/** Limites aceitos por mapearMotorcycle (1900–2100), sem gravar o ano corrente no lugar de vazio. */
export const ANO_VEICULO_MIN = 1900
export const ANO_VEICULO_MAX = 2100

/** Cadastro novo não recebe o ano corrente. Edição continua usando o ano já salvo. */
export function anoInicialCadastroVeiculoNovo(): undefined {
  return undefined
}

export function anoPersistivelVeiculo(ano: number | undefined): ano is number {
  return (
    typeof ano === 'number' &&
    Number.isInteger(ano) &&
    ano >= ANO_VEICULO_MIN &&
    ano <= ANO_VEICULO_MAX
  )
}

export const formMotoClienteVazio = (): FormMotoCliente => ({
  marca: '',
  modelo: '',
  ano: anoInicialCadastroVeiculoNovo(),
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
  if (!anoPersistivelVeiculo(form.ano)) {
    return `Informe um ano válido ${art} (${ANO_VEICULO_MIN} a ${ANO_VEICULO_MAX}).`
  }
  return null
}

export function formMotoClienteParaInput(
  form: FormMotoCliente,
  clienteId: string
): MotoInput {
  if (!anoPersistivelVeiculo(form.ano)) {
    throw new Error('Ano do veículo inválido.')
  }
  return {
    cliente_id: clienteId,
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

export type ModoFormularioVeiculo = 'novo' | 'edicao'

export type CampoAplicavelConsultaPlaca = 'marca' | 'modelo' | 'ano' | 'cor' | 'combustivel'

/** Origem do valor no formulário — distingue vazio, consulta automática e edição manual. */
export type OrigemValorCampoVeiculo = 'consulta_placa' | 'manual'

export type MetadadosOrigemCamposVeiculo = Partial<
  Record<CampoAplicavelConsultaPlaca, OrigemValorCampoVeiculo>
>

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

export function metadadosOrigemCamposInicial(): MetadadosOrigemCamposVeiculo {
  return {}
}

export function registrarOrigemManualCampo(
  meta: MetadadosOrigemCamposVeiculo,
  campo: CampoAplicavelConsultaPlaca
): MetadadosOrigemCamposVeiculo {
  return { ...meta, [campo]: 'manual' }
}

export function aplicarOrigemConsultaPlaca(
  meta: MetadadosOrigemCamposVeiculo,
  patch: PatchConsultaPlacaForm
): MetadadosOrigemCamposVeiculo {
  const next = { ...meta }
  for (const campo of CAMPOS_APLICAVEIS) {
    if (campo === 'ano' && patch.ano !== undefined) {
      next.ano = 'consulta_placa'
    } else if (campo !== 'ano' && patch[campo]) {
      next[campo] = 'consulta_placa'
    }
  }
  return next
}

/** Reset total ao abrir cadastro novo ou edição. Não usar na troca de placa. */
export function resetarOrigemConsultaPlaca(): MetadadosOrigemCamposVeiculo {
  return {}
}

/**
 * Troca de placa: remove só o vínculo com a consulta anterior.
 * Origem manual permanece, e os valores do formulário não são alterados aqui.
 */
export function limparOrigensConsultaAoTrocarPlaca(
  meta: MetadadosOrigemCamposVeiculo
): MetadadosOrigemCamposVeiculo {
  const next: MetadadosOrigemCamposVeiculo = {}
  for (const campo of CAMPOS_APLICAVEIS) {
    if (meta[campo] === 'manual') next[campo] = 'manual'
  }
  return next
}

export function parseAnoCampoVeiculo(raw: string): number | undefined {
  const t = raw.trim()
  if (!/^\d{1,4}$/.test(t)) return undefined
  const ano = Number(t)
  if (!Number.isInteger(ano) || ano <= 0) return undefined
  return ano
}

export function anoExibicaoCampoVeiculo(ano: number | undefined): string {
  return typeof ano === 'number' && Number.isFinite(ano) ? String(ano) : ''
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

/** Ano presente no formulário, inclusive o ano corrente. Vazio não gera conflito. */
export function anoVeiculoConsideradoPreenchido(
  campos: CamposVeiculoParaConsulta
): boolean {
  const ano = campos.ano
  return typeof ano === 'number' && Number.isFinite(ano)
}

export function campoVeiculoConsideradoPreenchido(
  campo: CampoAplicavelConsultaPlaca,
  campos: CamposVeiculoParaConsulta,
  modoFormulario: ModoFormularioVeiculo,
  origemCampos?: MetadadosOrigemCamposVeiculo
): boolean {
  const origem = origemCampos?.[campo]
  if (modoFormulario === 'novo' && origem === 'consulta_placa' && campo !== 'ano') {
    return false
  }
  if (origem === 'manual') {
    if (campo === 'ano') {
      return typeof campos.ano === 'number' && Number.isFinite(campos.ano)
    }
    return Boolean(texto(campos[campo as keyof CamposVeiculoParaConsulta]))
  }
  if (campo === 'ano') {
    return anoVeiculoConsideradoPreenchido(campos)
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
  origemCampos?: MetadadosOrigemCamposVeiculo
}): ConflitoCampoConsultaPlaca[] {
  const aplicaveis = filtrarCamposAplicaveisConsulta(
    opts.dados,
    opts.incluirCombustivel ?? false
  )
  const conflitos: ConflitoCampoConsultaPlaca[] = []

  for (const campo of CAMPOS_APLICAVEIS) {
    const novo = aplicaveis[campo]
    if (!novo) continue
    if (
      !campoVeiculoConsideradoPreenchido(
        campo,
        opts.camposAtuais,
        opts.modoFormulario,
        opts.origemCampos
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
  origemCampos?: MetadadosOrigemCamposVeiculo
}): PatchConsultaPlacaForm {
  const aplicaveis = filtrarCamposAplicaveisConsulta(
    opts.dados,
    opts.incluirCombustivel ?? false
  )
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
        opts.origemCampos
      )
    ) {
      aplicar.add(campo)
    }
  }

  if (aplicar.has('marca') && aplicaveis.marca) {
    patch.marca = aplicaveis.marca
  }
  if (aplicar.has('modelo') && aplicaveis.modelo) {
    patch.modelo = aplicaveis.modelo
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

/** Mensagem de bloqueio ao salvar — placa já cadastrada na oficina. */
export function mensagemBloqueioPlacaVeiculoExistente(
  info: {
    placa: string
    marca: string
    modelo: string
    clienteNome?: string
    clienteId?: string
  },
  rotuloVeiculo = 'veículo'
): string {
  const linhas = [
    `Já existe um ${rotuloVeiculo} com a placa ${info.placa.trim().toUpperCase()} (${info.marca} ${info.modelo}).`,
    'Não é possível cadastrar outro registro com a mesma placa nesta oficina.',
  ]
  if (info.clienteNome) {
    linhas.push(`Cliente vinculado: ${info.clienteNome}.`)
  }
  if (info.clienteId) {
    linhas.push('Abra o cadastro do cliente para ver ou editar o veículo existente.')
  }
  return linhas.join(' ')
}

export const MSG_BLOQUEIO_SALVAR_VERIFICACAO_PLACA_INCONCLUSIVA =
  'Não foi possível confirmar se esta placa já está cadastrada. A gravação foi bloqueada — tente novamente em instantes.'

function assertTesteMotoForm(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

/** Runner local da consulta por placa. Não altera os contratos de cadastro da main. */
export function executarTestesLocaisMotoFormConsultaPlaca(): void {
  const dadosSim = {
    placa: 'ZZZ9Z99',
    marca: 'MARCA SIM',
    modelo: 'MODELO SIM',
    ano: 2020,
    cor: 'Prata',
    fonte: 'simulacao_homolog' as const,
  }

  const vazio = formMotoClienteVazio()
  assertTesteMotoForm(anoInicialCadastroVeiculoNovo() === undefined, 'cadastro novo não sugere ano')
  assertTesteMotoForm(vazio.ano === undefined, 'novo carro e nova moto começam com ano vazio')
  assertTesteMotoForm(anoExibicaoCampoVeiculo(vazio.ano) === '', 'campo ano novo fica visualmente vazio')
  assertTesteMotoForm(vazio.marca === '' && vazio.placa === '', 'form vazio preservado')
  assertTesteMotoForm(validarFormMotoCliente(vazio) === null, 'form vazio não exige campos')
  assertTesteMotoForm(
    validarFormMotoCliente(
      { ...vazio, modelo: 'CG', placa: 'ABC1D23' },
      { artigoVeiculo: 'da moto' }
    ) === 'Informe a marca da moto.',
    'validação de marca preservada'
  )

  const patchVazio = montarAtualizacaoConsultaPlaca({
    formAtual: { marca: '', modelo: '', cor: '' },
    dados: dadosSim,
    modo: 'apenas_vazios',
    modoFormulario: 'novo',
  })
  assertTesteMotoForm(patchVazio.marca === 'MARCA SIM', 'marca preenchida em form vazio')
  assertTesteMotoForm(patchVazio.modelo === 'MODELO SIM', 'modelo preenchido em form vazio')
  assertTesteMotoForm(patchVazio.ano === 2020, 'ano preenchido em form vazio')
  assertTesteMotoForm(patchVazio.cor === 'Prata', 'cor preenchida em form vazio')
  assertTesteMotoForm(!('tipo_veiculo' in patchVazio), 'consulta não altera o tipo do veículo')

  const conflitoAno = detectarConflitosConsultaPlaca({
    camposAtuais: { marca: '', modelo: '', ano: 2018, cor: '' },
    dados: dadosSim,
    modoFormulario: 'novo',
    origemCampos: { ano: 'manual' },
  })
  assertTesteMotoForm(conflitoAno.length === 1 && conflitoAno[0]!.campo === 'ano', 'ano manual conflita')

  const semConflitoConsulta = detectarConflitosConsultaPlaca({
    camposAtuais: { marca: 'MARCA SIM', modelo: 'MODELO SIM', ano: 2020, cor: 'Prata' },
    dados: dadosSim,
    modoFormulario: 'novo',
    origemCampos: {
      marca: 'consulta_placa',
      modelo: 'consulta_placa',
      ano: 'consulta_placa',
      cor: 'consulta_placa',
    },
  })
  assertTesteMotoForm(semConflitoConsulta.length === 0, 'origem consulta não gera conflito igual')

  const meta = aplicarOrigemConsultaPlaca({}, { marca: 'X', modelo: 'Y', ano: 2020 })
  assertTesteMotoForm(meta.marca === 'consulta_placa' && meta.ano === 'consulta_placa', 'origem após patch')

  const conflitoModelo = detectarConflitosConsultaPlaca({
    camposAtuais: { marca: '', modelo: 'MANUAL', cor: '' },
    dados: dadosSim,
    modoFormulario: 'novo',
    origemCampos: { modelo: 'manual' },
  })
  assertTesteMotoForm(
    conflitoModelo.some((c) => c.campo === 'modelo'),
    'modelo manual conflita antes de aplicar'
  )

  const patchConfirmado = montarAtualizacaoConsultaPlaca({
    formAtual: { marca: 'OLD', modelo: 'OLD', ano: 2018, cor: '' },
    dados: dadosSim,
    modo: 'confirmado',
    modoFormulario: 'novo',
    origemCampos: { ano: 'manual' },
  })
  assertTesteMotoForm(patchConfirmado.ano === 2020, 'modo confirmado sobrescreve manual')
  assertTesteMotoForm(!('tipo_veiculo' in patchConfirmado), 'confirmação também não altera tipo')

  const patchSoMarca = montarAtualizacaoConsultaPlaca({
    formAtual: { marca: '', modelo: 'MANUAL', cor: '' },
    dados: dadosSim,
    modo: 'apenas_vazios',
    modoFormulario: 'novo',
    origemCampos: { modelo: 'manual' },
  })
  assertTesteMotoForm(patchSoMarca.marca === 'MARCA SIM', 'marca vazia preenchida')
  assertTesteMotoForm(patchSoMarca.modelo === undefined, 'modelo manual não entra no patch')

  const patchErroNaoAplicado = montarAtualizacaoConsultaPlaca({
    formAtual: { marca: 'FICA', modelo: 'FICA', ano: 2019, cor: 'Azul' },
    dados: { placa: 'ABC1D23', fonte: 'api_placas' },
    modo: 'confirmado',
    modoFormulario: 'edicao',
  })
  assertTesteMotoForm(
    Object.keys(patchErroNaoAplicado).length === 0,
    'resposta sem dados úteis não altera o formulário'
  )

  assertTesteMotoForm(
    snapshotCamposConsultaPlaca({ marca: 'A', ano: 2020 }) !==
      snapshotCamposConsultaPlaca({ marca: 'B', ano: 2020 }),
    'snapshot distingue alteração de campo'
  )

  const msgDup = mensagemBloqueioPlacaVeiculoExistente({
    placa: 'abc1d23',
    marca: 'M',
    modelo: 'X',
    clienteNome: 'João',
    clienteId: 'c1',
  })
  assertTesteMotoForm(msgDup.includes('ABC1D23') && msgDup.includes('João'), 'msg bloqueio placa')
  assertTesteMotoForm(
    MSG_BLOQUEIO_SALVAR_VERIFICACAO_PLACA_INCONCLUSIVA.includes('bloqueada'),
    'msg verificação inconclusiva'
  )

  const anoSistema = 2026
  const dados2001 = {
    placa: 'ABC1D23',
    marca: 'HONDA',
    modelo: 'CG',
    ano: 2001,
    cor: 'Preta',
    fonte: 'api_placas' as const,
  }
  const conflitoAnoPresente = detectarConflitosConsultaPlaca({
    camposAtuais: { marca: 'YAMAHA', modelo: '', ano: anoSistema, cor: '' },
    dados: { ...dados2001, marca: 'HONDA' },
    modoFormulario: 'novo',
    anoPadrao: anoSistema,
  })
  assertTesteMotoForm(
    conflitoAnoPresente.some((c) => c.campo === 'ano' && c.atual === '2026' && c.novo === '2001'),
    'ano presente diferente do retorno pede confirmação, mesmo no ano corrente'
  )
  const semSubstituirAnoPresente = montarAtualizacaoConsultaPlaca({
    formAtual: { marca: 'YAMAHA', modelo: '', ano: anoSistema, cor: '' },
    dados: dados2001,
    modo: 'apenas_vazios',
    modoFormulario: 'novo',
  })
  assertTesteMotoForm(
    semSubstituirAnoPresente.ano === undefined,
    'ano presente não é substituído sem autorização'
  )
  assertTesteMotoForm(
    conflitoAnoPresente.some((c) => c.campo === 'marca'),
    'marca informada continua pedindo confirmação'
  )

  const patchAnoVazio = montarAtualizacaoConsultaPlaca({
    formAtual: { marca: '', modelo: '', cor: '' },
    dados: dados2001,
    modo: 'apenas_vazios',
    modoFormulario: 'novo',
    anoPadrao: anoSistema,
  })
  assertTesteMotoForm(patchAnoVazio.ano === 2001, 'consulta preenche ano vazio sem confirmação')

  const conflitoAnoDigitado = detectarConflitosConsultaPlaca({
    camposAtuais: { marca: '', modelo: '', ano: anoSistema, cor: '' },
    dados: dados2001,
    modoFormulario: 'novo',
    anoPadrao: anoSistema,
    origemCampos: { ano: 'manual' },
  })
  assertTesteMotoForm(
    conflitoAnoDigitado.length === 1 &&
      conflitoAnoDigitado[0]!.campo === 'ano' &&
      conflitoAnoDigitado[0]!.atual === '2026' &&
      conflitoAnoDigitado[0]!.novo === '2001',
    'ano digitado diferente exige confirmação'
  )
  const patchAnoDigitado = montarAtualizacaoConsultaPlaca({
    formAtual: { marca: '', modelo: '', ano: anoSistema, cor: '' },
    dados: dados2001,
    modo: 'apenas_vazios',
    modoFormulario: 'novo',
    anoPadrao: anoSistema,
    origemCampos: { ano: 'manual' },
  })
  assertTesteMotoForm(patchAnoDigitado.ano === undefined, 'ano digitado não é substituído sem confirmação')

  const formEdicao = { marca: 'HONDA', modelo: 'CG', ano: 2001, cor: 'Preta' }
  assertTesteMotoForm(formEdicao.ano === 2001, 'edição preserva o ano salvo')
  const patchEdicao = montarAtualizacaoConsultaPlaca({
    formAtual: formEdicao,
    dados: { ...dados2001, ano: 2010, marca: 'YAMAHA', modelo: 'FAZER', cor: 'Azul' },
    modo: 'apenas_vazios',
    modoFormulario: 'edicao',
  })
  assertTesteMotoForm(
    patchEdicao.ano === undefined && patchEdicao.marca === undefined,
    'edição não sobrescreve valores sem consentimento'
  )
  const conflitosEdicao = detectarConflitosConsultaPlaca({
    camposAtuais: formEdicao,
    dados: { ...dados2001, ano: 2010, marca: 'YAMAHA' },
    modoFormulario: 'edicao',
  })
  assertTesteMotoForm(
    conflitosEdicao.some((c) => c.campo === 'ano' && c.atual === '2001' && c.novo === '2010'),
    'edição pede confirmação quando o ano retornado é outro'
  )

  assertTesteMotoForm(parseAnoCampoVeiculo('') === undefined, 'string vazia não vira número')
  assertTesteMotoForm(parseAnoCampoVeiculo('2001') === 2001, 'digitação de ano válida')
  assertTesteMotoForm(parseAnoCampoVeiculo('20.01') === undefined, 'decimal não é convertido')
  assertTesteMotoForm(anoExibicaoCampoVeiculo(2001) === '2001', 'edição exibe o ano salvo')

  const manual = { ...vazio, marca: 'Honda', modelo: 'CG', placa: 'ABC1D23', ano: 2015 }
  assertTesteMotoForm(validarFormMotoCliente(manual) === null, 'cadastro manual com ano válido')
  const semAno = { ...vazio, marca: 'Honda', modelo: 'CG', placa: 'ABC1D23' }
  const erroSemAno = validarFormMotoCliente(semAno)
  assertTesteMotoForm(
    erroSemAno !== null && erroSemAno.includes('ano'),
    'ano ausente não passa na validação'
  )
  assertTesteMotoForm(
    validarFormMotoCliente({ ...manual, ano: Number.NaN })?.includes('ano') === true,
    'NaN não é aceito'
  )
  assertTesteMotoForm(
    validarFormMotoCliente({ ...manual, ano: 1899 })?.includes('ano') === true,
    'ano abaixo de 1900 não é aceito'
  )
  assertTesteMotoForm(
    validarFormMotoCliente({ ...manual, ano: 2101 })?.includes('ano') === true,
    'ano acima de 2100 não é aceito'
  )
  let recusouAnoVazio = false
  try {
    formMotoClienteParaInput(semAno, 'cliente-1')
  } catch (erro) {
    recusouAnoVazio = erro instanceof Error && erro.message === 'Ano do veículo inválido.'
  }
  assertTesteMotoForm(recusouAnoVazio, 'persistência não recebe ano vazio')
  assertTesteMotoForm(
    formMotoClienteParaInput(manual, 'cliente-1').ano === 2015,
    'persistência mantém o ano informado'
  )

  const dadosPlacaB = {
    placa: 'BBB1B11',
    marca: 'FIAT',
    modelo: 'UNO',
    ano: 2001,
    cor: 'Branca',
    fonte: 'api_placas' as const,
  }

  const vazioNovo = formMotoClienteVazio()
  assertTesteMotoForm(vazioNovo.ano === undefined, 'I. cadastro novo, inclusive mista, começa sem ano')
  const conflitosVazio = detectarConflitosConsultaPlaca({
    camposAtuais: { ano: vazioNovo.ano },
    dados: dados2001,
    modoFormulario: 'novo',
  })
  assertTesteMotoForm(
    !conflitosVazio.some((c) => c.campo === 'ano'),
    'A. ano vazio não conflita'
  )
  assertTesteMotoForm(
    montarAtualizacaoConsultaPlaca({
      formAtual: { ano: vazioNovo.ano },
      dados: dados2001,
      modo: 'apenas_vazios',
      modoFormulario: 'novo',
    }).ano === 2001,
    'A. ano vazio recebe 2001'
  )

  let origemManual2026 = registrarOrigemManualCampo(metadadosOrigemCamposInicial(), 'ano')
  origemManual2026 = limparOrigensConsultaAoTrocarPlaca(origemManual2026)
  assertTesteMotoForm(origemManual2026.ano === 'manual', 'B. origem manual sobrevive à placa')
  const conflitosManual2026 = detectarConflitosConsultaPlaca({
    camposAtuais: { ano: 2026 },
    dados: dadosPlacaB,
    modoFormulario: 'novo',
    origemCampos: origemManual2026,
  })
  assertTesteMotoForm(
    conflitosManual2026.some((c) => c.campo === 'ano'),
    'B. ano manual 2026 contra 2001 exige confirmação'
  )
  assertTesteMotoForm(
    montarAtualizacaoConsultaPlaca({
      formAtual: { ano: 2026 },
      dados: dadosPlacaB,
      modo: 'apenas_vazios',
      modoFormulario: 'novo',
      origemCampos: origemManual2026,
    }).ano === undefined,
    'F. sem autorização o ano anterior permanece'
  )
  assertTesteMotoForm(
    montarAtualizacaoConsultaPlaca({
      formAtual: { ano: 2026 },
      dados: dadosPlacaB,
      modo: 'confirmado',
      modoFormulario: 'novo',
      origemCampos: origemManual2026,
    }).ano === 2001,
    'G. com autorização o ano passa ao novo valor'
  )

  const origemConsulta2026 = limparOrigensConsultaAoTrocarPlaca(
    aplicarOrigemConsultaPlaca({}, { ano: 2026 })
  )
  assertTesteMotoForm(
    origemConsulta2026.ano === undefined,
    'C. troca de placa limpa a origem da consulta'
  )
  assertTesteMotoForm(
    detectarConflitosConsultaPlaca({
      camposAtuais: { ano: 2026 },
      dados: dadosPlacaB,
      modoFormulario: 'novo',
      origemCampos: origemConsulta2026,
    }).some((c) => c.campo === 'ano' && c.atual === '2026' && c.novo === '2001'),
    'C. ano 2026 vindo da consulta anterior não é substituído sem confirmação'
  )
  assertTesteMotoForm(
    montarAtualizacaoConsultaPlaca({
      formAtual: { ano: 2026 },
      dados: dadosPlacaB,
      modo: 'apenas_vazios',
      modoFormulario: 'novo',
      origemCampos: origemConsulta2026,
    }).ano === undefined,
    'C. sem autorização o 2026 da consulta anterior permanece'
  )

  const origemConsulta2015 = limparOrigensConsultaAoTrocarPlaca(
    aplicarOrigemConsultaPlaca({}, { ano: 2015 })
  )
  assertTesteMotoForm(
    detectarConflitosConsultaPlaca({
      camposAtuais: { ano: 2015 },
      dados: dadosPlacaB,
      modoFormulario: 'novo',
      origemCampos: origemConsulta2015,
    }).some((c) => c.campo === 'ano'),
    'D. ano 2015 da consulta anterior também exige confirmação'
  )

  assertTesteMotoForm(
    !detectarConflitosConsultaPlaca({
      camposAtuais: { ano: 2001 },
      dados: dados2001,
      modoFormulario: 'novo',
    }).some((c) => c.campo === 'ano'),
    'E. ano já igual ao retorno não gera conflito'
  )

  assertTesteMotoForm(
    montarAtualizacaoConsultaPlaca({
      formAtual: { marca: 'HONDA', modelo: 'CG', ano: 2001, cor: 'Preta' },
      dados: { ...dados2001, ano: 1990 },
      modo: 'apenas_vazios',
      modoFormulario: 'edicao',
    }).ano === undefined,
    'H. edição protege o ano salvo'
  )
}
