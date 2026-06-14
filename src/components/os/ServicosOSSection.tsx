import { useState } from 'react'
import { Clock, Plus, Shield, Trash2, Wrench } from 'lucide-react'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { ServicoManualDialog } from '@/components/os/ServicoManualDialog'
import { PecasSugeridasServicoOS } from '@/components/os/PecasSugeridasServicoOS'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAssinatura } from '@/context/AssinaturaContext'
import {
  adicionarServicoManualNaOS,
  aplicarServicoCatalogoNaOS,
  atualizarServicoOSItem,
  calcularSomaMaoObraServicos,
  removerServicoOSItem,
} from '@/services/servico-catalogo.service'
import {
  podeEditarValoresLinhaOS,
  podeGerenciarCatalogoServicos,
  podeGerenciarLinhasOS,
} from '@/services/auth/permissions'
import type { PapelUsuario } from '@/types/auth'
import type { OrdemServico, Peca } from '@/types'
import type { ServicoCatalogo, ServicoOSItem } from '@/types/servico-catalogo'
import { formatarMoeda } from '@/lib/utils'

type FormOSServicos = Pick<
  OrdemServico,
  | 'servicos_itens'
  | 'servicos_executados'
  | 'pecas_utilizadas'
  | 'valor_pecas'
  | 'valor_mao_obra'
  | 'dias_garantia'
  | 'ajuste_mao_obra'
>

interface ServicosOSSectionProps {
  form: FormOSServicos
  catalogo: ServicoCatalogo[]
  pecas: Peca[]
  papel: PapelUsuario
  onChange: (patch: Partial<FormOSServicos>) => void
  onSalvarServicoNoCatalogo?: (item: ServicoOSItem) => void
}

function formatarTempo(minutos?: number): string {
  if (!minutos) return '—'
  if (minutos < 60) return `${minutos} min`
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m ? `${h}h ${m}min` : `${h}h`
}

export function ServicosOSSection({
  form,
  catalogo,
  pecas,
  papel,
  onChange,
  onSalvarServicoNoCatalogo,
}: ServicosOSSectionProps) {
  const { temRecurso } = useAssinatura()
  const podeGerenciar = podeGerenciarLinhasOS(papel)
  const podeEditarValor = podeEditarValoresLinhaOS(papel)
  const podeCatalogo = temRecurso('catalogo_servicos')
  const podeSalvarNoCatalogo = podeGerenciarCatalogoServicos(papel)
  const servicosAtivos = catalogo.filter((s) => s.ativo)
  const itens = form.servicos_itens ?? []
  const [dialogManualAberto, setDialogManualAberto] = useState(false)
  const somaServicos = calcularSomaMaoObraServicos(itens)

  function adicionarDoCatalogo(servicoId: string) {
    const servico = catalogo.find((s) => s.id === servicoId)
    if (!servico) return
    onChange(aplicarServicoCatalogoNaOS(form, servico, pecas))
  }

  function adicionarManual(item: ServicoOSItem, salvarNoCatalogo: boolean) {
    onChange(adicionarServicoManualNaOS(form, item))
    if (salvarNoCatalogo && onSalvarServicoNoCatalogo) {
      onSalvarServicoNoCatalogo(item)
    }
    setDialogManualAberto(false)
  }

  function removerServico(itemId: string) {
    onChange(removerServicoOSItem(form, itemId))
  }

  function alterarServico(itemId: string, patch: Parameters<typeof atualizarServicoOSItem>[2]) {
    onChange(atualizarServicoOSItem(form, itemId, patch))
  }

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-primary" />
          <Label className="text-base font-medium">Serviços e mão de obra</Label>
        </div>
        {podeGerenciar && (
          <Button type="button" size="sm" variant="outline" onClick={() => setDialogManualAberto(true)}>
            <Plus className="h-4 w-4" />
            Adicionar serviço manual
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        O catálogo é apenas sugestão — nome, descrição e valores podem ser alterados nesta OS sem
        modificar o catálogo original.
      </p>

      {podeGerenciar && podeCatalogo && (
        <div className="grid gap-2">
          <Label>Adicionar do catálogo (sugestão)</Label>
          <Select onValueChange={adicionarDoCatalogo}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um serviço do catálogo..." />
            </SelectTrigger>
            <SelectContent>
              {servicosAtivos.length === 0 ? (
                <SelectItem value="_vazio" disabled>
                  Nenhum serviço ativo no catálogo
                </SelectItem>
              ) : (
                servicosAtivos.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome} — {formatarMoeda(s.valor_mao_obra)}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      {podeGerenciar && !podeCatalogo && (
        <p className="text-xs text-amber-200/80 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          Catálogo de serviços disponível no plano Profissional. Use serviço manual ou descreva
          abaixo.
        </p>
      )}

      {!podeEditarValor && podeGerenciar && (
        <p className="text-xs text-muted-foreground rounded-md border border-border px-3 py-2">
          Seu perfil pode adicionar serviços, mas apenas Dono, Gerente ou Recepção podem alterar
          valores de mão de obra.
        </p>
      )}

      {itens.length > 0 ? (
        <div className="space-y-3">
          {itens.map((item) => (
            <div
              key={item.id}
              className="rounded-md border border-border bg-background/60 p-3 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {item.manual ? (
                      <span className="text-[10px] uppercase tracking-wide text-cyan-400/90 font-medium">
                        Manual
                      </span>
                    ) : item.servico_catalogo_id ? (
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                        Catálogo
                      </span>
                    ) : null}
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Nome</Label>
                    <Input
                      value={item.nome}
                      disabled={!podeGerenciar}
                      onChange={(e) => alterarServico(item.id, { nome: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatarTempo(item.tempo_estimado_minutos)}
                    </span>
                    {item.garantia_dias ? (
                      <span className="inline-flex items-center gap-1">
                        <Shield className="h-3 w-3" />
                        {item.garantia_dias} dias
                      </span>
                    ) : null}
                  </div>
                </div>
                {podeGerenciar && (
                  <Button variant="ghost" size="sm" onClick={() => removerServico(item.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                    Remover
                  </Button>
                )}
              </div>

              <div className="grid gap-1">
                <Label className="text-xs">Descrição</Label>
                <Textarea
                  rows={2}
                  value={item.descricao ?? ''}
                  disabled={!podeGerenciar}
                  onChange={(e) =>
                    alterarServico(item.id, { descricao: e.target.value || undefined })
                  }
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1">
                  <Label className="text-xs">Valor mão de obra (nesta OS)</Label>
                  <MoneyInput
                    value={item.valor_mao_obra}
                    disabled={!podeEditarValor}
                    onChange={(v) => alterarServico(item.id, { valor_mao_obra: v })}
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Garantia (dias)</Label>
                  <Input
                    inputMode="numeric"
                    value={item.garantia_dias ?? ''}
                    disabled={!podeGerenciar}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '')
                      alterarServico(item.id, {
                        garantia_dias: v ? parseInt(v, 10) : undefined,
                      })
                    }}
                  />
                </div>
              </div>

              <div className="grid gap-1">
                <Label className="text-xs">Observações</Label>
                <Textarea
                  rows={2}
                  value={item.observacoes ?? ''}
                  disabled={!podeGerenciar}
                  onChange={(e) =>
                    alterarServico(item.id, { observacoes: e.target.value || undefined })
                  }
                />
              </div>

              {!item.manual && item.servico_catalogo_id && (
                <PecasSugeridasServicoOS
                  servicoItem={item}
                  form={form}
                  pecasEstoque={pecas}
                  papel={papel}
                  onChange={onChange}
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-2">
          <Label htmlFor="servicos">Serviços executados (texto livre)</Label>
          <Textarea
            id="servicos"
            value={form.servicos_executados}
            disabled={!podeGerenciar}
            onChange={(e) => onChange({ servicos_executados: e.target.value })}
            placeholder="Descreva os serviços executados ou use “Adicionar serviço manual”"
          />
        </div>
      )}

      {itens.length > 0 && (
        <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Soma dos serviços</span>
            <span className="font-medium">{formatarMoeda(somaServicos)}</span>
          </div>
          {form.ajuste_mao_obra?.ativo && (
            <div className="flex justify-between text-amber-200/90">
              <span>Total na OS (ajustado)</span>
              <span className="font-medium">{formatarMoeda(form.valor_mao_obra)}</span>
            </div>
          )}
        </div>
      )}

      <ServicoManualDialog
        aberto={dialogManualAberto}
        onFechar={() => setDialogManualAberto(false)}
        onConfirmar={adicionarManual}
        podeSalvarNoCatalogo={Boolean(onSalvarServicoNoCatalogo && podeSalvarNoCatalogo)}
      />
    </div>
  )
}
