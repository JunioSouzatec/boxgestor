import type { ChecklistEntrada } from '@/types/checklist'
import type { RespostaItemChecklist } from '@/types/checklist'
import type { StatusOS } from '@/types/enums'

export type CampoOSForm =
  | 'cliente_id'
  | 'moto_id'
  | 'defeito_relatado'
  | 'status'
  | 'quilometragem_entrada'
  | 'checklist'

export interface ErroCampoOS {
  campo: CampoOSForm
  mensagem: string
  elementoId: string
}

export interface FormularioOSValidavel {
  cliente_id: string
  moto_id: string
  defeito_relatado: string
  status: StatusOS
  quilometragem_entrada?: number
  checklist_entrada: ChecklistEntrada
}

export interface ResultadoValidacaoOS {
  valido: boolean
  mensagemGeral: string
  erros: ErroCampoOS[]
  errosChecklistItens: string[]
}

export const CLASSE_CAMPO_INVALIDO =
  'border-destructive/60 focus-visible:ring-destructive/40 aria-invalid:border-destructive/60'

function itemChecklistPreenchido(item: RespostaItemChecklist): boolean {
  switch (item.tipo_resposta) {
    case 'ok_nao_ok':
    case 'sim_nao':
      return item.valor_ok !== undefined
    case 'bom_regular_ruim':
      return !!item.valor_qualidade
    case 'texto_livre':
      return !!item.valor_texto?.trim()
    case 'numero':
      return item.valor_numero !== undefined && !Number.isNaN(item.valor_numero)
    case 'foto_obrigatoria':
      return !!item.valor_texto?.trim()
    default:
      return true
  }
}

export function validarFormularioOS(form: FormularioOSValidavel): ResultadoValidacaoOS {
  const erros: ErroCampoOS[] = []
  const errosChecklistItens: string[] = []

  if (!form.cliente_id) {
    erros.push({
      campo: 'cliente_id',
      mensagem: 'Selecione um cliente.',
      elementoId: 'os-campo-cliente',
    })
  }

  if (!form.moto_id) {
    erros.push({
      campo: 'moto_id',
      mensagem: 'Selecione uma moto.',
      elementoId: 'os-campo-moto',
    })
  }

  for (const item of form.checklist_entrada.itens) {
    if (item.obrigatorio && !itemChecklistPreenchido(item)) {
      errosChecklistItens.push(item.item_id)
    }
  }

  if (errosChecklistItens.length > 0) {
    erros.push({
      campo: 'checklist',
      mensagem: 'Preencha os itens obrigatórios do checklist.',
      elementoId: 'os-campo-checklist',
    })
  }

  if (
    form.quilometragem_entrada === undefined ||
    form.quilometragem_entrada === null ||
    Number.isNaN(form.quilometragem_entrada)
  ) {
    erros.push({
      campo: 'quilometragem_entrada',
      mensagem: 'Informe a quilometragem de entrada.',
      elementoId: 'km-entrada',
    })
  }

  if (!form.defeito_relatado.trim()) {
    erros.push({
      campo: 'defeito_relatado',
      mensagem: 'Informe o defeito relatado pelo cliente.',
      elementoId: 'defeito',
    })
  }

  if (!form.status) {
    erros.push({
      campo: 'status',
      mensagem: 'Selecione o status da OS.',
      elementoId: 'os-fechamento-status',
    })
  }

  return {
    valido: erros.length === 0,
    mensagemGeral: erros.length
      ? 'Preencha os campos obrigatórios antes de salvar.'
      : '',
    erros,
    errosChecklistItens,
  }
}

export function rolarParaPrimeiroErro(resultado: ResultadoValidacaoOS): void {
  const alvo = resultado.erros[0]?.elementoId
  if (!alvo) return

  requestAnimationFrame(() => {
    document.getElementById(alvo)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

export function obterMensagemErroCampo(
  resultado: ResultadoValidacaoOS | null,
  campo: CampoOSForm
): string | undefined {
  return resultado?.erros.find((e) => e.campo === campo)?.mensagem
}

export function campoTemErro(
  resultado: ResultadoValidacaoOS | null,
  campo: CampoOSForm
): boolean {
  return !!resultado?.erros.some((e) => e.campo === campo)
}

export function removerErroCampo(
  resultado: ResultadoValidacaoOS | null,
  campo: CampoOSForm
): ResultadoValidacaoOS | null {
  if (!resultado) return null

  const erros = resultado.erros.filter((e) => e.campo !== campo)
  const errosChecklistItens =
    campo === 'checklist' ? [] : resultado.errosChecklistItens

  if (erros.length === 0) return null

  return {
    valido: false,
    mensagemGeral: 'Preencha os campos obrigatórios antes de salvar.',
    erros,
    errosChecklistItens,
  }
}
