import { describe, expect, it } from 'vitest'
import {
  aplicarAlteracoesVozAoChecklist,
  criarItensChecklistTesteVeiculo,
  interpretarAvaliacaoVoz,
  segmentarAvaliacaoVoz,
} from './checklist-avaliacao-voz'
import { criarChecklistFromModelo } from '@/services/checklist-modelo.service'

const itens = criarItensChecklistTesteVeiculo()
const checklistVeiculoPadrao = criarChecklistFromModelo(null, [], 'oficina-test', 'carros')

function nomesAlterados(frase: string, lista = itens) {
  return interpretarAvaliacaoVoz(frase, lista).alteracoes.map((a) => a.nomeItem)
}

function alteracao(frase: string, nomeParcial: string, lista = itens) {
  return interpretarAvaliacaoVoz(frase, lista).alteracoes.find((a) =>
    a.nomeItem.toLowerCase().includes(nomeParcial.toLowerCase())
  )
}

describe('checklist-avaliacao-voz parser', () => {
  it('Frase A — lanternas, pneus, para-brisa e combustível 1/2', () => {
    const frase =
      'lanterna traseira quebrada, pneu dianteiro gasto, para-brisa trincado, tanque meio'
    const resultado = interpretarAvaliacaoVoz(frase, itens)
    const nomes = resultado.alteracoes.map((a) => a.nomeItem)

    expect(nomes).toContain('Lanternas')
    expect(nomes).toContain('Pneus')
    expect(nomes).toContain('Para-brisa')
    expect(nomes).toContain('Combustível')

    expect(alteracao(frase, 'Lanternas')?.situacaoLabel).toBe('Não OK')
    expect(alteracao(frase, 'Pneus')?.situacaoLabel).toBe('Não OK')
    expect(alteracao(frase, 'Para-brisa')?.situacaoLabel).toBe('Não OK')
    expect(alteracao(frase, 'Combustível')?.situacaoLabel).toBe('1/2')
  })

  it('Frase B — sem vírgulas: lanternas, pneus e parabrisa', () => {
    const frase = 'lanternas riscadas pneus ruins parabrisa trincado'
    const nomes = nomesAlterados(frase)

    expect(nomes).toContain('Lanternas')
    expect(nomes).toContain('Pneus')
    expect(nomes).toContain('Para-brisa')
    expect(segmentarAvaliacaoVoz(frase, itens).length).toBeGreaterThanOrEqual(3)
  })

  it('Frase C — farol, retrovisor e documento', () => {
    const frase = 'farol esquerdo arranhado retrovisor quebrado documento entregue'
    const resultado = interpretarAvaliacaoVoz(frase, itens)

    expect(resultado.alteracoes.map((a) => a.nomeItem)).toContain('Faróis')
    expect(resultado.alteracoes.map((a) => a.nomeItem)).toContain('Retrovisores')
    expect(alteracao(frase, 'Documento')?.situacaoLabel).toBe('Entregue')
  })

  it('Frase D — tanque um quarto', () => {
    const frase = 'tanque um quarto'
    expect(alteracao(frase, 'Combustível')?.situacaoLabel).toBe('1/4')
  })

  it('Frase E — penus gasto (erro de transcrição)', () => {
    const frase = 'penus gasto'
    const alt = alteracao(frase, 'Pneus')
    expect(alt).toBeDefined()
    expect(alt?.situacaoLabel).toBe('Não OK')
  })

  it('não associa frase longa inteira só ao combustível', () => {
    const frase =
      'lanterna traseira quebrada pneu dianteiro gasto parabrisa trincado tanque meio'
    const resultado = interpretarAvaliacaoVoz(frase, itens)
    expect(resultado.alteracoes.length).toBeGreaterThanOrEqual(4)
  })

  it('Frase 1 completa — checklist padrão veículo', () => {
    const frase =
      'lanterna traseira quebrada, pneu dianteiro gasto, para-brisa trincado, retrovisor quebrado, tanque meio'
    const itensVeiculo = checklistVeiculoPadrao.itens
    const resultado = interpretarAvaliacaoVoz(frase, itensVeiculo)
    const nomes = resultado.alteracoes.map((a) => a.nomeItem)

    expect(nomes).toContain('Lanternas')
    expect(nomes).toContain('Pneus')
    expect(nomes).toContain('Combustível')
    expect(nomes.some((n) => n.toLowerCase().includes('vidro'))).toBe(true)

    const aplicado = aplicarAlteracoesVozAoChecklist(checklistVeiculoPadrao, resultado)
    const pneus = aplicado.itens.find((i) => i.item_id === 'item-v-pneus')
    const lanternas = aplicado.itens.find((i) => i.item_id === 'item-v-lanternas')
    const combustivel = aplicado.itens.find((i) => i.item_id === 'item-v-combustivel')

    expect(pneus?.valor_ok).toBe(false)
    expect(lanternas?.valor_ok).toBe(false)
    expect(combustivel?.valor_texto).toBe('1/2')
  })

  it('Frase 1 sem vírgulas — checklist motos aplica todos', () => {
    const checklistMotos = criarChecklistFromModelo(null, [], 'oficina-test', 'motos')
    const frase =
      'lanterna traseira quebrada pneu dianteiro gasto parabrisa trincado retrovisor quebrado tanque meio'
    const resultado = interpretarAvaliacaoVoz(frase, checklistMotos.itens)
    const nomes = resultado.alteracoes.map((a) => a.nomeItem)

    expect(nomes).toContain('Lanterna')
    expect(nomes).toContain('Pneus')
    expect(nomes).toContain('Retrovisores')
    expect(nomes).toContain('Combustível')
    expect(segmentarAvaliacaoVoz(frase, checklistMotos.itens).length).toBeGreaterThanOrEqual(4)
  })

  it('Frase 2 — farol, setas, documento e pneus', () => {
    const checklistMotos = criarChecklistFromModelo(null, [], 'oficina-test', 'motos')
    const frase = 'farol esquerdo arranhado, seta direita quebrada, documento entregue, pneu traseiro ruim'
    const nomes = interpretarAvaliacaoVoz(frase, checklistMotos.itens).alteracoes.map((a) => a.nomeItem)
    expect(nomes).toContain('Farol')
    expect(nomes).toContain('Setas')
    expect(nomes.some((n) => n.toLowerCase().includes('documento'))).toBe(true)
    expect(nomes).toContain('Pneus')
  })

  it('Frase 3 — parabrisa, pneus, lanternas e combustível 1/4', () => {
    const checklistMotos = criarChecklistFromModelo(null, [], 'oficina-test', 'motos')
    const frase = 'parabrisa trincado pneus gastos lanternas quebradas tanque um quarto'
    const resultado = interpretarAvaliacaoVoz(frase, checklistMotos.itens)
    const nomes = resultado.alteracoes.map((a) => a.nomeItem)
    expect(nomes).toContain('Lanterna')
    expect(nomes).toContain('Pneus')
    expect(alteracao(frase, 'Combustível', checklistMotos.itens)?.situacaoLabel).toBe('1/4')
  })
})
