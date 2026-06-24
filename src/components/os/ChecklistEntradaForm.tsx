import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  adicionarItemExtraChecklist,
  aplicarModeloAoChecklist,
  atualizarRespostaChecklist,
  CATEGORIAS_CHECKLIST,
  garantirChecklistPadrao,
  getLabelCategoriaChecklist,
  obterModelosAtivos,
  TIPOS_RESPOSTA_CHECKLIST,
} from '@/services/checklist-modelo.service'
import { MensagemCampoErro } from '@/components/shared/MensagemCampoErro'
import { cn } from '@/lib/utils'
import { OFFICE_ID } from '@/types/base'
import type { ChecklistEntrada, ModeloChecklist, QualidadeResposta } from '@/types'
import type { TipoOficina } from '@/types/tipo-oficina'
import { TIPO_OFICINA_PADRAO } from '@/types/tipo-oficina'

interface ChecklistEntradaFormProps {
  value: ChecklistEntrada
  onChange: (checklist: ChecklistEntrada) => void
  modelos: ModeloChecklist[]
  officeId?: string
  tipoOficina?: TipoOficina
  errosItens?: string[]
  temErroSecao?: boolean
  mensagemErroSecao?: string
}

function RespostaItem({
  item,
  onChange,
}: {
  item: ChecklistEntrada['itens'][number]
  onChange: (patch: Partial<ChecklistEntrada['itens'][number]>) => void
}) {
  switch (item.tipo_resposta) {
    case 'ok_nao_ok':
      return (
        <Select
          value={
            item.valor_ok === true ? 'ok' : item.valor_ok === false ? 'nao_ok' : 'vazio'
          }
          onValueChange={(v) =>
            onChange({ valor_ok: v === 'ok' ? true : v === 'nao_ok' ? false : undefined })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="vazio">—</SelectItem>
            <SelectItem value="ok">OK</SelectItem>
            <SelectItem value="nao_ok">Não OK</SelectItem>
          </SelectContent>
        </Select>
      )
    case 'sim_nao':
      return (
        <Select
          value={item.valor_ok === true ? 'sim' : item.valor_ok === false ? 'nao' : 'vazio'}
          onValueChange={(v) =>
            onChange({ valor_ok: v === 'sim' ? true : v === 'nao' ? false : undefined })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="vazio">—</SelectItem>
            <SelectItem value="sim">Sim</SelectItem>
            <SelectItem value="nao">Não</SelectItem>
          </SelectContent>
        </Select>
      )
    case 'bom_regular_ruim':
      return (
        <Select
          value={item.valor_qualidade ?? 'vazio'}
          onValueChange={(v) =>
            onChange({
              valor_qualidade:
                v === 'vazio' ? undefined : (v as QualidadeResposta),
            })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="vazio">—</SelectItem>
            <SelectItem value="bom">Bom</SelectItem>
            <SelectItem value="regular">Regular</SelectItem>
            <SelectItem value="ruim">Ruim</SelectItem>
          </SelectContent>
        </Select>
      )
    case 'texto_livre':
      return (
        <Textarea
          value={item.valor_texto ?? ''}
          onChange={(e) => onChange({ valor_texto: e.target.value || undefined })}
          rows={2}
          className="text-xs"
        />
      )
    case 'numero':
      return (
        <Input
          type="number"
          value={item.valor_numero ?? ''}
          onChange={(e) =>
            onChange({
              valor_numero: e.target.value === '' ? undefined : Number(e.target.value),
            })
          }
          className="h-8 text-xs"
        />
      )
    case 'foto_obrigatoria':
      return (
        <p className="text-xs text-muted-foreground">
          Upload de foto — recurso em desenvolvimento
        </p>
      )
    default:
      return null
  }
}

export function ChecklistEntradaForm({
  value,
  onChange,
  modelos,
  officeId,
  tipoOficina = TIPO_OFICINA_PADRAO,
  errosItens = [],
  temErroSecao = false,
  mensagemErroSecao,
}: ChecklistEntradaFormProps) {
  const modelosAtivos = useMemo(
    () => obterModelosAtivos(garantirChecklistPadrao(modelos, officeId ?? OFFICE_ID, tipoOficina)),
    [modelos, officeId, tipoOficina]
  )
  const [extraNome, setExtraNome] = useState('')

  const itensPorCategoria = useMemo(() => {
    const grupos = new Map<string, ChecklistEntrada['itens']>()
    for (const item of [...value.itens].sort((a, b) => a.ordem - b.ordem)) {
      const cat = getLabelCategoriaChecklist(item.categoria)
      const lista = grupos.get(cat) ?? []
      lista.push(item)
      grupos.set(cat, lista)
    }
    return [...grupos.entries()]
  }, [value.itens])

  function trocarModelo(modeloId: string) {
    const modelo = modelosAtivos.find((m) => m.id === modeloId)
    if (!modelo || modelo.id === value.modelo_id) return
    if (
      value.itens.some(
        (i) =>
          i.valor_ok !== undefined ||
          i.valor_qualidade ||
          i.valor_texto ||
          i.valor_numero !== undefined ||
          i.observacao
      ) &&
      !window.confirm(
        'Trocar o modelo recarrega os itens do checklist. As respostas atuais serão substituídas. Continuar?'
      )
    ) {
      return
    }
    onChange(aplicarModeloAoChecklist(value, modelo, false, modelos, officeId ?? OFFICE_ID, tipoOficina))
  }

  function alterarItem(
    itemId: string,
    patch: Partial<ChecklistEntrada['itens'][number]>
  ) {
    onChange(atualizarRespostaChecklist(value, itemId, patch))
  }

  function adicionarExtra() {
    const nome = extraNome.trim()
    if (!nome) return
    onChange(
      adicionarItemExtraChecklist(value, {
        nome,
        categoria: 'outros',
        tipo_resposta: 'ok_nao_ok',
        obrigatorio: false,
      })
    )
    setExtraNome('')
  }

  return (
    <div
      id="os-campo-checklist"
      className={cn(
        'space-y-4 rounded-lg border bg-muted/10 p-4',
        temErroSecao ? 'border-destructive/60' : 'border-border'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">Checklist de Entrada</h4>
          <p className="text-xs text-muted-foreground">
            Modelo: {value.modelo_nome} — respostas salvas apenas nesta OS
          </p>
          <MensagemCampoErro mensagem={mensagemErroSecao} />
          {temErroSecao && errosItens.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-destructive">
              {value.itens
                .filter((item) => errosItens.includes(item.item_id))
                .map((item) => (
                  <li key={item.item_id}>• {item.nome}</li>
                ))}
            </ul>
          )}
        </div>
        <div className="grid min-w-[220px] gap-2">
          <Label className="text-xs">Modelo de checklist</Label>
          <Select value={value.modelo_id} onValueChange={trocarModelo}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o modelo" />
            </SelectTrigger>
            <SelectContent>
              {modelosAtivos.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.nome}
                  {m.padrao ? ' (padrão)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-5">
        {itensPorCategoria.map(([categoria, itens]) => (
          <div key={categoria}>
            <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {categoria}
            </h5>
            <div className="grid gap-3 sm:grid-cols-2">
              {itens.map((item) => {
                const itemInvalido = errosItens.includes(item.item_id)
                return (
                <div
                  key={item.item_id}
                  className={cn(
                    'rounded-lg border p-3',
                    itemInvalido && 'border-destructive/60 bg-destructive/5',
                    !itemInvalido && item.extra && 'border-primary/30 bg-primary/5',
                    !itemInvalido && !item.extra && 'border-border'
                  )}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        {item.nome}
                        {item.obrigatorio && (
                          <span className="ml-1 text-destructive">*</span>
                        )}
                      </p>
                      {item.extra && (
                        <span className="text-[10px] uppercase text-primary">Extra nesta OS</span>
                      )}
                    </div>
                  </div>
                  <RespostaItem
                    item={item}
                    onChange={(patch) => alterarItem(item.item_id, patch)}
                  />
                  <Input
                    placeholder="Observação (opcional)"
                    value={item.observacao ?? ''}
                    onChange={(e) =>
                      alterarItem(item.item_id, {
                        observacao: e.target.value || undefined,
                      })
                    }
                    className="mt-2 h-8 text-xs"
                  />
                  {itemInvalido && (
                    <p className="mt-2 text-xs text-destructive">Resposta obrigatória.</p>
                  )}
                </div>
              )})}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Input
          placeholder="Nome do item extra (somente nesta OS)"
          value={extraNome}
          onChange={(e) => setExtraNome(e.target.value)}
          className="max-w-xs"
        />
        <Button type="button" variant="outline" size="sm" onClick={adicionarExtra}>
          <Plus className="h-4 w-4" />
          Adicionar item extra
        </Button>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="checklist-obs">Observações gerais da entrada</Label>
        <Textarea
          id="checklist-obs"
          value={value.observacoes_gerais ?? ''}
          onChange={(e) => onChange({ ...value, observacoes_gerais: e.target.value })}
          placeholder="Avarias, detalhes da entrega, etc."
          rows={2}
        />
      </div>
    </div>
  )
}

export { CATEGORIAS_CHECKLIST, TIPOS_RESPOSTA_CHECKLIST }
