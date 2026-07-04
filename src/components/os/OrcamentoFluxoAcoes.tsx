import { Check, FileInput, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  podeAprovarOrcamento,
  podeConverterOrcamentoEmOS,
  podeRecusarOrcamento,
} from '@/lib/orcamento-fluxo'
import { ehDocumentoOrcamento } from '@/lib/os-modo-documento'
import type { OrdemServico } from '@/types'

interface OrcamentoFluxoAcoesProps {
  os: OrdemServico
  onAprovar: () => void | Promise<void>
  onRecusar: () => void | Promise<void>
  onConverter: () => void | Promise<void>
  compact?: boolean
  desabilitado?: boolean
}

export function OrcamentoFluxoAcoes({
  os,
  onAprovar,
  onRecusar,
  onConverter,
  compact = false,
  desabilitado = false,
}: OrcamentoFluxoAcoesProps) {
  if (!ehDocumentoOrcamento(os)) return null

  const mostrarAprovar = podeAprovarOrcamento(os)
  const mostrarRecusar = podeRecusarOrcamento(os)
  const mostrarConverter = podeConverterOrcamentoEmOS(os)

  if (!mostrarAprovar && !mostrarRecusar && !mostrarConverter) return null

  const size = compact ? 'sm' : 'default'

  return (
    <div className={`flex flex-wrap gap-2${compact ? '' : ' pt-1'}`}>
      {mostrarAprovar && (
        <Button
          type="button"
          variant="outline"
          size={size}
          disabled={desabilitado}
          className="gap-1.5 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
          onClick={() => void onAprovar()}
        >
          <Check className="h-4 w-4" />
          Aprovar orçamento
        </Button>
      )}
      {mostrarRecusar && (
        <Button
          type="button"
          variant="outline"
          size={size}
          disabled={desabilitado}
          className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={() => void onRecusar()}
        >
          <X className="h-4 w-4" />
          Marcar como recusado
        </Button>
      )}
      {mostrarConverter && (
        <Button
          type="button"
          variant="default"
          size={size}
          disabled={desabilitado}
          className="gap-1.5"
          onClick={() => void onConverter()}
        >
          <FileInput className="h-4 w-4" />
          Converter em OS
        </Button>
      )}
    </div>
  )
}
