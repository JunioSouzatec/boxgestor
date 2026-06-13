import type { OrdemServico } from '@/types/ordem-servico'
import type { ChecklistEntrada, ChecklistEntradaLegado, RespostaItemChecklist } from '@/types/checklist'
import type {
  CategoriaChecklist,
  ItemModeloChecklist,
  ModeloChecklist,
  ModeloChecklistInput,
  QualidadeResposta,
  TipoRespostaChecklist,
} from '@/types/checklist-modelo'
import { MODELO_CHECKLIST_PADRAO_ID } from '@/types/checklist-modelo'
import type { ChaveItemChecklist } from '@/types/enums'
import { OFFICE_ID } from '@/types/base'
import { gerarId } from '@/lib/utils'
import { stampCreate, stampUpdate } from '@/services/migration.service'

export const CATEGORIAS_CHECKLIST: { value: CategoriaChecklist; label: string }[] = [
  { value: 'documentacao', label: 'Documentação' },
  { value: 'acessorios', label: 'Acessórios' },
  { value: 'iluminacao', label: 'Iluminação' },
  { value: 'parte_eletrica', label: 'Parte elétrica' },
  { value: 'freios', label: 'Freios' },
  { value: 'pneus', label: 'Pneus' },
  { value: 'motor', label: 'Motor' },
  { value: 'carenagem', label: 'Carenagem' },
  { value: 'seguranca', label: 'Segurança' },
  { value: 'outros', label: 'Outros' },
]

export const TIPOS_RESPOSTA_CHECKLIST: { value: TipoRespostaChecklist; label: string }[] = [
  { value: 'ok_nao_ok', label: 'OK / Não OK' },
  { value: 'sim_nao', label: 'Sim / Não' },
  { value: 'bom_regular_ruim', label: 'Bom / Regular / Ruim' },
  { value: 'texto_livre', label: 'Texto livre' },
  { value: 'numero', label: 'Número' },
  { value: 'foto_obrigatoria', label: 'Foto obrigatória (em breve)' },
]

const LEGACY_CHAVE_NOME: Record<ChaveItemChecklist, string> = {
  combustivel: 'Combustível',
  capacete_entregue: 'Capacete entregue',
  chave_reserva: 'Chave reserva',
  retrovisores: 'Retrovisores',
  setas: 'Setas',
  farol: 'Farol',
  lanterna: 'Lanterna',
  freios: 'Freios',
  pneus: 'Pneus',
  arranhoes_observados: 'Arranhões observados',
}

function itemModelo(
  id: string,
  nome: string,
  categoria: CategoriaChecklist,
  ordem: number,
  tipo: TipoRespostaChecklist = 'ok_nao_ok',
  obrigatorio = false,
  observacao_padrao?: string
): ItemModeloChecklist {
  return {
    id,
    nome,
    categoria,
    tipo_resposta: tipo,
    obrigatorio,
    ordem,
    observacao_padrao,
  }
}

export function criarModeloChecklistPadrao(officeId: string = OFFICE_ID): ModeloChecklist {
  const hoje = new Date().toISOString().slice(0, 10)
  return stampCreate(
    {
      id: MODELO_CHECKLIST_PADRAO_ID,
      oficina_id: officeId,
      office_id: officeId,
      nome: 'Checklist Padrão de Entrada',
      descricao: 'Conferência padrão na recepção da moto',
      ativo: true,
      padrao: true,
      criado_em: hoje,
      itens: [
        itemModelo('item-combustivel', 'Combustível', 'outros', 1),
        itemModelo('item-capacete', 'Capacete entregue', 'acessorios', 2),
        itemModelo('item-chave-reserva', 'Chave reserva', 'acessorios', 3),
        itemModelo('item-documento', 'Documento da moto', 'documentacao', 4),
        itemModelo('item-retrovisores', 'Retrovisores', 'seguranca', 5),
        itemModelo('item-setas', 'Setas', 'iluminacao', 6),
        itemModelo('item-farol', 'Farol', 'iluminacao', 7),
        itemModelo('item-lanterna', 'Lanterna', 'iluminacao', 8),
        itemModelo('item-freios', 'Freios', 'freios', 9),
        itemModelo('item-pneus', 'Pneus', 'pneus', 10),
        itemModelo('item-painel', 'Painel', 'parte_eletrica', 11),
        itemModelo('item-buzina', 'Buzina', 'parte_eletrica', 12),
        itemModelo('item-vazamentos', 'Vazamentos', 'motor', 13),
        itemModelo('item-arranhoes', 'Arranhões observados', 'carenagem', 14),
        itemModelo(
          'item-obs-gerais',
          'Observações gerais',
          'outros',
          15,
          'texto_livre',
          false
        ),
      ],
    },
    officeId
  )
}

export function ensureModelosChecklist(
  modelos: ModeloChecklist[] | undefined,
  officeId: string
): ModeloChecklist[] {
  const lista = modelos?.length ? [...modelos] : [criarModeloChecklistPadrao(officeId)]

  const temAtivo = lista.some((m) => m.ativo)
  if (!temAtivo && lista.length) {
    lista[0] = { ...lista[0], ativo: true }
  }

  if (!lista.some((m) => m.padrao)) {
    const padrao = lista.find((m) => m.id === MODELO_CHECKLIST_PADRAO_ID) ?? lista[0]
    return lista.map((m) => ({ ...m, padrao: m.id === padrao.id }))
  }

  const padraoId = lista.find((m) => m.padrao)?.id
  return lista.map((m) => ({ ...m, padrao: m.id === padraoId }))
}

/** Garante lista de modelos com checklist padrão ativo */
export function garantirChecklistPadrao(
  modelos: ModeloChecklist[] | undefined,
  officeId: string = OFFICE_ID
): ModeloChecklist[] {
  return ensureModelosChecklist(modelos, officeId)
}

export function obterModeloPadrao(modelos: ModeloChecklist[]): ModeloChecklist {
  if (!modelos?.length) {
    return criarModeloChecklistPadrao()
  }

  return (
    modelos.find((m) => m.padrao && m.ativo) ??
    modelos.find((m) => m.padrao) ??
    modelos.find((m) => m.ativo) ??
    modelos[0] ??
    criarModeloChecklistPadrao()
  )
}

/** Retorna o checklist padrão, criando um modelo local se necessário */
export function getModeloChecklistPadrao(
  modelos: ModeloChecklist[] | undefined,
  officeId: string = OFFICE_ID
): ModeloChecklist {
  return obterModeloPadrao(garantirChecklistPadrao(modelos, officeId))
}

export function obterModelosAtivos(modelos: ModeloChecklist[]): ModeloChecklist[] {
  return modelos.filter((m) => m.ativo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export function getLabelCategoriaChecklist(categoria: CategoriaChecklist): string {
  return CATEGORIAS_CHECKLIST.find((c) => c.value === categoria)?.label ?? categoria
}

export function getLabelTipoRespostaChecklist(tipo: TipoRespostaChecklist): string {
  return TIPOS_RESPOSTA_CHECKLIST.find((t) => t.value === tipo)?.label ?? tipo
}

export function getLabelQualidadeResposta(valor?: QualidadeResposta): string {
  if (valor === 'bom') return 'Bom'
  if (valor === 'regular') return 'Regular'
  if (valor === 'ruim') return 'Ruim'
  return '—'
}

export function formatarRespostaChecklist(item: RespostaItemChecklist): string {
  switch (item.tipo_resposta) {
    case 'ok_nao_ok':
      if (item.valor_ok === true) return 'OK'
      if (item.valor_ok === false) return 'Não OK'
      return '—'
    case 'sim_nao':
      if (item.valor_ok === true) return 'Sim'
      if (item.valor_ok === false) return 'Não'
      return '—'
    case 'bom_regular_ruim':
      return getLabelQualidadeResposta(item.valor_qualidade)
    case 'texto_livre':
      return item.valor_texto?.trim() || '—'
    case 'numero':
      return item.valor_numero !== undefined ? String(item.valor_numero) : '—'
    case 'foto_obrigatoria':
      return item.valor_texto?.trim() ? 'Foto registrada' : '—'
    default:
      return '—'
  }
}

export function respostaFromItemModelo(item: ItemModeloChecklist): RespostaItemChecklist {
  return {
    item_id: item.id,
    nome: item.nome,
    categoria: item.categoria,
    tipo_resposta: item.tipo_resposta,
    obrigatorio: item.obrigatorio,
    ordem: item.ordem,
    observacao: item.observacao_padrao,
    extra: false,
  }
}

export function criarChecklistFromModelo(
  modelo: ModeloChecklist | null | undefined,
  modelosFallback: ModeloChecklist[] = [],
  officeId: string = OFFICE_ID
): ChecklistEntrada {
  const modelosSeguros = garantirChecklistPadrao(modelosFallback, officeId)
  const modeloSeguro =
    modelo?.id && Array.isArray(modelo.itens)
      ? modelo
      : (modelo?.id
          ? modelosSeguros.find((m) => m.id === modelo.id)
          : undefined) ?? getModeloChecklistPadrao(modelosSeguros, officeId)

  const itensModelo = modeloSeguro.itens ?? criarModeloChecklistPadrao(officeId).itens

  return {
    modelo_id: modeloSeguro.id,
    modelo_nome: modeloSeguro.nome,
    itens: [...itensModelo].sort((a, b) => a.ordem - b.ordem).map(respostaFromItemModelo),
    observacoes_gerais: '',
  }
}

export function isChecklistLegado(
  checklist: ChecklistEntrada | ChecklistEntradaLegado | undefined
): checklist is ChecklistEntradaLegado {
  if (!checklist?.itens?.length) return false
  return 'chave' in checklist.itens[0]
}

export function converterChecklistLegado(
  legado: ChecklistEntradaLegado,
  modelos: ModeloChecklist[],
  officeId: string = OFFICE_ID
): ChecklistEntrada {
  const modelosSeguros = garantirChecklistPadrao(modelos, officeId)
  const checklist = criarChecklistFromModelo(undefined, modelosSeguros, officeId)
  const mapaNome = new Map(checklist.itens.map((i) => [i.nome.toLowerCase(), i]))

  for (const antigo of legado.itens) {
    const nome = LEGACY_CHAVE_NOME[antigo.chave]
    const item = mapaNome.get(nome.toLowerCase())
    if (item) {
      item.valor_ok = antigo.ok
      if (antigo.observacao) item.observacao = antigo.observacao
    }
  }

  if (legado.observacoes_gerais) {
    checklist.observacoes_gerais = legado.observacoes_gerais
    const obsGerais = checklist.itens.find((i) => i.item_id === 'item-obs-gerais')
    if (obsGerais) obsGerais.valor_texto = legado.observacoes_gerais
  }

  return checklist
}

export function normalizarChecklistEntrada(
  checklist: ChecklistEntrada | ChecklistEntradaLegado | undefined,
  modelos: ModeloChecklist[] | undefined,
  officeId: string = OFFICE_ID
): ChecklistEntrada {
  const modelosSeguros = garantirChecklistPadrao(modelos, officeId)
  const padrao = getModeloChecklistPadrao(modelosSeguros, officeId)

  if (!checklist) {
    return criarChecklistFromModelo(padrao, modelosSeguros, officeId)
  }

  if (isChecklistLegado(checklist)) {
    return converterChecklistLegado(checklist, modelosSeguros, officeId)
  }

  const modeloId = checklist.modelo_id?.trim()
  const modelo =
    (modeloId ? modelosSeguros.find((m) => m.id === modeloId) : undefined) ?? padrao

  const itens =
    checklist.itens?.length > 0
      ? [...checklist.itens].sort((a, b) => a.ordem - b.ordem)
      : criarChecklistFromModelo(modelo, modelosSeguros, officeId).itens

  return {
    modelo_id: modeloId && modelosSeguros.some((m) => m.id === modeloId) ? modeloId : modelo.id,
    modelo_nome: checklist.modelo_nome?.trim() || modelo.nome,
    observacoes_gerais: checklist.observacoes_gerais ?? '',
    itens,
  }
}

export function aplicarModeloAoChecklist(
  checklist: ChecklistEntrada,
  modelo: ModeloChecklist | null | undefined,
  preservarExtras = true,
  modelosFallback: ModeloChecklist[] = [],
  officeId: string = OFFICE_ID
): ChecklistEntrada {
  const extras = preservarExtras ? checklist.itens.filter((i) => i.extra) : []
  const base = criarChecklistFromModelo(modelo, modelosFallback, officeId)
  const maxOrdem = base.itens.length
  return {
    ...base,
    itens: [
      ...base.itens,
      ...extras.map((e, idx) => ({ ...e, ordem: maxOrdem + idx + 1 })),
    ],
  }
}

export function adicionarItemExtraChecklist(
  checklist: ChecklistEntrada,
  item: Omit<RespostaItemChecklist, 'extra' | 'ordem' | 'item_id'> & { item_id?: string }
): ChecklistEntrada {
  const ordem = Math.max(0, ...checklist.itens.map((i) => i.ordem)) + 1
  return {
    ...checklist,
    itens: [
      ...checklist.itens,
      {
        ...item,
        item_id: item.item_id ?? gerarId(),
        ordem,
        extra: true,
      },
    ],
  }
}

export function atualizarRespostaChecklist(
  checklist: ChecklistEntrada,
  itemId: string,
  patch: Partial<RespostaItemChecklist>
): ChecklistEntrada {
  return {
    ...checklist,
    itens: checklist.itens.map((item) =>
      item.item_id === itemId ? { ...item, ...patch } : item
    ),
  }
}

export function removerItemExtraChecklist(
  checklist: ChecklistEntrada,
  itemId: string
): ChecklistEntrada {
  return {
    ...checklist,
    itens: checklist.itens.filter((item) => item.item_id !== itemId || !item.extra),
  }
}

export function buildNovoModeloChecklist(
  input: ModeloChecklistInput,
  officeId: string
): ModeloChecklist {
  const hoje = new Date().toISOString().slice(0, 10)
  return stampCreate(
    {
      ...input,
      id: gerarId(),
      oficina_id: officeId,
      office_id: officeId,
      criado_em: hoje,
      itens: input.itens.map((item, idx) => ({
        ...item,
        id: item.id || gerarId(),
        ordem: item.ordem || idx + 1,
      })),
    },
    officeId
  )
}

export function mergeModeloChecklist(
  existente: ModeloChecklist,
  patch: Partial<ModeloChecklist>
): ModeloChecklist {
  return stampUpdate({
    ...existente,
    ...patch,
    itens: patch.itens ?? existente.itens,
  })
}

export function definirModeloPadraoLista(
  modelos: ModeloChecklist[],
  modeloId: string
): ModeloChecklist[] {
  return modelos.map((m) => ({ ...m, padrao: m.id === modeloId }))
}

export function podeExcluirModeloChecklist(modelo: ModeloChecklist): boolean {
  return !modelo.padrao
}

/** Vincula OS antigas ao checklist padrão sem alterar demais dados */
export function migrarOrdensAntigasParaChecklistPadrao(
  ordens: OrdemServico[],
  modelos: ModeloChecklist[] | undefined,
  officeId: string
): OrdemServico[] {
  const modelosSeguros = garantirChecklistPadrao(modelos, officeId)
  return ordens.map((os) => ({
    ...os,
    checklist_entrada: normalizarChecklistEntrada(os.checklist_entrada, modelosSeguros, officeId),
  }))
}
