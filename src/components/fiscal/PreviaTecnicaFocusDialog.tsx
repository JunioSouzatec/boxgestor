/**
 * F6B — Diálogo de prévia técnica Focus (sem envio/emissão).
 * Layout amplo/responsivo — sem alteração de regra fiscal.
 */
import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { montarPreviaTecnicaFocus } from '@/services/fiscal/providers/focus'
import { obterFiscalConfig } from '@/types/fiscal-config'
import type { PreparacaoNotaFiscal } from '@/types/fiscal-preparacao'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { Cliente } from '@/types/cliente'

const AVISO =
  'rounded-md border border-amber-600/50 bg-amber-100 px-3 py-2 text-xs text-amber-950 dark:border-amber-400/70 dark:bg-amber-950/70 dark:text-amber-50 break-words'

const CRITICO =
  'rounded-md border border-red-600/50 bg-red-100 px-3 py-2 text-xs text-red-950 dark:border-red-400/70 dark:bg-red-950/70 dark:text-red-50 break-words'

const INFO =
  'rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground/80 break-words'

interface PreviaTecnicaFocusDialogProps {
  aberto: boolean
  onFechar: () => void
  preparacao: PreparacaoNotaFiscal | null
  configuracao?: ConfiguracaoOficina | null
  cliente?: Cliente | null
}

export function PreviaTecnicaFocusDialog({
  aberto,
  onFechar,
  preparacao,
  configuracao,
  cliente,
}: PreviaTecnicaFocusDialogProps) {
  const previa = useMemo(() => {
    if (!preparacao || !aberto) return null
    const fiscalConfig = obterFiscalConfig(configuracao)
    return montarPreviaTecnicaFocus({
      preparacao,
      configuracao,
      fiscalConfig,
      cliente,
    })
  }, [preparacao, configuracao, cliente, aberto])

  if (!preparacao || !previa) return null

  const payloadJson = JSON.stringify(previa.payload_sanitizado, null, 2)

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent
        className={cn(
          // Sobrescreve o max-w-lg padrão do Dialog no desktop
          'flex w-[95vw] max-w-[95vw] flex-col gap-0 overflow-hidden p-0',
          'max-h-[95dvh]',
          'max-lg:inset-x-2 max-lg:bottom-2 max-lg:top-auto max-lg:max-h-[95dvh] max-lg:rounded-2xl max-lg:border max-lg:p-0',
          'lg:left-[50%] lg:top-[50%] lg:w-[90vw] lg:max-w-6xl lg:translate-x-[-50%] lg:translate-y-[-50%] lg:rounded-lg lg:p-0',
          'lg:max-h-[90vh]'
        )}
      >
        <div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 pb-3 pt-4 pr-12 sm:px-6 sm:pt-5">
          <DialogHeader className="space-y-0 text-left">
            <DialogTitle>Prévia técnica Focus</DialogTitle>
          </DialogHeader>
          <p className={AVISO}>
            Prévia técnica interna. Não envia dados para a Focus. Não emite nota fiscal.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-foreground/70">Provedor</p>
              <p className="break-words font-semibold text-foreground">{previa.provedor}</p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-foreground/70">Ambiente desejado</p>
              <p className="break-words font-semibold text-foreground">
                {previa.ambiente_desejado}
              </p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-foreground/70">Tipo interno</p>
              <p className="break-words font-semibold text-foreground">{previa.tipo_interno}</p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-foreground/70">Status</p>
              <p className="break-words font-semibold text-foreground">
                {previa.status_emissao}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                'font-semibold',
                previa.pronto_tecnicamente
                  ? 'border-emerald-400/70 bg-emerald-950 text-emerald-100'
                  : 'border-amber-400/70 bg-amber-950 text-amber-100'
              )}
            >
              {previa.pronto_tecnicamente
                ? 'Pronto tecnicamente (sem emissão)'
                : 'Com bloqueios técnicos'}
            </Badge>
            <Badge variant="outline" className="border-border text-muted-foreground">
              {previa.chamada_externa}
            </Badge>
          </div>

          {previa.avisos.length > 0 ? (
            <ul className="space-y-1.5">
              {previa.avisos.map((a) => (
                <li key={a} className={AVISO}>
                  {a}
                </li>
              ))}
            </ul>
          ) : null}

          <section className="space-y-2">
            <h3 className="font-semibold text-foreground">Validação técnica</h3>
            {previa.validacao.bloqueios.length === 0 &&
            previa.validacao.alertas.length === 0 ? (
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                Sem bloqueios críticos na validação técnica interna.
              </p>
            ) : null}
            {previa.validacao.bloqueios.map((b) => (
              <p key={b.id} className={CRITICO}>
                Bloqueio · {b.mensagem}
              </p>
            ))}
            {previa.validacao.alertas.map((a) => (
              <p key={a.id} className={AVISO}>
                Atenção · {a.mensagem}
              </p>
            ))}
            {previa.validacao.informativos.map((i) => (
              <p key={i.id} className={INFO}>
                Info · {i.mensagem}
              </p>
            ))}
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-foreground">Payload sanitizado</h3>
            <p className="text-xs text-foreground/70">
              Sem token, certificado, senha, XML autorizado, chave, protocolo ou número fiscal
              oficial.
            </p>
            <div className="max-h-[min(50vh,28rem)] overflow-x-auto overflow-y-auto rounded-md border border-border bg-muted/30">
              <pre className="inline-block min-w-full p-3 font-mono text-[11px] leading-relaxed text-foreground sm:text-xs whitespace-pre">
                {payloadJson}
              </pre>
            </div>
          </section>
        </div>

        <div className="flex shrink-0 justify-end border-t border-border bg-card px-4 py-3 sm:px-6">
          <Button type="button" variant="outline" onClick={onFechar}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
