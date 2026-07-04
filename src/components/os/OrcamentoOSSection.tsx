import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { StatusOrcamentoBadge } from '@/components/shared/StatusBadges'
import { OrcamentoFluxoAcoes } from '@/components/os/OrcamentoFluxoAcoes'
import { obterStatusOrcamentoEfetivo } from '@/lib/orcamento-fluxo'
import type { StatusOrcamento } from '@/types'
import type { OrdemServico } from '@/types'

interface OrcamentoOSSectionProps {
  dataOrcamento?: string
  dataValidade?: string
  statusOrcamento?: StatusOrcamento
  observacoesOrcamento?: string
  osParaAcoes?: OrdemServico
  onChange: (dados: {
    data_orcamento?: string
    data_previsao?: string
    status_orcamento?: StatusOrcamento
    observacoes_orcamento?: string
  }) => void
  onAprovar?: () => void | Promise<void>
  onRecusar?: () => void | Promise<void>
  onConverter?: () => void | Promise<void>
  acoesDesabilitadas?: boolean
}

export function OrcamentoOSSection({
  dataOrcamento,
  dataValidade,
  statusOrcamento,
  observacoesOrcamento,
  osParaAcoes,
  onChange,
  onAprovar,
  onRecusar,
  onConverter,
  acoesDesabilitadas = false,
}: OrcamentoOSSectionProps) {
  const statusEfetivo = statusOrcamento ?? 'rascunho'

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">Orçamento</h4>
          <p className="text-xs text-muted-foreground">
            Não entra no fluxo operacional até ser aprovado e convertido em OS
          </p>
        </div>
        <StatusOrcamentoBadge status={statusEfetivo} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="data-orcamento">Data do orçamento</Label>
          <Input
            id="data-orcamento"
            type="date"
            value={dataOrcamento ?? ''}
            onChange={(e) =>
              onChange({
                data_orcamento: e.target.value || undefined,
                data_previsao: dataValidade,
                status_orcamento: statusOrcamento,
                observacoes_orcamento: observacoesOrcamento,
              })
            }
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="validade-orcamento">Validade do orçamento</Label>
          <Input
            id="validade-orcamento"
            type="date"
            value={dataValidade ?? ''}
            onChange={(e) =>
              onChange({
                data_orcamento: dataOrcamento,
                data_previsao: e.target.value || undefined,
                status_orcamento: statusOrcamento,
                observacoes_orcamento: observacoesOrcamento,
              })
            }
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="obs-orcamento">Observações do orçamento</Label>
          <Textarea
            id="obs-orcamento"
            rows={2}
            value={observacoesOrcamento ?? ''}
            placeholder="Ex.: valores sujeitos a alteração após desmontagem"
            onChange={(e) =>
              onChange({
                data_orcamento: dataOrcamento,
                data_previsao: dataValidade,
                status_orcamento: statusOrcamento,
                observacoes_orcamento: e.target.value || undefined,
              })
            }
          />
        </div>
      </div>

      {osParaAcoes && onAprovar && onRecusar && onConverter && (
        <OrcamentoFluxoAcoes
          os={{
            ...osParaAcoes,
            status_orcamento: obterStatusOrcamentoEfetivo({
              modo_documento: 'orcamento',
              status_orcamento: statusEfetivo,
            }),
          }}
          onAprovar={onAprovar}
          onRecusar={onRecusar}
          onConverter={onConverter}
          desabilitado={acoesDesabilitadas}
        />
      )}
    </div>
  )
}
