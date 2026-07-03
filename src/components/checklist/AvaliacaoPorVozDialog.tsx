import { useEffect, useMemo, useState } from 'react'
import { Mic, Square, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useSpeechToTextContinuo } from '@/hooks/useSpeechToTextContinuo'
import {
  aplicarAlteracoesVozAoChecklist,
  interpretarAvaliacaoVoz,
  type AlteracaoAvaliacaoVoz,
  type ResultadoInterpretacaoVoz,
} from '@/lib/checklist-avaliacao-voz'
import type { ChecklistEntrada } from '@/types/checklist'

interface AvaliacaoPorVozDialogProps {
  aberto: boolean
  onFechar: () => void
  checklist: ChecklistEntrada
  onAplicar: (checklist: ChecklistEntrada) => void
}

export function AvaliacaoPorVozDialog({
  aberto,
  onFechar,
  checklist,
  onAplicar,
}: AvaliacaoPorVozDialogProps) {
  const {
    suportado,
    ouvindo,
    transcricao,
    erro,
    iniciar,
    parar,
    abortar,
    limpar,
    commitTranscricao,
    setTranscricao,
  } = useSpeechToTextContinuo()

  const [resultado, setResultado] = useState<ResultadoInterpretacaoVoz | null>(null)
  const [etapa, setEtapa] = useState<'gravacao' | 'previa'>('gravacao')

  useEffect(() => {
    if (!aberto) {
      abortar()
      limpar()
      setResultado(null)
      setEtapa('gravacao')
    }
  }, [aberto, abortar, limpar])

  const alteracoes = resultado?.alteracoes ?? []
  const trechosNaoIdentificados = resultado?.trechosNaoIdentificados ?? []

  function analisarTranscricao(texto: string) {
    const limpo = texto.trim()
    if (!limpo) {
      setResultado(null)
      setEtapa('gravacao')
      return
    }
    const interpretado = interpretarAvaliacaoVoz(limpo, checklist.itens)
    setResultado(interpretado)
    setEtapa('previa')
  }

  function handleParar() {
    parar()
    window.setTimeout(() => {
      const texto = commitTranscricao()
      if (texto.trim()) analisarTranscricao(texto)
    }, 350)
  }

  function handleAplicar() {
    if (!resultado) return
    const atualizado = aplicarAlteracoesVozAoChecklist(checklist, resultado)
    onAplicar({ ...checklist, ...atualizado })
    onFechar()
  }

  function handleCancelar() {
    abortar()
    onFechar()
  }

  const resumoPreview = useMemo(
    () =>
      alteracoes.map((alt) => ({
        ...alt,
        linha: formatarLinhaPreview(alt),
      })),
    [alteracoes]
  )

  if (!suportado) {
    return (
      <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Avaliação por voz</DialogTitle>
            <DialogDescription>
              Este navegador não suporta ditado por voz. Use a digitação manual nos campos do
              checklist.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end pt-2">
            <Button type="button" variant="outline" onClick={onFechar}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && handleCancelar()}>
      <DialogContent className="flex max-h-[90dvh] max-w-xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Avaliação por voz</DialogTitle>
          <DialogDescription>
            Fale a avaliação completa do veículo. Ex.: &quot;Farol riscado, pneu gasto, tanque
            meio, documento entregue.&quot; Revise a prévia antes de aplicar.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-1">
          <div className="flex flex-wrap gap-2">
            {!ouvindo ? (
              <Button type="button" onClick={iniciar} className="gap-2">
                <Mic className="h-4 w-4" />
                Iniciar gravação
              </Button>
            ) : (
              <Button type="button" variant="destructive" onClick={handleParar} className="gap-2">
                <Square className="h-4 w-4 fill-current" />
                Parar
              </Button>
            )}
            {ouvindo && (
              <Badge variant="secondary" className="gap-1 self-center">
                <Loader2 className="h-3 w-3 animate-spin" />
                Ouvindo...
              </Badge>
            )}
          </div>

          {erro && <p className="text-sm text-destructive">{erro}</p>}

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Transcrição</p>
            <Textarea
              value={transcricao}
              onChange={(e) => {
                setTranscricao(e.target.value)
                setEtapa('gravacao')
                setResultado(null)
              }}
              placeholder="A transcrição aparecerá aqui enquanto você fala, ou digite manualmente."
              rows={5}
              className="text-sm"
            />
            {!ouvindo && transcricao.trim() && etapa === 'gravacao' && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => analisarTranscricao(transcricao)}
              >
                Analisar fala
              </Button>
            )}
          </div>

          {etapa === 'previa' && resultado && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-sm font-semibold">Encontramos estas alterações:</p>
              {resumoPreview.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum item do checklist foi identificado. Ajuste a transcrição ou preencha
                  manualmente.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {resumoPreview.map((alt) => (
                    <li key={alt.itemId} className="rounded-md border border-border/60 bg-background/60 p-2">
                      <p className="font-medium">{alt.nomeItem}</p>
                      <p className="text-muted-foreground">
                        {alt.situacaoLabel !== '—' && (
                          <span>
                            Situação: <span className="text-foreground">{alt.situacaoLabel}</span>
                          </span>
                        )}
                        {alt.observacaoSugerida && (
                          <span>
                            {alt.situacaoLabel !== '—' ? ' — ' : ''}
                            {alt.observacaoSugerida}
                          </span>
                        )}
                      </p>
                      {alt.concatenarObservacao && alt.observacaoExistente && (
                        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                          Observação existente será mantida e complementada com [Voz].
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {trechosNaoIdentificados.length > 0 && (
                <div className="rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 p-2">
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    Trechos não identificados
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {trechosNaoIdentificados.join('; ')}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Serão adicionados às observações gerais da entrada, se você aplicar.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={handleCancelar}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleAplicar}
            disabled={!resultado || (alteracoes.length === 0 && trechosNaoIdentificados.length === 0)}
          >
            Aplicar ao checklist
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function formatarLinhaPreview(alt: AlteracaoAvaliacaoVoz): string {
  const partes: string[] = []
  if (alt.situacaoLabel && alt.situacaoLabel !== '—') partes.push(alt.situacaoLabel)
  if (alt.observacaoSugerida) partes.push(alt.observacaoSugerida)
  return partes.join(' — ')
}
