import { AlertCircle } from 'lucide-react'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { calcularResumoFinanceiroOS } from '@/services/os-financeiro.service'
import {
  calcularLucroEstimadoOS,
  calcularLucroPecasOS,
} from '@/services/os-pecas.service'
import { calcularSomaMaoObraServicos } from '@/services/servico-catalogo.service'
import {
  podeAjustarTotalMaoObraManualOS,
  podeEditarValoresLinhaOS,
} from '@/services/auth/permissions'
import type { PapelUsuario } from '@/types/auth'
import type { AjusteMaoObraOS, LancamentoFinanceiro, MotivoAjusteMaoObraOS, OrdemServico, Peca } from '@/types'
import { MOTIVOS_AJUSTE_MAO_OBRA } from '@/types/ordem-servico'
import { formatarMoeda } from '@/lib/utils'

interface ResumoFinanceiroOSSectionProps {
  form: Pick<
    OrdemServico,
    | 'valor_mao_obra'
    | 'valor_pecas'
    | 'valor_adicional'
    | 'desconto'
    | 'servicos_itens'
    | 'ajuste_mao_obra'
    | 'pecas_utilizadas'
  >
  pecasEstoque?: Peca[]
  valorTotal: number
  os?: OrdemServico | null
  lancamentos: LancamentoFinanceiro[]
  papel: PapelUsuario
  autorizadoPin?: boolean
  onSolicitarAutorizacaoPin?: () => void
  onChange: (patch: Partial<ResumoFinanceiroOSSectionProps['form']>) => void
}

export function ResumoFinanceiroOSSection({
  form,
  valorTotal,
  os,
  lancamentos,
  papel,
  pecasEstoque = [],
  autorizadoPin = false,
  onSolicitarAutorizacaoPin,
  onChange,
}: ResumoFinanceiroOSSectionProps) {
  const podeEditarValor = podeEditarValoresLinhaOS(papel, undefined, { autorizadoPin })
  const podeAjustarTotal = podeAjustarTotalMaoObraManualOS(papel)
  const temServicos = (form.servicos_itens?.length ?? 0) > 0
  const somaServicos = calcularSomaMaoObraServicos(form.servicos_itens)
  const ajusteAtivo = form.ajuste_mao_obra?.ativo ?? false

  const lucroPecas = calcularLucroPecasOS(form.pecas_utilizadas ?? [], pecasEstoque)
  const lucroEstimado = calcularLucroEstimadoOS(form.valor_mao_obra ?? 0, lucroPecas)

  const resumo = calcularResumoFinanceiroOS(
    os ?? {
      id: '',
      status: 'recebida',
      valor_pecas: form.valor_pecas,
      valor_mao_obra: form.valor_mao_obra,
      valor_adicional: form.valor_adicional,
      desconto: form.desconto,
    },
    lancamentos,
    {
      totalGeral: valorTotal,
      camposTotais: {
        valor_pecas: form.valor_pecas,
        valor_mao_obra: form.valor_mao_obra,
        valor_adicional: form.valor_adicional,
        desconto: form.desconto,
      },
    }
  )

  function alternarAjusteManual(ativo: boolean) {
    if (!ativo) {
      onChange({
        ajuste_mao_obra: undefined,
        valor_mao_obra: somaServicos,
      })
      return
    }
    onChange({
      ajuste_mao_obra: {
        ativo: true,
        motivo_tipo: 'outro',
        motivo_texto: '',
      },
      valor_mao_obra: form.valor_mao_obra || somaServicos,
    })
  }

  function atualizarAjuste(patch: Partial<AjusteMaoObraOS>) {
    onChange({
      ajuste_mao_obra: {
        ativo: true,
        motivo_tipo: form.ajuste_mao_obra?.motivo_tipo ?? 'outro',
        motivo_texto: form.ajuste_mao_obra?.motivo_texto ?? '',
        ...patch,
      },
    })
  }

  return (
    <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <Label className="text-base font-medium">Resumo financeiro</Label>

      {temServicos && (
        <p className="text-xs text-muted-foreground">
          Soma dos serviços: {formatarMoeda(somaServicos)}
        </p>
      )}

      {ajusteAtivo && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          Total de mão de obra ajustado manualmente.
        </div>
      )}

      {temServicos && podeAjustarTotal && (
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={ajusteAtivo}
            onChange={(e) => alternarAjusteManual(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Ajustar total de mão de obra manualmente
        </label>
      )}

      {ajusteAtivo && podeAjustarTotal && (
        <div className="grid gap-3 rounded-md border border-border/60 bg-background/40 p-3">
          <div className="grid gap-2">
            <Label htmlFor="motivo-tipo-mao">Motivo do ajuste *</Label>
            <Select
              value={form.ajuste_mao_obra?.motivo_tipo ?? 'outro'}
              onValueChange={(v) =>
                atualizarAjuste({ motivo_tipo: v as MotivoAjusteMaoObraOS })
              }
            >
              <SelectTrigger id="motivo-tipo-mao">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS_AJUSTE_MAO_OBRA.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="motivo-texto-mao">Detalhe do ajuste *</Label>
            <Textarea
              id="motivo-texto-mao"
              rows={2}
              value={form.ajuste_mao_obra?.motivo_texto ?? ''}
              onChange={(e) => atualizarAjuste({ motivo_texto: e.target.value })}
              placeholder="Descreva brevemente o motivo do ajuste"
            />
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="mao_obra_resumo">Total mão de obra</Label>
          <MoneyInput
            id="mao_obra_resumo"
            value={form.valor_mao_obra}
            disabled={
              temServicos
                ? !ajusteAtivo || !podeAjustarTotal
                : !podeEditarValor
            }
            onChange={(valor_mao_obra) => {
              if (!podeEditarValor && !temServicos) {
                onSolicitarAutorizacaoPin?.()
                return
              }
              onChange({ valor_mao_obra })
            }}
          />
          {!podeEditarValor && !temServicos && onSolicitarAutorizacaoPin && (
            <p className="text-xs text-amber-500">
              Toque no campo para solicitar PIN do dono/admin e editar valores.
            </p>
          )}
          {temServicos && !ajusteAtivo && (
            <p className="text-xs text-muted-foreground">
              Calculado pela soma dos serviços. Dono/Gerente podem ajustar manualmente acima.
            </p>
          )}
          {!temServicos && podeEditarValor && (
            <p className="text-xs text-muted-foreground">
              Informe o valor total de mão de obra desta OS.
            </p>
          )}
        </div>
        <div className="grid gap-2">
          <Label>Total peças/produtos</Label>
          <div className="flex h-10 items-center rounded-md border border-border bg-muted/30 px-3 text-sm font-medium">
            {formatarMoeda(form.valor_pecas)}
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="adicional">Valores adicionais aprovados</Label>
          <MoneyInput
            id="adicional"
            value={form.valor_adicional ?? 0}
            disabled={!podeEditarValor}
            onChange={(v) => onChange({ valor_adicional: v || undefined })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="desconto_resumo">Descontos</Label>
          <MoneyInput
            id="desconto_resumo"
            value={form.desconto}
            disabled={!podeEditarValor}
            onChange={(desconto) => onChange({ desconto })}
          />
        </div>
      </div>

      <div className="rounded-md border border-border bg-background/60 p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total geral</span>
          <span className="font-bold text-primary">{formatarMoeda(resumo.totalGeral)}</span>
        </div>
        {(form.pecas_utilizadas?.length ?? 0) > 0 && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Lucro peças/produtos</span>
              <span className="font-medium text-emerald-400">{formatarMoeda(lucroPecas)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Lucro estimado (mão de obra + peças)</span>
              <span className="font-medium text-emerald-400">{formatarMoeda(lucroEstimado)}</span>
            </div>
          </>
        )}
        {os && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Valor pago</span>
              <span className="font-medium text-emerald-400">{formatarMoeda(resumo.valorPago)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Valor pendente</span>
              <span className="font-medium">{formatarMoeda(resumo.valorPendente)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
