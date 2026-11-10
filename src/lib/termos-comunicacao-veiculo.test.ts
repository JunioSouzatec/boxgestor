/**
 * Testes locais — Etapa 5E.36
 * npx vite-node --config vite.config.ts scripts/test-termos-comunicacao-veiculo.ts
 */

import { substituirVariaveisMensagem } from '@/lib/substituir-variaveis-mensagem'
import { montarVariaveisMensagemCliente } from '@/lib/mensagem-agendada-helpers'
import { montarMensagemEnvioCliente } from '@/lib/whatsapp-os-mensagem'
import { montarMensagemLembrete, montarVarsLembrete } from '@/services/lembretes/lembretes.service'
import { resolverModelosMensagemOficina } from '@/services/comunicacao/mensagens-prontas.service'
import { montarMensagem } from '@/services/comunicacao/comunicacao.service'
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

  const wa = montarMensagemEnvioCliente({
    tipo: 'veiculo_pronto',
    nomeCliente: 'Ana',
    veiculoLabel: 'Fiat Uno',
    placa: 'XYZ9Z99',
    moto: motoStub('carro'),
  })
  assert(wa.includes('seu carro') || wa.includes('do seu carro'), 'whatsapp carro')

  assert(resolverTipoVeiculoRegistro(motoStub()) === undefined, 'sem tipo explícito')

  const regra = 'Troca {{artigo_possessivo_veiculo}} {{moto}}'
  const msgRegra = montarMensagemLembrete(regra, varsLembreteCarro)
  assert(msgRegra.includes('seu carro') || msgRegra.includes('do seu carro'), 'regra lembrete carro')

  assert(
    obterTermosComunicacaoVeiculo(undefined, { veiculoAssociado: false }).possessivoVeiculo ===
      'seu veículo',
    'comunicação sem veículo'
  )

  console.log('termos-comunicacao-veiculo: 16 cenários OK')
}
