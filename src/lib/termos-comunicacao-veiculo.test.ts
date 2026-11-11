/**
 * Testes locais — Etapa 5E.36
 * npx vite-node --config vite.config.ts scripts/test-termos-comunicacao-veiculo.ts
 */

import { substituirVariaveisMensagem } from '@/lib/substituir-variaveis-mensagem'
import { montarVariaveisMensagemCliente } from '@/lib/mensagem-agendada-helpers'
import { montarMensagemEnvioCliente } from '@/lib/whatsapp-os-mensagem'
import { montarMensagemLembrete, montarVarsLembrete } from '@/services/lembretes/lembretes.service'
import { resolverModelosMensagemOficina } from '@/services/comunicacao/mensagens-prontas.service'
import {
  MODELOS_MENSAGEM_PADRAO,
  montarMensagem,
} from '@/services/comunicacao/comunicacao.service'
import {
  obterTermosComunicacaoDeMoto,
  obterTermosComunicacaoVeiculo,
  resolverTipoVeiculoRegistro,
} from '@/lib/termos-oficina'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { Moto } from '@/types/moto'
import type { Cliente } from '@/types/cliente'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

const PREP_DUPLICADA = /\b(do da|do do|da da|da do)\b/i

function assertSemPrepDuplicada(texto: string, contexto: string): void {
  assert(!PREP_DUPLICADA.test(texto), `preposição duplicada em ${contexto}: ${texto}`)
}

function motoStub(tipo?: Moto['tipo_veiculo']): Moto {
  return {
    id: 'm1',
    oficina_id: 'o1',
    office_id: 'o1',
    cliente_id: 'c1',
    tipo_veiculo: tipo,
    marca: 'Honda',
    modelo: 'CG',
    ano: 2020,
    placa: 'ABC1D23',
    cor: 'Preta',
    quilometragem: 1000,
    criado_em: '2026-01-01',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  }
}

const cliente: Cliente = {
  id: 'c1',
  oficina_id: 'o1',
  office_id: 'o1',
  nome: 'João',
  telefone: '31999999999',
  endereco: '',
  criado_em: '2026-01-01',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
}

const configCarros: ConfiguracaoOficina = {
  nome: 'Oficina Carros',
  tipo_oficina: 'carros',
} as ConfiguracaoOficina

const configMotos: ConfiguracaoOficina = {
  nome: 'Oficina Motos',
  tipo_oficina: 'motos',
} as ConfiguracaoOficina

const configMista: ConfiguracaoOficina = {
  nome: 'Oficina Mista',
  tipo_oficina: 'mista',
} as ConfiguracaoOficina

export function executarTestesTermosComunicacaoVeiculo(): void {
  // 1–2 segmento + tipo explícito
  assert(
    obterTermosComunicacaoDeMoto(motoStub('carro')).possessivoVeiculo === 'seu carro',
    'oficina carros + carro'
  )
  assert(
    obterTermosComunicacaoDeMoto(motoStub('moto')).possessivoVeiculo === 'sua moto',
    'oficina motos + moto'
  )

  // 3–4 mista + tipo
  assert(
    obterTermosComunicacaoDeMoto(motoStub('carro')).possessivoVeiculo === 'seu carro',
    'mista + carro'
  )
  assert(
    obterTermosComunicacaoDeMoto(motoStub('moto')).possessivoVeiculo === 'sua moto',
    'mista + moto'
  )

  // 5 mista + desconhecido
  assert(
    obterTermosComunicacaoDeMoto(motoStub(undefined)).possessivoVeiculo === 'seu veículo',
    'mista + tipo desconhecido'
  )

  // 6–7 legado explícito no registro
  assert(
    obterTermosComunicacaoDeMoto(motoStub('moto')).possessivoVeiculo === 'sua moto',
    'carros + legado moto'
  )
  assert(
    obterTermosComunicacaoDeMoto(motoStub('carro')).possessivoVeiculo === 'seu carro',
    'motos + legado carro'
  )

  // 8–9 caminhonete / outro
  assert(
    obterTermosComunicacaoDeMoto(motoStub('caminhonete')).possessivoVeiculo ===
      'sua caminhonete',
    'caminhonete'
  )
  assert(
    obterTermosComunicacaoDeMoto(motoStub('outro')).possessivoVeiculo === 'seu veículo',
    'outro neutro'
  )

  // 10 mensagem pronta padrão (vars com veículo carro em oficina motos)
  const varsCarro = montarVariaveisMensagemCliente({
    cliente,
    configuracao: configMotos,
    moto: motoStub('carro'),
  })
  const textoPadrao = montarMensagem('moto_pronta_retirada', varsCarro, configMotos)
  assert(textoPadrao.includes('seu carro'), 'mensagem pronta usa termos do veículo')

  // 11–16 personalizado + placeholder + lembrete + sem veículo
  const customCorpo = 'Olá! Sua moto favorita {{moto}} permanece assim.'
  const configCustom: ConfiguracaoOficina = {
    ...configCarros,
    mensagens_prontas: [{ tipo: 'moto_pronta_retirada', label: 'Custom', corpo: customCorpo }],
  }
  const resolvido = resolverModelosMensagemOficina(configCustom)
  const custom = resolvido.find((m) => m.tipo === 'moto_pronta_retirada')
  assert(custom?.corpo === customCorpo, 'mensagem personalizada preservada literal')

  const varsPlaceholder = { ...varsCarro, moto: 'GM Astra' }
  const comPlaceholder = substituirVariaveisMensagem('Modelo: {{moto}}', varsPlaceholder)
  assert(comPlaceholder.includes('GM Astra') && !comPlaceholder.includes('{{'), 'placeholder {{moto}}')

  const varsLembreteMoto = montarVarsLembrete(
    'Maria',
    motoStub('moto'),
    'Óleo',
    '2026-12-01',
    3000,
    'Oficina X',
    undefined
  )
  assert(varsLembreteMoto.possessivo_veiculo === 'sua moto', 'lembrete OS moto')

  const varsLembreteCarro = montarVarsLembrete(
    'Maria',
    motoStub('carro'),
    'Óleo',
    '2026-12-01',
    3000,
    'Oficina X',
    undefined
  )
  assert(varsLembreteCarro.possessivo_veiculo === 'seu carro', 'lembrete OS carro')

  const varsSemVeiculo = montarVariaveisMensagemCliente({
    cliente,
    configuracao: configMista,
  })
  assert(
    varsSemVeiculo.referencia_veiculo?.includes('veículo') === true,
    'sem veículo neutro'
  )

  const waCarro = montarMensagemEnvioCliente({
    tipo: 'veiculo_pronto',
    nomeCliente: 'Ana',
    veiculoLabel: 'Chevrolet Onix',
    placa: '',
    moto: motoStub('carro'),
  })
  assert(
    waCarro.includes('Seu carro Chevrolet Onix está pronto para retirada'),
    'whatsapp carro concordância'
  )
  assert(!waCarro.includes('Do seu carro'), 'whatsapp carro sem prep. errada')

  const waMoto = montarMensagemEnvioCliente({
    tipo: 'veiculo_pronto',
    nomeCliente: 'Ana',
    veiculoLabel: 'Honda CG 160',
    placa: '',
    moto: motoStub('moto'),
  })
  assert(
    waMoto.includes('Sua moto Honda CG 160 está pronta para retirada'),
    'whatsapp moto concordância'
  )
  assert(!waMoto.includes('Da sua moto'), 'whatsapp moto sem prep. errada')

  const waCam = montarMensagemEnvioCliente({
    tipo: 'veiculo_pronto',
    nomeCliente: 'Ana',
    veiculoLabel: 'S10',
    placa: '',
    moto: motoStub('caminhonete'),
  })
  assert(waCam.includes('está pronta para retirada'), 'whatsapp caminhonete pronta')

  const waNeutro = montarMensagemEnvioCliente({
    tipo: 'veiculo_pronto',
    nomeCliente: 'Ana',
    veiculoLabel: 'Modelo X',
    placa: '',
    moto: motoStub(undefined),
  })
  assert(waNeutro.includes('Seu veículo Modelo X está pronto para retirada'), 'whatsapp tipo ausente')

  const msgRetiradaMoto = montarMensagem(
    'moto_pronta_retirada',
    montarVariaveisMensagemCliente({
      cliente,
      configuracao: configMista,
      moto: motoStub('moto'),
    }),
    configMista
  )
  assert(
    msgRetiradaMoto.includes('pronta para retirada') && !msgRetiradaMoto.includes('pronto(a)'),
    'modelo pronta retirada moto'
  )
  const msgRetiradaCarro = montarMensagem(
    'moto_pronta_retirada',
    montarVariaveisMensagemCliente({
      cliente,
      configuracao: configMista,
      moto: motoStub('carro'),
    }),
    configMista
  )
  assert(msgRetiradaCarro.includes('está pronto para retirada'), 'modelo pronta retirada carro')

  const waOsMoto = montarMensagemEnvioCliente({
    tipo: 'os',
    nomeCliente: 'Ana',
    veiculoLabel: 'Honda CG 160',
    placa: 'ABC1D23',
    moto: motoStub('moto'),
  })
  assert(
    waOsMoto.includes('ordem de serviço da sua moto Honda CG 160'),
    'whatsapp OS moto'
  )
  assertSemPrepDuplicada(waOsMoto, 'OS moto')

  const waOsCarro = montarMensagemEnvioCliente({
    tipo: 'os',
    nomeCliente: 'Ana',
    veiculoLabel: 'Chevrolet Onix',
    placa: '',
    moto: motoStub('carro'),
  })
  assert(
    waOsCarro.includes('ordem de serviço do seu carro Chevrolet Onix'),
    'whatsapp OS carro'
  )
  assertSemPrepDuplicada(waOsCarro, 'OS carro')

  const waOsCam = montarMensagemEnvioCliente({
    tipo: 'os',
    nomeCliente: 'Ana',
    veiculoLabel: 'S10',
    placa: '',
    moto: motoStub('caminhonete'),
  })
  assert(waOsCam.includes('ordem de serviço da sua caminhonete S10'), 'whatsapp OS caminhonete')
  assertSemPrepDuplicada(waOsCam, 'OS caminhonete')

  const waOsNeutro = montarMensagemEnvioCliente({
    tipo: 'os',
    nomeCliente: 'Ana',
    veiculoLabel: 'Modelo X',
    placa: '',
    moto: motoStub(undefined),
  })
  assert(waOsNeutro.includes('ordem de serviço do seu veículo Modelo X'), 'whatsapp OS desconhecido')
  assertSemPrepDuplicada(waOsNeutro, 'OS desconhecido')

  const waOrcCarro = montarMensagemEnvioCliente({
    tipo: 'orcamento',
    nomeCliente: 'Ana',
    veiculoLabel: 'Onix',
    placa: '',
    moto: motoStub('carro'),
  })
  assert(waOrcCarro.includes('orçamento do seu carro Onix'), 'whatsapp orçamento carro')
  assertSemPrepDuplicada(waOrcCarro, 'orçamento carro')

  const waOrcMoto = montarMensagemEnvioCliente({
    tipo: 'orcamento',
    nomeCliente: 'Ana',
    veiculoLabel: 'CG 160',
    placa: '',
    moto: motoStub('moto'),
  })
  assert(waOrcMoto.includes('orçamento da sua moto CG 160'), 'whatsapp orçamento moto')
  assertSemPrepDuplicada(waOrcMoto, 'orçamento moto')

  const waAcompCarro = montarMensagemEnvioCliente({
    tipo: 'acompanhamento',
    nomeCliente: 'Ana',
    veiculoLabel: 'Onix',
    linkAprovacao: 'https://exemplo.test/l',
    moto: motoStub('carro'),
    nomeOficina: 'Oficina',
    numero: 1,
  })
  assert(waAcompCarro.includes('andamento do serviço do seu carro Onix'), 'whatsapp acompanhamento carro')
  assertSemPrepDuplicada(waAcompCarro, 'acompanhamento carro')

  const waAcompMoto = montarMensagemEnvioCliente({
    tipo: 'acompanhamento',
    nomeCliente: 'Ana',
    veiculoLabel: 'CG',
    linkAprovacao: 'https://exemplo.test/l',
    moto: motoStub('moto'),
    nomeOficina: 'Oficina',
    numero: 1,
  })
  assert(waAcompMoto.includes('andamento do serviço da sua moto CG'), 'whatsapp acompanhamento moto')
  assertSemPrepDuplicada(waAcompMoto, 'acompanhamento moto')

  for (const modelo of MODELOS_MENSAGEM_PADRAO) {
    for (const tipoVeiculo of ['moto', 'carro', 'caminhonete', undefined] as const) {
      const vars = montarVariaveisMensagemCliente({
        cliente,
        configuracao: configMista,
        moto: motoStub(tipoVeiculo),
      })
      const msg = substituirVariaveisMensagem(modelo.corpo, vars)
      assertSemPrepDuplicada(msg, `modelo padrão ${modelo.tipo} (${tipoVeiculo ?? 'ausente'})`)
    }
  }

  assertSemPrepDuplicada(waCarro, 'veículo pronto carro')
  assertSemPrepDuplicada(waMoto, 'veículo pronto moto')
  assertSemPrepDuplicada(msgRetiradaMoto, 'agendada pronta retirada moto')
  assertSemPrepDuplicada(msgRetiradaCarro, 'agendada pronta retirada carro')

  assert(resolverTipoVeiculoRegistro(motoStub()) === undefined, 'sem tipo explícito')

  const regra = 'Troca {{artigo_possessivo_veiculo}} {{moto}}'
  const msgRegra = montarMensagemLembrete(regra, varsLembreteCarro)
  assert(msgRegra.includes('do seu carro'), 'regra lembrete carro artigo')
  assertSemPrepDuplicada(msgRegra, 'lembrete óleo carro')

  const varsLembreteMotoOil = montarVarsLembrete(
    'Maria',
    motoStub('moto'),
    'Óleo',
    '2026-12-01',
    3000,
    'Oficina X',
    undefined
  )
  const msgRegraMoto = montarMensagemLembrete(regra, varsLembreteMotoOil)
  assert(msgRegraMoto.includes('da sua moto'), 'regra lembrete moto artigo')
  assertSemPrepDuplicada(msgRegraMoto, 'lembrete óleo moto')

  assert(
    obterTermosComunicacaoVeiculo(undefined, { veiculoAssociado: false }).possessivoVeiculo ===
      'seu veículo',
    'comunicação sem veículo'
  )

  console.log('termos-comunicacao-veiculo: cenários OK (5E.36 + 5E.44 + 5E.44.1)')
}
