/**
 * Verificações automáticas do módulo tipo_oficina (Testes A–E em lógica pura).
 * Executar: npx tsx scripts/verificar-tipo-oficina.ts
 */
import assert from 'node:assert/strict'
import { obterTermosOficina } from '../src/lib/termos-oficina.ts'
import { normalizarTipoOficina } from '../src/types/tipo-oficina.ts'
import { montarVarsLembrete } from '../src/services/lembretes/lembretes.service.ts'
import { buildOsDocumentoViewModel } from '../src/lib/os-documento.ts'
import { buildReciboDocumentoViewModel } from '../src/lib/recibo-documento.ts'
import type { Moto, Cliente, OrdemServico, Oficina, LancamentoFinanceiro } from '../src/types/index.ts'

// Teste A — sem tipo definido → motos
assert.equal(normalizarTipoOficina(undefined), 'motos')
const termosA = obterTermosOficina(undefined)
assert.equal(termosA.veiculos, 'Motos')
assert.equal(termosA.dadosVeiculo, 'Dados da moto')

// Teste B — carros
const termosB = obterTermosOficina('carros')
assert.equal(termosB.veiculos, 'Veículos')
assert.equal(termosB.novoVeiculo, 'Novo veículo')
assert.equal(termosB.labelDocumento, 'Veículo')

// Teste C — mista
const termosC = obterTermosOficina('mista')
assert.equal(termosC.veiculos, 'Veículos')

// Teste lembretes — carros usa veículo
const motoStub = {
  id: 'm1',
  marca: 'Honda',
  modelo: 'CG',
  placa: 'ABC1D23',
} as Moto
const varsCarros = montarVarsLembrete(
  'João',
  motoStub,
  'Revisão',
  '2026-07-01',
  5000,
  'Oficina X',
  termosB
)
assert.equal(varsCarros.termo_veiculo, 'veículo')
assert(varsCarros.artigo_veiculo.includes('veículo'))

// PDF OS / recibo labels
const clienteStub = { id: 'c1', nome: 'João', telefone: '38999999999' } as Cliente
const osStub = {
  id: 'os1',
  numero: 1001,
  cliente_id: 'c1',
  moto_id: 'm1',
  defeito_relatado: 'Barulho',
  status: 'finalizada',
} as OrdemServico
const oficinaMotos = { id: 'o1', nome: 'Craft', telefone: '38', endereco: 'Rua', preferencias: {} } as Oficina
const oficinaCarros = { ...oficinaMotos, tipo_oficina: 'carros' as const }

const vmMotos = buildOsDocumentoViewModel(osStub, clienteStub, motoStub, oficinaMotos, [])
assert.equal(vmMotos.secaoVeiculoTitulo, 'Dados da moto')

const vmCarros = buildOsDocumentoViewModel(osStub, clienteStub, motoStub, oficinaCarros, [])
assert.equal(vmCarros.secaoVeiculoTitulo, 'Dados do veículo')

const pagStub = {
  id: 'p1',
  valor: 100,
  data: '2026-06-01',
  forma_pagamento: 'pix',
  tipo: 'receita',
  categoria: 'os',
  ordem_servico_id: 'os1',
} as LancamentoFinanceiro

const reciboMotos = buildReciboDocumentoViewModel(
  osStub,
  pagStub,
  clienteStub,
  motoStub,
  oficinaMotos,
  [pagStub]
)
assert.equal(reciboMotos.labelVeiculoDocumento, 'Moto')

const reciboCarros = buildReciboDocumentoViewModel(
  osStub,
  pagStub,
  clienteStub,
  motoStub,
  oficinaCarros,
  [pagStub]
)
assert.equal(reciboCarros.labelVeiculoDocumento, 'Veículo')

console.log('OK — Testes A–E (lógica) passaram.')
