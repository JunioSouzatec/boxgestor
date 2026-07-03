import {
  ehItemCombustivelChecklist,
  patchCombustivelChecklist,
  type ValorCombustivel,
} from '@/lib/combustivel-checklist'
import type { RespostaItemChecklist } from '@/types/checklist'

export function normalizarTextoVoz(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
}

const PALAVRAS_NEGATIVAS = [
  'quebrado',
  'quebrada',
  'riscado',
  'riscada',
  'trincado',
  'trincada',
  'gasto',
  'gasta',
  'ruim',
  'danificado',
  'danificada',
  'vazando',
  'queimado',
  'queimada',
  'faltando',
  'sem funcionar',
  'nao funciona',
  'nao funcionando',
  'avariado',
  'avariada',
  'amassado',
  'amassada',
  'desgastado',
  'desgastada',
]

const PALAVRAS_POSITIVAS = [
  'ok',
  'bom',
  'boa',
  'funcionando',
  'normal',
  'entregue',
  'presente',
  'sim',
  'regular',
]

interface MapaPalavraChave {
  termos: string[]
  itemIds?: string[]
  nomesParciais?: string[]
}

const MAPA_PALAVRAS_CHAVE: MapaPalavraChave[] = [
  { termos: ['farol', 'farois', 'luz dianteira', 'lampada'], itemIds: ['item-farol', 'item-v-farois'] },
  { termos: ['lanterna', 'lanternas', 'luz traseira'], itemIds: ['item-lanterna', 'item-v-lanternas'] },
  { termos: ['seta', 'setas', 'pisca', 'pisca alerta'], itemIds: ['item-setas', 'item-v-setas'] },
  { termos: ['pneu', 'pneus', 'roda', 'rodas', 'estepe'], itemIds: ['item-pneus', 'item-v-pneus', 'item-v-estepe'] },
  { termos: ['freio', 'freios', 'pastilha', 'pastilhas', 'manete'], itemIds: ['item-freios', 'item-v-freios'] },
  { termos: ['retrovisor', 'retrovisores', 'espelho', 'espelhos'], itemIds: ['item-retrovisores'] },
  {
    termos: ['documento', 'documentos', 'dut', 'crlv', 'doc'],
    itemIds: ['item-documento', 'item-v-documento'],
    nomesParciais: ['documento'],
  },
  { termos: ['chave', 'chaves', 'chave reserva'], itemIds: ['item-chave-reserva', 'item-v-chave-reserva', 'item-v-chave-roda'] },
  { termos: ['capacete'], itemIds: ['item-capacete'] },
  {
    termos: ['tanque', 'combustivel', 'gasolina', 'etanol', 'diesel'],
    itemIds: ['item-combustivel', 'item-v-combustivel'],
    nomesParciais: ['combustivel'],
  },
  { termos: ['pintura', 'carenagem', 'lataria', 'arranhao', 'arranhoes', 'risco'], itemIds: ['item-arranhoes', 'item-v-arranhoes', 'item-v-amassados'] },
  { termos: ['escapamento', 'silencioso'], nomesParciais: ['escapamento'] },
  { termos: ['banco', 'bancos'], nomesParciais: ['banco'] },
  { termos: ['painel'], itemIds: ['item-painel'] },
  { termos: ['placa'], nomesParciais: ['placa'] },
  { termos: ['corrente', 'relacao', 'corrente de comando'], nomesParciais: ['corrente', 'relacao'] },
  { termos: ['buzina'], itemIds: ['item-buzina'] },
  { termos: ['vazamento', 'vazamentos', 'oleo', 'oleo motor'], itemIds: ['item-vazamentos', 'item-v-vazamentos', 'item-v-oleo'] },
  { termos: ['bateria'], itemIds: ['item-v-bateria'] },
  { termos: ['cinto'], itemIds: ['item-v-cinto'] },
  { termos: ['macaco'], itemIds: ['item-v-macaco'] },
  { termos: ['vidro', 'vidros', 'trava'], itemIds: ['item-v-vidros'] },
  { termos: ['ar condicionado', 'ar-condicionado'], itemIds: ['item-v-ar'] },
  { termos: ['palheta', 'palhetas'], itemIds: ['item-v-palhetas'] },
]

const REGRAS_COMBUSTIVEL: { padroes: RegExp[]; valor: ValorCombustivel }[] = [
  {
    padroes: [/tanque vazio/, /sem combustivel/, /combustivel vazio/, /reserva/],
    valor: 'vazio',
  },
  {
    padroes: [/um quarto/, /\b1\/4\b/, /pouco combustivel/, /quarto de tanque/],
    valor: '1/4',
  },
  {
    padroes: [/meio tanque/, /\bmetade\b/, /\b1\/2\b/, /tanque meio/, /combustivel meio/],
    valor: '1/2',
  },
  {
    padroes: [/tres quartos/, /\b3\/4\b/, /tres quarto/],
    valor: '3/4',
  },
  {
    padroes: [/tanque cheio/, /\bcheio\b/, /combustivel cheio/, /tanque lotado/],
    valor: 'cheio',
  },
]

export function detectarCombustivelVoz(texto: string): ValorCombustivel | null {
  const norm = normalizarTextoVoz(texto)
  for (const regra of REGRAS_COMBUSTIVEL) {
    if (regra.padroes.some((p) => p.test(norm))) return regra.valor
  }
  return null
}

function segmentarFrases(texto: string): string[] {
  return texto
    .split(/[,;.\n]+|\s+e\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
}

function contemPalavra(texto: string, palavras: string[]): boolean {
  const norm = normalizarTextoVoz(texto)
  return palavras.some((p) => {
    const pn = normalizarTextoVoz(p)
    return norm.includes(pn) || norm.split(/\s+/).some((w) => w === pn)
  })
}

function itemCombustivel(itens: RespostaItemChecklist[]): RespostaItemChecklist | undefined {
  return itens.find((i) => ehItemCombustivelChecklist(i))
}

function pontuarItem(item: RespostaItemChecklist, segmento: string, mapa: MapaPalavraChave): number {
  const normSeg = normalizarTextoVoz(segmento)
  const normNome = normalizarTextoVoz(item.nome)
  let score = 0

  if (mapa.itemIds?.includes(item.item_id)) score += 10

  for (const termo of mapa.termos) {
    const t = normalizarTextoVoz(termo)
    if (normSeg.includes(t)) score += 8 + Math.min(t.length, 12)
  }

  for (const parcial of mapa.nomesParciais ?? []) {
    const p = normalizarTextoVoz(parcial)
    if (normNome.includes(p) && normSeg.includes(p)) score += 12
  }

  const palavrasNome = normNome.split(/\s+/).filter((w) => w.length > 3)
  for (const palavra of palavrasNome) {
    if (normSeg.includes(palavra)) score += 6
  }

  return score
}

function encontrarItemParaSegmento(
  segmento: string,
  itens: RespostaItemChecklist[]
): RespostaItemChecklist | null {
  const combustivel = detectarCombustivelVoz(segmento)
  if (combustivel) {
    return itemCombustivel(itens) ?? null
  }

  let melhor: { item: RespostaItemChecklist; score: number } | null = null

  for (const mapa of MAPA_PALAVRAS_CHAVE) {
    const normSeg = normalizarTextoVoz(segmento)
    const termoBate = mapa.termos.some((t) => normSeg.includes(normalizarTextoVoz(t)))
    if (!termoBate) continue

    for (const item of itens) {
      if (ehItemCombustivelChecklist(item) && !mapa.termos.some((t) => /tanque|combustivel|gasolina/.test(normalizarTextoVoz(t)))) {
        continue
      }
      const score = pontuarItem(item, segmento, mapa)
      if (score > 0 && (!melhor || score > melhor.score)) {
        melhor = { item, score }
      }
    }
  }

  if (melhor && melhor.score >= 6) return melhor.item

  for (const item of itens) {
    const normNome = normalizarTextoVoz(item.nome)
    const normSeg = normalizarTextoVoz(segmento)
    if (normSeg.includes(normNome) || normNome.split(/\s+/).some((w) => w.length > 4 && normSeg.includes(w))) {
      return item
    }
  }

  return null
}

export interface AlteracaoAvaliacaoVoz {
  itemId: string
  nomeItem: string
  situacaoLabel: string
  observacaoSugerida?: string
  observacaoExistente?: string
  concatenarObservacao: boolean
  patch: Partial<RespostaItemChecklist>
}

export interface ResultadoInterpretacaoVoz {
  alteracoes: AlteracaoAvaliacaoVoz[]
  trechosNaoIdentificados: string[]
}

function inferirSituacaoLabel(
  item: RespostaItemChecklist,
  segmento: string,
  combustivel: ValorCombustivel | null
): { label: string; patch: Partial<RespostaItemChecklist> } {
  if (combustivel && ehItemCombustivelChecklist(item)) {
    return {
      label: combustivel === '1/4' ? '1/4' : combustivel === '1/2' ? '1/2' : combustivel === '3/4' ? '3/4' : combustivel === 'cheio' ? 'Cheio' : 'Vazio',
      patch: patchCombustivelChecklist(combustivel),
    }
  }

  const negativo = contemPalavra(segmento, PALAVRAS_NEGATIVAS)
  const positivo = contemPalavra(segmento, PALAVRAS_POSITIVAS)

  switch (item.tipo_resposta) {
    case 'ok_nao_ok':
      if (negativo) return { label: 'Com avaria', patch: { valor_ok: false } }
      if (positivo) return { label: 'OK', patch: { valor_ok: true } }
      return { label: '—', patch: {} }
    case 'sim_nao': {
      const entrega =
        normalizarTextoVoz(item.nome).includes('documento') ||
        normalizarTextoVoz(item.nome).includes('capacete') ||
        normalizarTextoVoz(item.nome).includes('chave')
      if (positivo || (entrega && segmento.toLowerCase().includes('entregue'))) {
        return { label: entrega ? 'Entregue' : 'Sim', patch: { valor_ok: true } }
      }
      if (negativo) return { label: 'Não', patch: { valor_ok: false } }
      return { label: '—', patch: {} }
    }
    case 'bom_regular_ruim':
      if (negativo || contemPalavra(segmento, ['ruim', 'gasto', 'gasta', 'danificado'])) {
        return { label: 'Ruim', patch: { valor_qualidade: 'ruim' } }
      }
      if (contemPalavra(segmento, ['regular'])) {
        return { label: 'Regular', patch: { valor_qualidade: 'regular' } }
      }
      if (positivo) return { label: 'Bom', patch: { valor_qualidade: 'bom' } }
      return { label: '—', patch: {} }
    case 'texto_livre':
      return { label: segmento.trim(), patch: { valor_texto: segmento.trim() } }
    default:
      return { label: '—', patch: {} }
  }
}

function mesclarObservacao(existente: string | undefined, nova: string): string {
  const antiga = existente?.trim()
  if (!antiga) return nova
  if (antiga.includes(nova)) return antiga
  return `${antiga} [Voz] ${nova}`
}

export function interpretarAvaliacaoVoz(
  transcricao: string,
  itens: RespostaItemChecklist[]
): ResultadoInterpretacaoVoz {
  const segmentos = segmentarFrases(transcricao)
  const alteracoesMap = new Map<string, AlteracaoAvaliacaoVoz>()
  const naoIdentificados: string[] = []

  for (const segmento of segmentos) {
    const item = encontrarItemParaSegmento(segmento, itens)
    if (!item) {
      naoIdentificados.push(segmento)
      continue
    }

    const combustivel = ehItemCombustivelChecklist(item) ? detectarCombustivelVoz(segmento) : null
    const { label, patch } = inferirSituacaoLabel(item, segmento, combustivel)

    const obsExistente = item.observacao
    const precisaObs =
      !ehItemCombustivelChecklist(item) || (combustivel == null && segmento.trim().length > 0)
    const observacaoSugerida =
      ehItemCombustivelChecklist(item) && combustivel
        ? undefined
        : segmento.trim()

    const patchFinal: Partial<RespostaItemChecklist> = { ...patch }
    let concatenar = false

    if (observacaoSugerida && precisaObs) {
      concatenar = Boolean(obsExistente?.trim())
      patchFinal.observacao = mesclarObservacao(obsExistente, observacaoSugerida)
    }

    const existente = alteracoesMap.get(item.item_id)
    if (existente) {
      alteracoesMap.set(item.item_id, {
        ...existente,
        situacaoLabel: label !== '—' ? label : existente.situacaoLabel,
        observacaoSugerida: observacaoSugerida
          ? mesclarObservacao(existente.observacaoSugerida, observacaoSugerida)
          : existente.observacaoSugerida,
        patch: { ...existente.patch, ...patchFinal },
        concatenarObservacao: concatenar || existente.concatenarObservacao,
      })
    } else {
      alteracoesMap.set(item.item_id, {
        itemId: item.item_id,
        nomeItem: item.nome,
        situacaoLabel: label,
        observacaoSugerida,
        observacaoExistente: obsExistente,
        concatenarObservacao: concatenar,
        patch: patchFinal,
      })
    }
  }

  return {
    alteracoes: [...alteracoesMap.values()],
    trechosNaoIdentificados: naoIdentificados,
  }
}

export function aplicarAlteracoesVozAoChecklist(
  checklist: { itens: RespostaItemChecklist[]; observacoes_gerais?: string },
  resultado: ResultadoInterpretacaoVoz
): { itens: RespostaItemChecklist[]; observacoes_gerais?: string } {
  const mapa = new Map(resultado.alteracoes.map((a) => [a.itemId, a]))

  const itens = checklist.itens.map((item) => {
    const alt = mapa.get(item.item_id)
    if (!alt) return item
    return { ...item, ...alt.patch }
  })

  let observacoes_gerais = checklist.observacoes_gerais
  if (resultado.trechosNaoIdentificados.length > 0) {
    const bloco = resultado.trechosNaoIdentificados.join('; ')
    const prefixo = '[Avaliação por voz — trechos não identificados]'
    const extra = `${prefixo} ${bloco}`
    observacoes_gerais = observacoes_gerais?.trim()
      ? `${observacoes_gerais.trim()}\n${extra}`
      : extra
  }

  return { ...checklist, itens, observacoes_gerais }
}
