import { useEffect, useMemo, useState } from 'react'
import { Mic, Pause, Play, Square, Loader2 } from 'lucide-react'
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

const LABEL_ESTADO: Record<string, string> = {
  idle: 'Pronto para iniciar',
  listening: 'Ouvindo...',
  paused: 'Pausado',
  finished: 'Finalizado — revise a transcrição',
}

export function AvaliacaoPorVozDialog({
  aberto,
  onFechar,
  checklist,
  onAplicar,
}: AvaliacaoPorVozDialogProps) {
  const {
    suportado,
    estado,
    ouvindo,
    transcricao,
    trechos,
    erro,
    avisoSilencio,
    iniciarAvaliacao,
    pausar,
    continuar,
    finalizar,
    abortar,
    limpar,
    setTranscricao,
  } = useSpeechToTextContinuo()

  const [resultado, setResultado] = useState<ResultadoInterpretacaoVoz | null>(null)
  const [textoEditado, setTextoEditado] = useState(false)

  useEffect(() => {
    if (!aberto) {
      abortar()
      limpar()
      setResultado(null)
      setTextoEditado(false)
    }
  }, [aberto, abortar, limpar])

  const alteracoes = resultado?.alteracoes ?? []
  const trechosNaoIdentificados = resultado?.trechosNaoIdentificados ?? []

  function analisarTranscricao(texto: string) {
    const limpo = texto.trim()
    if (!limpo) {
      setResultado(null)
      return
    }
    setResultado(interpretarAvaliacaoVoz(limpo, checklist.itens))
    setTextoEditado(false)
  }

  function handleFinalizar() {
    const texto = finalizar()
    if (texto.trim()) analisarTranscricao(texto)
  }

  function handleAplicar() {
    if (!resultado) return
    const atualizado = aplicarAlteracoesVozAoChecklist(checklist, resultado)
    onAplicar({ ...checklist, ...atualizado })
    onFechar()
  }

  function handleCancelar() {
    abortar()
    limpar()
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

  const mostrarPrevia = estado === 'finished' && resultado != null
  const transcricaoEditavel = estado !== 'listening'

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
            Ande ao redor do veículo, pause entre itens e continue quando quiser. Revise a prévia
            antes de aplicar ao checklist.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={estado === 'listening' ? 'default' : 'secondary'}
              className="gap-1"
            >
              {estado === 'listening' && <Loader2 className="h-3 w-3 animate-spin" />}
              {LABEL_ESTADO[estado] ?? estado}
            </Badge>
          </div>

          <div className="flex flex-wrap gap-2">
            {estado === 'idle' && (
              <Button type="button" onClick={iniciarAvaliacao} className="gap-2">
                <Mic className="h-4 w-4" />
                Iniciar avaliação
              </Button>
            )}

            {estado === 'listening' && (
              <>
                <Button type="button" variant="secondary" onClick={pausar} className="gap-2">
                  <Pause className="h-4 w-4" />
                  Pausar
                </Button>
                <Button type="button" variant="destructive" onClick={handleFinalizar} className="gap-2">
                  <Square className="h-4 w-4 fill-current" />
                  Finalizar avaliação
                </Button>
              </>
            )}

            {estado === 'paused' && (
              <>
                <Button type="button" onClick={continuar} className="gap-2">
                  <Play className="h-4 w-4" />
                  Continuar
                </Button>
                <Button type="button" variant="destructive" onClick={handleFinalizar} className="gap-2">
                  <Square className="h-4 w-4 fill-current" />
                  Finalizar avaliação
                </Button>
              </>
            )}

            {estado === 'finished' && textoEditado && transcricao.trim() && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => analisarTranscricao(transcricao)}
              >
                Analisar novamente
              </Button>
            )}
          </div>

          {avisoSilencio && estado === 'paused' && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              A escuta pausou por silêncio. Clique em Continuar para prosseguir a avaliação.
            </p>
          )}

          {erro && <p className="text-sm text-destructive">{erro}</p>}

          {trechos.length > 0 && (
            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/10 p-3">
              <p className="text-xs font-medium text-muted-foreground">Trechos capturados</p>
              <ul className="space-y-2 text-sm">
                {trechos.map((trecho, i) => (
                  <li key={`${i}-${trecho.slice(0, 24)}`} className="rounded-md bg-background/60 p-2">
                    <span className="text-xs font-medium text-muted-foreground">Trecho {i + 1}</span>
                    <p className="mt-0.5">{trecho}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Transcrição {ouvindo ? '(atualizando em tempo real)' : '(editável)'}
            </p>
            <Textarea
              value={transcricao}
              readOnly={!transcricaoEditavel}
              onChange={(e) => {
                setTranscricao(e.target.value)
                setTextoEditado(true)
                setResultado(null)
              }}
              placeholder={
                estado === 'idle'
                  ? 'Clique em Iniciar avaliação e fale os itens do veículo.'
                  : 'A transcrição aparecerá aqui conforme você fala.'
              }
              rows={5}
              className="text-sm"
            />
          </div>

          {mostrarPrevia && (
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
                    <li
                      key={alt.itemId}
                      className="rounded-md border border-border/60 bg-background/60 p-2"
                    >
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
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={handleCancelar}>
            Cancelar
          </Button>
          {estado === 'finished' && (
            <Button
              type="button"
              onClick={handleAplicar}
              disabled={
                !resultado || (alteracoes.length === 0 && trechosNaoIdentificados.length === 0)
              }
            >
              Aplicar ao checklist
            </Button>
          )}
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
