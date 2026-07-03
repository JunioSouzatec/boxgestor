import {
  formatarRespostaChecklist,
  getLabelCategoriaChecklist,
} from '@/services/checklist-modelo.service'
import {
  ehItemCombustivelChecklist,
  formatarCombustivelChecklist,
} from '@/lib/combustivel-checklist'
import type { ChecklistEntrada } from '@/types/checklist'

interface ChecklistResumoVisualProps {
  checklist: ChecklistEntrada
  compacto?: boolean
}

function formatarSituacaoItem(item: ChecklistEntrada['itens'][number]): string {
  if (ehItemCombustivelChecklist(item)) {
    return formatarCombustivelChecklist(item)
  }
  return formatarRespostaChecklist(item)
}

export function ChecklistResumoVisual({ checklist, compacto = false }: ChecklistResumoVisualProps) {
  const itensComResposta = checklist.itens.filter((item) => {
    const situacao = formatarSituacaoItem(item)
    return situacao !== '—' || Boolean(item.observacao?.trim())
  })

  if (itensComResposta.length === 0 && !checklist.observacoes_gerais?.trim()) {
    return <p className="text-sm text-muted-foreground">Nenhum item do checklist preenchido.</p>
  }

  const porCategoria = new Map<string, ChecklistEntrada['itens']>()
  for (const item of itensComResposta) {
    const cat = getLabelCategoriaChecklist(item.categoria)
    const lista = porCategoria.get(cat) ?? []
    lista.push(item)
    porCategoria.set(cat, lista)
  }

  return (
    <div className={compacto ? 'space-y-3' : 'space-y-4'}>
      {[...porCategoria.entries()].map(([categoria, itens]) => (
        <div key={categoria}>
          {!compacto && (
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {categoria}
            </h4>
          )}
          <ul className="space-y-2">
            {itens.map((item) => {
              const situacao = formatarSituacaoItem(item)
              const obsCombustivel =
                ehItemCombustivelChecklist(item) && item.observacao?.trim()
                  ? item.observacao.trim()
                  : undefined
              const observacao =
                obsCombustivel ??
                (ehItemCombustivelChecklist(item) ? undefined : item.observacao?.trim())

              return (
                <li
                  key={item.item_id}
                  className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm"
                >
                  <p className="font-medium">{item.nome}</p>
                  <p className="text-muted-foreground">
                    <span className="text-foreground/80">Situação:</span> {situacao}
                  </p>
                  {!ehItemCombustivelChecklist(item) && (
                    <p className="text-muted-foreground">
                      <span className="text-foreground/80">Observação:</span>{' '}
                      {observacao || '—'}
                    </p>
                  )}
                  {ehItemCombustivelChecklist(item) && observacao && (
                    <p className="text-muted-foreground">
                      <span className="text-foreground/80">Observação:</span> {observacao}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      {checklist.observacoes_gerais?.trim() && (
        <div className="rounded-lg border border-border bg-muted/10 px-3 py-2 text-sm">
          <p className="font-medium">Observações gerais</p>
          <p className="text-muted-foreground whitespace-pre-wrap">{checklist.observacoes_gerais}</p>
        </div>
      )}
    </div>
  )
}
