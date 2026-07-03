import { describe, expect, it } from 'vitest'
import {
  criarItensChecklistTesteVeiculo,
  interpretarAvaliacaoVoz,
  segmentarAvaliacaoVoz,
} from './checklist-avaliacao-voz'

const itens = criarItensChecklistTesteVeiculo()

function nomesAlterados(frase: string): string[] {
  return interpretarAvaliacaoVoz(frase, itens).alteracoes.map((a) => a.nomeItem)
}

function alteracao(frase: string, nomeParcial: string) {
  return interpretarAvaliacaoVoz(frase, itens).alteracoes.find((a) =>
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

    expect(alteracao(frase, 'Lanternas')?.situacaoLabel).toBe('Com avaria')
    expect(alteracao(frase, 'Pneus')?.situacaoLabel).toBe('Com avaria')
    expect(alteracao(frase, 'Para-brisa')?.situacaoLabel).toBe('Com avaria')
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
    expect(alt?.situacaoLabel).toBe('Com avaria')
  })

  it('não associa frase longa inteira só ao combustível', () => {
    const frase =
      'lanterna traseira quebrada pneu dianteiro gasto parabrisa trincado tanque meio'
    const resultado = interpretarAvaliacaoVoz(frase, itens)
    expect(resultado.alteracoes.length).toBeGreaterThanOrEqual(4)
  })
})
