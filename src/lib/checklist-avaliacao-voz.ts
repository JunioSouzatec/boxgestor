import {
  ehItemCombustivelChecklist,
  patchCombustivelChecklist,
  type ValorCombustivel,
} from '@/lib/combustivel-checklist'
import type { RespostaItemChecklist } from '@/types/checklist'

/** Normalização leve para exibição. */
export function normalizarTextoVoz(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
}

/** Chave de comparação: sem acento, hífen, espaços extras; plural simples. */
export function normalizarChaveVoz(texto: string): string {
  return normalizarTextoVoz(texto)
    .replace(/[-_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function singularizarPalavra(palavra: string): string {
  if (palavra.length <= 3) return palavra
  if (palavra.endsWith('oes')) return palavra.slice(0, -3) + 'ao'
  if (palavra.endsWith('ois')) return palavra.slice(0, -3) + 'ol'
  if (palavra.endsWith('ais')) return palavra.slice(0, -3) + 'al'
  if (palavra.endsWith('eis')) return palavra.slice(0, -3) + 'el'
  if (palavra.endsWith('ns') && palavra.endsWith('ens')) return palavra.slice(0, -2)
  if (palavra.endsWith('is')) return palavra
  if (palavra.endsWith('s') && !palavra.endsWith('ss')) return palavra.slice(0, -1)
  return palavra
}

export function tokenizarChaveVoz(texto: string): string[] {
  return normalizarChaveVoz(texto)
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((p) => {
      const s = singularizarPalavra(p)
      return s !== p ? [p, s] : [p]
    })
}

const CORRECOES_TRANSCRICAO: Record<string, string> = {
  penus: 'pneus',
  parabrisa: 'para brisa',
  parabrisas: 'para brisa',
  farolete: 'lanterna',
  faroltes: 'lanterna',
  velocimetro: 'painel',
}

function aplicarCorrecoesTranscricao(texto: string): string {
  let out = normalizarChaveVoz(texto)
  for (const [errado, certo] of Object.entries(CORRECOES_TRANSCRICAO)) {
    out = out.replace(new RegExp(`\\b${errado}\\b`, 'g'), certo)
  }
  return out
}

const PALAVRAS_NEGATIVAS = [
  'quebrado',
  'quebrada',
  'trincado',
  'trincada',
  'arranhado',
  'arranhada',
  'riscado',
  'riscada',
  'riscadas',
  'riscados',
  'gasto',
  'gasta',
  'ruim',
  'ruins',
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
  'torto',
  'torta',
  'rasgado',
  'rasgada',
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
]

const GRUPOS_SINONIMOS: { chave: string; termos: string[] }[] = [
  {
    chave: 'farol',
    termos: ['farol', 'farois', 'luz dianteira', 'lampada dianteira', 'lampada'],
  },
  {
    chave: 'lanterna',
    termos: ['lanterna', 'lanternas', 'luz traseira', 'luzes traseiras', 'farolete', 'luz de freio'],
  },
  {
    chave: 'seta',
    termos: ['seta', 'setas', 'pisca', 'piscas', 'pisca alerta'],
  },
  {
    chave: 'pneu',
    termos: ['pneu', 'pneus', 'penus', 'roda', 'rodas', 'aro', 'estepe', 'dianteiro', 'traseiro'],
  },
  {
    chave: 'para brisa',
    termos: ['para brisa', 'parabrisa', 'parabrisas', 'vidro dianteiro', 'vidro'],
  },
  {
    chave: 'retrovisor',
    termos: ['retrovisor', 'retrovisores', 'espelho', 'espelhos'],
  },
  {
    chave: 'freio',
    termos: ['freio', 'freios', 'pastilha', 'pastilhas', 'manete', 'pedal de freio'],
  },
  {
    chave: 'documento',
    termos: ['documento', 'documentos', 'crlv', 'dut', 'recibo'],
  },
  {
    chave: 'chave',
    termos: ['chave', 'chaves', 'controle', 'alarme', 'chave reserva'],
  },
  {
    chave: 'combustivel',
    termos: ['tanque', 'combustivel', 'gasolina', 'etanol', 'diesel', 'meio tanque', 'um quarto'],
  },
  {
    chave: 'carenagem',
    termos: ['carenagem', 'lataria', 'pintura', 'arranhoes', 'arranhao'],
  },
  { chave: 'banco', termos: ['banco', 'bancos', 'assento', 'assentos'] },
  { chave: 'painel', termos: ['painel', 'velocimetro', 'marcador'] },
  { chave: 'placa', termos: ['placa'] },
  { chave: 'capacete', termos: ['capacete'] },
  { chave: 'buzina', termos: ['buzina'] },
  { chave: 'vazamento', termos: ['vazamento', 'vazamentos', 'oleo', 'nivel de oleo'] },
  { chave: 'bateria', termos: ['bateria'] },
  { chave: 'vidro', termos: ['vidro', 'vidros', 'trava', 'travas'] },
  { chave: 'cinto', termos: ['cinto', 'cinto de seguranca'] },
  { chave: 'escapamento', termos: ['escapamento', 'silencioso'] },
  { chave: 'corrente', termos: ['corrente', 'relacao'] },
]

const REGRAS_COMBUSTIVEL: { padroes: RegExp[]; valor: ValorCombustivel }[] = [
  {
    padroes: [/tanque vazio/, /sem combustivel/, /combustivel vazio/, /\bvazio\b/],
    valor: 'vazio',
  },
  {
    padroes: [/tanque um quarto/, /um quarto/, /\b1\/4\b/, /pouco combustivel/, /quarto de tanque/],
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
  const norm = aplicarCorrecoesTranscricao(texto)
  for (const regra of REGRAS_COMBUSTIVEL) {
    if (regra.padroes.some((p) => p.test(norm))) return regra.valor
  }
  return null
}

function segmentoEhPredominantementeCombustivel(segmento: string): boolean {
  const norm = aplicarCorrecoesTranscricao(segmento)
  if (detectarCombustivelVoz(segmento)) return true
  const tokens = tokenizarChaveVoz(norm)
  const fuelWords = new Set([
    'tanque',
    'combustivel',
    'gasolina',
    'etanol',
    'diesel',
    'cheio',
    'vazio',
    'quarto',
    'metade',
  ])
  const fuelCount = tokens.filter((t) => fuelWords.has(t)).length
  return fuelCount > 0 && fuelCount >= tokens.length / 2
}

interface IndiceItemVoz {
  item: RespostaItemChecklist
  chaves: Set<string>
}

function chavesDoNomeItem(nome: string): string[] {
  const norm = normalizarChaveVoz(nome)
  const chaves = [norm, singularizarPalavra(norm.replace(/\s+/g, ' '))]
  for (const palavra of norm.split(/\s+/)) {
    if (palavra.length >= 3) chaves.push(palavra, singularizarPalavra(palavra))
  }
  return [...new Set(chaves.filter(Boolean))]
}

function itemCasaComChaveGrupo(nomeItem: string, chaveGrupo: string): boolean {
  const chavesItem = chavesDoNomeItem(nomeItem)
  const alvo = normalizarChaveVoz(chaveGrupo)
  const alvoSing = singularizarPalavra(alvo)
  return chavesItem.some((c) => {
    const cs = singularizarPalavra(c)
    return c.includes(alvo) || alvo.includes(c) || cs.includes(alvoSing) || alvoSing.includes(cs)
  })
}

function construirIndiceItens(itens: RespostaItemChecklist[]): IndiceItemVoz[] {
  return itens.map((item) => {
    const chaves = new Set<string>()
    for (const c of chavesDoNomeItem(item.nome)) chaves.add(c)
    for (const grupo of GRUPOS_SINONIMOS) {
      if (itemCasaComChaveGrupo(item.nome, grupo.chave)) {
        for (const t of grupo.termos) chaves.add(normalizarChaveVoz(t))
      }
    }
    if (ehItemCombustivelChecklist(item)) {
      chaves.add('combustivel')
      chaves.add('tanque')
      chaves.add('gasolina')
    }
    return { item, chaves }
  })
}

function contemTermoComoPalavra(texto: string, termo: string): boolean {
  const t = normalizarChaveVoz(termo)
  if (!t) return false
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|\\s)${esc}(\\s|$)`, 'i').test(normalizarChaveVoz(texto))
}

function indiceTermoComoPalavra(texto: string, termo: string): number {
  const norm = aplicarCorrecoesTranscricao(texto)
  const t = normalizarChaveVoz(termo)
  if (t.length < 3) return -1
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = norm.match(new RegExp(`(^|\\s)${esc}(\\s|$)`))
  if (!match || match.index === undefined) return -1
  return match.index + (match[1] ? match[1].length : 0)
}
function coletarTermosSegmentacao(itens: RespostaItemChecklist[]): string[] {
  const termos = new Set<string>()
  for (const { chaves } of construirIndiceItens(itens)) {
    for (const c of chaves) {
      if (c.length >= 4) termos.add(c)
    }
  }
  for (const grupo of GRUPOS_SINONIMOS) {
    for (const t of grupo.termos) {
      if (normalizarChaveVoz(t).length >= 4) termos.add(normalizarChaveVoz(t))
    }
  }
  return [...termos].sort((a, b) => b.length - a.length)
}

function segmentarPorTermosConhecidos(texto: string, itens: RespostaItemChecklist[]): string[] {
  const norm = aplicarCorrecoesTranscricao(texto)
  if (!norm.trim()) return []

  const termos = coletarTermosSegmentacao(itens)
  const achados: { idx: number; termo: string }[] = []

  for (const termo of termos) {
    const idx = indiceTermoComoPalavra(norm, termo)
    if (idx >= 0) achados.push({ idx, termo })
  }

  achados.sort((a, b) => a.idx - b.idx || b.termo.length - a.termo.length)

  const usados = new Set<number>()
  const pontos: { idx: number; termo: string }[] = []
  for (const achado of achados) {
    if (usados.has(achado.idx)) continue
    usados.add(achado.idx)
    pontos.push(achado)
  }
  pontos.sort((a, b) => a.idx - b.idx)

  if (pontos.length <= 1) return [texto.trim()]

  const segmentos: string[] = []
  for (let i = 0; i < pontos.length; i++) {
    const inicio = pontos[i].idx
    const fim = i + 1 < pontos.length ? pontos[i + 1].idx : norm.length
    const trecho = norm.slice(inicio, fim).trim()
    if (trecho.length > 2) segmentos.push(trecho)
  }
  return segmentos.length > 0 ? segmentos : [texto.trim()]
}

export function segmentarAvaliacaoVoz(texto: string, itens: RespostaItemChecklist[]): string[] {
  const corrigido = aplicarCorrecoesTranscricao(texto)
  const blocosIniciais = corrigido
    .split(/[,;.\n]+|\s+e\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)

  const segmentos: string[] = []
  for (const bloco of blocosIniciais.length > 0 ? blocosIniciais : [corrigido.trim()]) {
    segmentos.push(...segmentarPorTermosConhecidos(bloco, itens))
  }

  return [...new Set(segmentos.map((s) => s.trim()).filter((s) => s.length > 2))]
}

function contemPalavra(texto: string, palavras: string[]): boolean {
  const norm = aplicarCorrecoesTranscricao(texto)
  const tokens = new Set(tokenizarChaveVoz(norm))
  return palavras.some((p) => {
    const pn = normalizarChaveVoz(p)
    if (norm.includes(pn)) return true
    return tokens.has(pn) || tokens.has(singularizarPalavra(pn))
  })
}

function pontuarItemParaSegmento(indice: IndiceItemVoz, segmento: string): number {
  const normSeg = aplicarCorrecoesTranscricao(segmento)
  const tokensSeg = new Set(tokenizarChaveVoz(normSeg))
  let score = 0

  if (ehItemCombustivelChecklist(indice.item)) {
    if (segmentoEhPredominantementeCombustivel(segmento)) score += 25
    else if (detectarCombustivelVoz(segmento)) score += 20
    else return 0
  } else if (
    segmentoEhPredominantementeCombustivel(segmento) &&
    !normSeg.match(/lanterna|pneu|parabrisa|para brisa|farol|retrovisor/)
  ) {
    return 0
  }

  for (const chave of indice.chaves) {
    const ck = normalizarChaveVoz(chave)
    if (ck.length < 3) continue
    if (ck.length <= 4 ? contemTermoComoPalavra(normSeg, ck) : normSeg.includes(ck)) {
      score += 10 + Math.min(ck.length, 14)
    }
    if (tokensSeg.has(ck) || tokensSeg.has(singularizarPalavra(ck))) score += 12
  }

  for (const grupo of GRUPOS_SINONIMOS) {
    if (!itemCasaComChaveGrupo(indice.item.nome, grupo.chave)) continue
    for (const termo of grupo.termos) {
      const t = normalizarChaveVoz(termo)
      if (
        (t.length <= 4 ? contemTermoComoPalavra(normSeg, t) : normSeg.includes(t)) ||
        tokensSeg.has(t) ||
        tokensSeg.has(singularizarPalavra(t))
      ) {
        score += 8 + Math.min(t.length, 10)
      }
    }
  }

  const nomeNorm = normalizarChaveVoz(indice.item.nome)
  if (normSeg.includes(nomeNorm)) score += 20
  for (const palavra of nomeNorm.split(/\s+/)) {
    if (palavra.length >= 4 && (normSeg.includes(palavra) || tokensSeg.has(palavra))) score += 8
  }

  return score
}

function encontrarItemParaSegmento(
  segmento: string,
  indice: IndiceItemVoz[]
): RespostaItemChecklist | null {
  let melhor: { item: RespostaItemChecklist; score: number } | null = null

  for (const entrada of indice) {
    const score = pontuarItemParaSegmento(entrada, segmento)
    if (score > 0 && (!melhor || score > melhor.score)) {
      melhor = { item: entrada.item, score }
    }
  }

  if (melhor && melhor.score >= 8) return melhor.item
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
    const labelMap: Record<ValorCombustivel, string> = {
      vazio: 'Vazio',
      '1/4': '1/4',
      '1/2': '1/2',
      '3/4': '3/4',
      cheio: 'Cheio',
    }
    return { label: labelMap[combustivel], patch: patchCombustivelChecklist(combustivel) }
  }

  const negativo = contemPalavra(segmento, PALAVRAS_NEGATIVAS)
  const positivo = contemPalavra(segmento, PALAVRAS_POSITIVAS)

  switch (item.tipo_resposta) {
    case 'ok_nao_ok':
      if (negativo) return { label: 'Com avaria', patch: { valor_ok: false } }
      if (positivo) return { label: 'OK', patch: { valor_ok: true } }
      return { label: '—', patch: {} }
    case 'sim_nao': {
      const nome = normalizarChaveVoz(item.nome)
      const entrega = nome.includes('documento') || nome.includes('capacete') || nome.includes('chave')
      if (positivo || (entrega && contemPalavra(segmento, ['entregue', 'presente']))) {
        return { label: entrega ? 'Entregue' : 'Sim', patch: { valor_ok: true } }
      }
      if (negativo) return { label: 'Não', patch: { valor_ok: false } }
      return { label: '—', patch: {} }
    }
    case 'bom_regular_ruim':
      if (negativo) return { label: 'Ruim', patch: { valor_qualidade: 'ruim' } }
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
  const indice = construirIndiceItens(itens)
  const segmentos = segmentarAvaliacaoVoz(transcricao, itens)
  const alteracoesMap = new Map<string, AlteracaoAvaliacaoVoz>()
  const naoIdentificados: string[] = []

  for (const segmento of segmentos) {
    const item = encontrarItemParaSegmento(segmento, indice)
    if (!item) {
      naoIdentificados.push(segmento)
      continue
    }

    const combustivel = ehItemCombustivelChecklist(item) ? detectarCombustivelVoz(segmento) : null
    const { label, patch } = inferirSituacaoLabel(item, segmento, combustivel)

    const obsExistente = item.observacao
    const observacaoSugerida =
      ehItemCombustivelChecklist(item) && combustivel ? undefined : segmento.trim()

    const patchFinal: Partial<RespostaItemChecklist> = { ...patch }
    let concatenar = false

    if (observacaoSugerida) {
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

export function criarItensChecklistTesteVeiculo(): RespostaItemChecklist[] {
  const base = (
    id: string,
    nome: string,
    ordem: number,
    tipo: RespostaItemChecklist['tipo_resposta'] = 'ok_nao_ok'
  ): RespostaItemChecklist => ({
    item_id: id,
    nome,
    categoria: 'outros',
    tipo_resposta: tipo,
    obrigatorio: false,
    ordem,
  })
  return [
    base('item-v-combustivel', 'Combustível', 1, 'texto_livre'),
    base('item-v-lanternas', 'Lanternas', 2),
    base('item-v-pneus', 'Pneus', 3),
    base('item-extra-parabrisa', 'Para-brisa', 4),
    base('item-v-farois', 'Faróis', 5),
    base('item-retrovisores', 'Retrovisores', 6),
    base('item-v-documento', 'Documento do veículo', 7, 'sim_nao'),
  ]
}
