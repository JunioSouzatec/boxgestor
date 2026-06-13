import { Clock, PackagePlus, Shield, Trash2, Wrench } from 'lucide-react'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { RecursoPlanoGate } from '@/components/plano/RecursoPlanoGate'
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
import {
  aplicarServicoCatalogoNaOS,
  atualizarServicoOSItem,
  removerServicoOSItem,
} from '@/services/servico-catalogo.service'
import {
  mesclarPecasSugeridas,
  sincronizarValorPecasForm,
} from '@/services/os-pecas.service'
import { podeEditarValoresLinhaOS, podeGerenciarLinhasOS } from '@/services/auth/permissions'
import type { PapelUsuario } from '@/types/auth'
import type { OrdemServico, Peca } from '@/types'
import type { ServicoCatalogo } from '@/types/servico-catalogo'
import { formatarMoeda } from '@/lib/utils'

type FormOSServicos = Pick<
  OrdemServico,
  | 'servicos_itens'
  | 'servicos_executados'
  | 'pecas_utilizadas'
  | 'valor_pecas'
  | 'valor_mao_obra'
  | 'dias_garantia'
>

interface ServicosOSSectionProps {
  form: FormOSServicos
  catalogo: ServicoCatalogo[]
  pecas: Peca[]
  papel: PapelUsuario
  onChange: (patch: Partial<FormOSServicos>) => void
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
}: ServicosOSSectionProps) {
  const podeGerenciar = podeGerenciarLinhasOS(papel)
  const podeEditarValor = podeEditarValoresLinhaOS(papel)
  const servicosAtivos = catalogo.filter((s) => s.ativo)
  const itens = form.servicos_itens ?? []

  function adicionarServico(servicoId: string) {
    const servico = catalogo.find((s) => s.id === servicoId)
    if (!servico) return
    onChange(aplicarServicoCatalogoNaOS(form, servico, pecas))
  }

  function removerServico(itemId: string) {
    onChange(removerServicoOSItem(form, itemId))
  }

  function alterarServico(itemId: string, patch: Parameters<typeof atualizarServicoOSItem>[2]) {
    onChange(atualizarServicoOSItem(form, itemId, patch))
  }

  function adicionarPecasSugeridas(itemId: string) {
    const item = itens.find((s) => s.id === itemId)
    if (!item?.pecas_sugeridas?.length) return
    const pecas_utilizadas = mesclarPecasSugeridas(form.pecas_utilizadas ?? [], item.pecas_sugeridas)
    onChange(sincronizarValorPecasForm({ ...form, pecas_utilizadas }))
  }

  return (
    <RecursoPlanoGate recurso="catalogo_servicos">
      <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-primary" />
          <Label className="text-base font-medium">Serviços</Label>
        </div>

        {podeGerenciar && (
          <div className="grid gap-2">
            <Label>Adicionar serviço do catálogo</Label>
            <Select onValueChange={adicionarServico}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um serviço..." />
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

        {itens.length > 0 ? (
          <div className="space-y-3">
            {itens.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-border bg-background/60 p-3 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{item.nome}</p>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
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

                {item.descricao && (
                  <p className="text-sm text-muted-foreground">{item.descricao}</p>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <Label className="text-xs">Valor mão de obra</Label>
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

                {item.pecas_sugeridas && item.pecas_sugeridas.length > 0 && (
                  <div className="rounded-md bg-muted/30 p-2 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Peças sugeridas pelo catálogo (opcional)
                    </p>
                    <ul className="text-sm space-y-0.5 text-muted-foreground">
                      {item.pecas_sugeridas.map((p) => (
                        <li key={p.peca_id}>
                          {p.nome} × {p.quantidade} —{' '}
                          {formatarMoeda(p.quantidade * p.valor_unitario)}
                        </li>
                      ))}
                    </ul>
                    {podeGerenciar && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => adicionarPecasSugeridas(item.id)}
                      >
                        <PackagePlus className="h-4 w-4" />
                        Adicionar peças sugeridas na OS
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor="servicos">Serviços executados</Label>
            <Textarea
              id="servicos"
              value={form.servicos_executados}
              disabled={!podeGerenciar}
              onChange={(e) => onChange({ servicos_executados: e.target.value })}
              placeholder="Descreva os serviços executados"
            />
          </div>
        )}

        {itens.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Total mão de obra dos serviços: {formatarMoeda(form.valor_mao_obra)}
          </p>
        )}
      </div>
    </RecursoPlanoGate>
  )
}
