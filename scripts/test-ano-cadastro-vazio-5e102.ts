/**
 * Regressão local do Ano vazio e da origem manual ao trocar a placa.
 * A sequência usa as mesmas funções do formulário: digitação, troca de placa e consulta.
 * Não consulta fornecedor, não usa rede e não grava veículo.
 *
 * Executar: npx tsx --tsconfig tsconfig.app.json scripts/test-ano-cadastro-vazio-5e102.ts
 */
import {
  anoExibicaoCampoVeiculo,
  anoInicialCadastroVeiculoNovo,
  aplicarOrigemConsultaPlaca,
  detectarConflitosConsultaPlaca,
  executarTestesLocaisMotoFormConsultaPlaca,
  formMotoClienteParaInput,
  formMotoClienteVazio,
  limparOrigensConsultaAoTrocarPlaca,
  metadadosOrigemCamposInicial,
  montarAtualizacaoConsultaPlaca,
  registrarOrigemManualCampo,
  resetarOrigemConsultaPlaca,
  validarFormMotoCliente,
  type FormMotoCliente,
  type MetadadosOrigemCamposVeiculo,
} from '../src/lib/moto-form.ts'
import type { DadosBasicosVeiculoConsulta } from '../src/services/veiculos/vehicle-plate-lookup.service.ts'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

const ANO_CORRENTE = 2026

function retornoConsulta(ano: number, marca = 'HONDA', modelo = 'CG'): DadosBasicosVeiculoConsulta {
  return {
    placa: 'ABC1D23',
    marca,
    modelo,
    ano,
    cor: 'Preta',
    fonte: 'api_placas',
  }
}

/** Mesma transição do efeito de placa: só a origem muda; os demais campos ficam. */
function alterarPlaca(
  form: FormMotoCliente,
  origem: MetadadosOrigemCamposVeiculo,
  placa: string
): { form: FormMotoCliente; origem: MetadadosOrigemCamposVeiculo } {
  return {
    form: { ...form, placa },
    origem: limparOrigensConsultaAoTrocarPlaca(origem),
  }
}

function conflitosDe(
  form: FormMotoCliente,
  origem: MetadadosOrigemCamposVeiculo,
  dados: DadosBasicosVeiculoConsulta,
  modoFormulario: 'novo' | 'edicao' = 'novo'
) {
  return detectarConflitosConsultaPlaca({
    camposAtuais: {
      marca: form.marca,
      modelo: form.modelo,
      ano: form.ano,
      cor: form.cor,
    },
    dados,
    modoFormulario,
    anoPadrao: ANO_CORRENTE,
    origemCampos: origem,
  })
}

function patchDe(
  form: FormMotoCliente,
  origem: MetadadosOrigemCamposVeiculo,
  dados: DadosBasicosVeiculoConsulta,
  modo: 'apenas_vazios' | 'confirmado',
  modoFormulario: 'novo' | 'edicao' = 'novo'
) {
  return montarAtualizacaoConsultaPlaca({
    formAtual: {
      marca: form.marca,
      modelo: form.modelo,
      ano: form.ano,
      cor: form.cor,
    },
    dados,
    modo,
    modoFormulario,
    anoPadrao: ANO_CORRENTE,
    origemCampos: origem,
  })
}

executarTestesLocaisMotoFormConsultaPlaca()
console.log('runner moto-form: OK')

for (const tipo of ['carro', 'moto', 'mista']) {
  assert(anoInicialCadastroVeiculoNovo() === undefined, `cadastro ${tipo} começa com ano vazio`)
}
assert(formMotoClienteVazio().ano === undefined, 'cadastro conjunto começa com ano vazio')
assert(anoExibicaoCampoVeiculo(undefined) === '', 'campo novo fica visualmente vazio')
assert(
  Object.keys(resetarOrigemConsultaPlaca()).length === 0,
  'abrir novo ou edição zera as origens'
)

// A–H. Ano 2026 digitado, depois a placa, depois retorno 2001.
let form = formMotoClienteVazio()
let origem = metadadosOrigemCamposInicial()
assert(form.ano === undefined && form.placa === '', 'A. cadastro novo vazio')

form = { ...form, ano: ANO_CORRENTE }
origem = registrarOrigemManualCampo(origem, 'ano')
assert(origem.ano === 'manual' && form.ano === ANO_CORRENTE, 'B. ano 2026 fica manual')

const antesDaPlaca = { ...form }
const troca = alterarPlaca(form, origem, 'ABC1D23')
form = troca.form
origem = troca.origem
assert(origem.ano === 'manual', 'D. origem manual do ano sobrevive à placa')
assert(form.ano === ANO_CORRENTE, 'D. ano digitado não é apagado pela placa')
assert(form.marca === antesDaPlaca.marca && form.modelo === antesDaPlaca.modelo, 'placa não altera os outros campos')

const dados2001 = retornoConsulta(2001)
const conflitos2026 = conflitosDe(form, origem, dados2001)
assert(
  conflitos2026.some((c) => c.campo === 'ano' && c.atual === '2026' && c.novo === '2001'),
  'F. 2026 manual contra 2001 exige confirmação'
)
const semAutorizacao = patchDe(form, origem, dados2001, 'apenas_vazios')
assert(semAutorizacao.ano === undefined && form.ano === ANO_CORRENTE, 'G. sem autorização o ano permanece 2026')
const comAutorizacao = patchDe(form, origem, dados2001, 'confirmado')
assert(comAutorizacao.ano === 2001, 'H. com autorização o ano pode passar a 2001')
assert(form.ano === ANO_CORRENTE, 'a consulta não grava nem altera o formulário sozinha')

// Ano vazio + placa + 2001 preenche sem confirmação.
let vazio = formMotoClienteVazio()
let origemVazia = metadadosOrigemCamposInicial()
const vazioComPlaca = alterarPlaca(vazio, origemVazia, 'ABC1D23')
vazio = vazioComPlaca.form
origemVazia = vazioComPlaca.origem
assert(
  !conflitosDe(vazio, origemVazia, dados2001).some((c) => c.campo === 'ano'),
  'ano vazio não pede confirmação'
)
assert(patchDe(vazio, origemVazia, dados2001, 'apenas_vazios').ano === 2001, 'ano vazio recebe 2001')

// Ano manual 2015 + placa + 2001 pede confirmação e não substitui sem ela.
let manual2015 = { ...formMotoClienteVazio(), ano: 2015 }
let origem2015 = registrarOrigemManualCampo(metadadosOrigemCamposInicial(), 'ano')
const troca2015 = alterarPlaca(manual2015, origem2015, 'ABC1D23')
manual2015 = troca2015.form
origem2015 = troca2015.origem
assert(origem2015.ano === 'manual', 'ano 2015 manual sobrevive à placa')
assert(
  conflitosDe(manual2015, origem2015, dados2001).some((c) => c.campo === 'ano'),
  'ano 2015 contra 2001 pede confirmação'
)
assert(
  patchDe(manual2015, origem2015, dados2001, 'apenas_vazios').ano === undefined,
  'ano 2015 não é substituído sem autorização'
)

// Ano manual igual ao retorno não pede confirmação.
let igual = { ...formMotoClienteVazio(), ano: 2001 }
let origemIgual = registrarOrigemManualCampo(metadadosOrigemCamposInicial(), 'ano')
const trocaIgual = alterarPlaca(igual, origemIgual, 'ABC1D23')
igual = trocaIgual.form
origemIgual = trocaIgual.origem
assert(
  !conflitosDe(igual, origemIgual, dados2001).some((c) => c.campo === 'ano'),
  'ano manual igual ao retorno não gera conflito'
)
assert(patchDe(igual, origemIgual, dados2001, 'apenas_vazios').ano === undefined, 'ano igual não entra no patch')

// Consulta anterior: trocar a placa limpa só origens de consulta.
const aposConsulta = aplicarOrigemConsultaPlaca(
  {
    marca: 'manual',
    cor: 'manual',
  },
  { modelo: 'FAZER', ano: 1998 }
)
assert(aposConsulta.modelo === 'consulta_placa' && aposConsulta.ano === 'consulta_placa', 'consulta marca a origem')
assert(aposConsulta.marca === 'manual' && aposConsulta.cor === 'manual', 'manual convive com a consulta')
const aposTroca = limparOrigensConsultaAoTrocarPlaca(aposConsulta)
assert(aposTroca.marca === 'manual' && aposTroca.cor === 'manual', 'manuais sobrevivem à troca')
assert(aposTroca.modelo === undefined && aposTroca.ano === undefined, 'origens de consulta são removidas')
assert(aposConsulta.ano === 'consulta_placa', 'a limpeza não altera o estado anterior')

const formConsultaAntiga: FormMotoCliente = {
  ...formMotoClienteVazio(),
  marca: 'YAMAHA',
  modelo: 'FAZER',
  ano: 1998,
  cor: 'Azul',
  placa: 'ABC1D23',
}
assert(
  conflitosDe(formConsultaAntiga, aposTroca, retornoConsulta(2010, 'HONDA', 'CG')).some(
    (c) => c.campo === 'ano' && c.atual === '1998' && c.novo === '2010'
  ),
  'ano deixado pela consulta anterior não segue ligado à placa nova'
)

// Edição preserva o ano salvo e não o substitui sem autorização.
const origemEdicao = resetarOrigemConsultaPlaca()
const edicao: FormMotoCliente = {
  ...formMotoClienteVazio(),
  marca: 'HONDA',
  modelo: 'CG',
  ano: 2001,
  cor: 'Preta',
  placa: 'ABC1D23',
}
assert(edicao.ano === 2001 && Object.keys(origemEdicao).length === 0, 'edição abre com o ano salvo')
assert(
  conflitosDe(edicao, origemEdicao, retornoConsulta(2010), 'edicao').some((c) => c.campo === 'ano'),
  'edição pede confirmação se o retorno difere'
)
assert(
  patchDe(edicao, origemEdicao, retornoConsulta(2010), 'apenas_vazios', 'edicao').ano === undefined,
  'edição não substitui o ano sem autorização'
)

// Marca, modelo e cor manuais também sobrevivem à placa e pedem confirmação.
let camposManuais: FormMotoCliente = {
  ...formMotoClienteVazio(),
  marca: 'YAMAHA',
  modelo: 'FAZER',
  cor: 'Azul',
}
let origemManuais = metadadosOrigemCamposInicial()
origemManuais = registrarOrigemManualCampo(origemManuais, 'marca')
origemManuais = registrarOrigemManualCampo(origemManuais, 'modelo')
origemManuais = registrarOrigemManualCampo(origemManuais, 'cor')
const trocaManuais = alterarPlaca(camposManuais, origemManuais, 'ABC1D23')
camposManuais = trocaManuais.form
origemManuais = trocaManuais.origem
assert(
  origemManuais.marca === 'manual' &&
    origemManuais.modelo === 'manual' &&
    origemManuais.cor === 'manual',
  'marca, modelo e cor manuais sobrevivem à placa'
)
const conflitosManuais = conflitosDe(camposManuais, origemManuais, dados2001)
assert(conflitosManuais.some((c) => c.campo === 'marca'), 'marca manual pede confirmação')
assert(conflitosManuais.some((c) => c.campo === 'modelo'), 'modelo manual pede confirmação')
assert(conflitosManuais.some((c) => c.campo === 'cor'), 'cor manual pede confirmação')
const patchManuais = patchDe(camposManuais, origemManuais, dados2001, 'apenas_vazios')
assert(
  patchManuais.marca === undefined &&
    patchManuais.modelo === undefined &&
    patchManuais.cor === undefined,
  'campos manuais não são substituídos sem autorização'
)

// Ano ausente ou inválido não chega à gravação.
const semAno = { ...formMotoClienteVazio(), marca: 'Honda', modelo: 'CG', placa: 'ABC1D23' }
assert(validarFormMotoCliente(semAno)?.includes('ano') === true, 'ano ausente bloqueia o salvamento')
assert(
  validarFormMotoCliente({ ...semAno, ano: Number.NaN })?.includes('ano') === true,
  'NaN bloqueia o salvamento'
)
assert(
  validarFormMotoCliente({ ...semAno, ano: 1899 })?.includes('ano') === true,
  'ano abaixo de 1900 bloqueia o salvamento'
)
assert(
  validarFormMotoCliente({ ...semAno, ano: 2101 })?.includes('ano') === true,
  'ano acima de 2100 bloqueia o salvamento'
)
const manualValido = { ...semAno, ano: 2015 }
assert(validarFormMotoCliente(manualValido) === null, 'ano válido continua aceito')
assert(formMotoClienteParaInput(manualValido, 'cliente-1').ano === 2015, 'gravação mantém o ano válido')
let recusou = false
try {
  formMotoClienteParaInput(semAno, 'cliente-1')
} catch (erro) {
  recusou = erro instanceof Error && erro.message === 'Ano do veículo inválido.'
}
assert(recusou, 'persistência recusa ano ausente')

console.log('5e104 origem manual preservada: OK')
