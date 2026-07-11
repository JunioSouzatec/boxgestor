import { useMemo, useState } from 'react'
import { Clock, Plus, Shield, Trash2, Wrench } from 'lucide-react'
import { MoneyInputComPin } from '@/components/os/MoneyInputComPin'
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
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import { useAutorizacaoValores } from '@/context/AutorizacaoValoresContext'
import { useToast } from '@/context/ToastContext'
import {
  adicionarServicoManualNaOS,
  aplicarServicoCatalogoNaOS,
  atualizarServicoOSItem,
  calcularSomaMaoObraServicos,
  osJaTemServicoCatalogo,
  removerServicoOSItem,
} from '@/services/servico-catalogo.service'
import {
  podeEditarValoresLinhaOS,
  podeGerenciarCatalogoServicos,
  podeGerenciarLinhasOS,
} from '@/services/auth/permissions'
import { MSG } from '@/lib/mensagens-usuario'
import type { AuthUser } from '@/types/auth'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { OrdemServico, Peca } from '@/types'
import type { ServicoCatalogo, ServicoOSItem } from '@/types/servico-catalogo'
import { formatarMoeda } from '@/lib/utils'
import {
  buildCampoPinServicoValor,
} from '@/lib/campo-pin-os'

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

export type ServicosOSOnChange = (
  update: Partial<FormOSServicos> | ((prev: FormOSServicos) => Partial<FormOSServicos>)
) => void

interface ServicosOSSectionProps {
  form: FormOSServicos
  catalogo: ServicoCatalogo[]
  pecas: Peca[]
  user: AuthUser | null
  configuracao: ConfiguracaoOficina
  onSolicitarAutorizacaoPin?: (campoId: string) => void | Promise<boolean | void>
  onRegistrarAlteracaoValor?: (
    campo: string,
    valorAnterior: number,
    valorNovo: number,
    detalhe?: string
  ) => void
  onChange: ServicosOSOnChange
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
  user,
  configuracao,
  onSolicitarAutorizacaoPin,
  onRegistrarAlteracaoValor,
  onChange,
  onSalvarServicoNoCatalogo,
}: ServicosOSSectionProps) {
  const { temRecurso } = useAssinatura()
  const { confirmar } = useConfirmacao()
  const { toast } = useToast()
  const { limparAutorizacao } = useAutorizacaoValores()
  const authRef = user ?? 'dono'
  const ehMecanico = user?.papel === 'mecanico'
  const podeGerenciar = podeGerenciarLinhasOS(authRef, configuracao)
  const podeEditarValorDireto = podeEditarValoresLinhaOS(authRef, configuracao)
  const podeCatalogo = temRecurso('catalogo_servicos')
  const podeSalvarNoCatalogo = podeGerenciarCatalogoServicos(authRef)
  const servicosAtivos = useMemo(() => catalogo.filter((s) => s.ativo), [catalogo])
  const itens = form.servicos_itens ?? []
  const [dialogManualAberto, setDialogManualAberto] = useState(false)
  const [catalogoSelecionado, setCatalogoSelecionado] = useState('')
  const [selectCatalogoKey, setSelectCatalogoKey] = useState(0)
  const somaServicos = calcularSomaMaoObraServicos(itens)

  function emitChange(
    update: Partial<FormOSServicos> | ((prev: FormOSServicos) => Partial<FormOSServicos>)
  ) {
    onChange(update)
  }

  function resetarSeletorCatalogo() {
    setCatalogoSelecionado('')
    setSelectCatalogoKey((k) => k + 1)
  }

  async function adicionarDoCatalogo(servicoId: string) {
    if (!servicoId || servicoId === '_vazio') return

    const servico = catalogo.find((s) => s.id === servicoId)
    if (!servico) {
      resetarSeletorCatalogo()
      return
    }

    if (osJaTemServicoCatalogo(itens, servicoId)) {
      const ok = await confirmar({
        titulo: MSG.servicoDuplicadoTitulo,
        mensagem: MSG.servicoDuplicadoMensagem,
        confirmarTexto: MSG.servicoDuplicadoConfirmar,
        cancelarTexto: 'Cancelar',
      })
      if (!ok) {
        resetarSeletorCatalogo()
        return
      }
    }

    emitChange((prev) => aplicarServicoCatalogoNaOS(prev, servico, pecas))
    resetarSeletorCatalogo()
    toast.sucesso(MSG.servicoAdicionado)
  }

  function adicionarManual(item: ServicoOSItem, salvarNoCatalogo: boolean) {
    emitChange((prev) => adicionarServicoManualNaOS(prev, item))
    if (salvarNoCatalogo && onSalvarServicoNoCatalogo) {
      onSalvarServicoNoCatalogo(item)
    }
    setDialogManualAberto(false)
    toast.sucesso(MSG.servicoAdicionado)
  }

  function removerServico(itemId: string) {
    limparAutorizacao()
    emitChange((prev) => removerServicoOSItem(prev, itemId))
    toast.sucesso(MSG.servicoRemovido)
  }

  function alterarServico(itemId: string, patch: Parameters<typeof atualizarServicoOSItem>[2]) {
    emitChange((prev) => atualizarServicoOSItem(prev, itemId, patch))
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
          <Label>Adicionar serviço do catálogo</Label>
          <Select
            key={selectCatalogoKey}
            value={catalogoSelecionado}
            onValueChange={(id) => {
              setCatalogoSelecionado(id)
              void adicionarDoCatalogo(id)
            }}
          >
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

      {!podeEditarValorDireto && podeGerenciar && ehMecanico && (
        <p className="text-xs text-muted-foreground rounded-md border border-border px-3 py-2">
          Você pode adicionar serviços. Para alterar valores, use &quot;Alterar com PIN&quot;.
        </p>
      )}

      {!podeEditarValorDireto && podeGerenciar && !ehMecanico && (
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
                  <MoneyInputComPin
                    user={user}
                    configuracao={configuracao}
                    campoPinId={buildCampoPinServicoValor(item.id)}
                    campoHistorico={`Serviço "${item.nome}" — valor mão de obra`}
                    onSolicitarAutorizacaoPin={onSolicitarAutorizacaoPin}
                    onRegistrarAlteracaoValor={onRegistrarAlteracaoValor}
                    value={item.valor_mao_obra}
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
                  user={user}
                  configuracao={configuracao}
                  onSolicitarAutorizacaoPin={onSolicitarAutorizacaoPin}
                  onRegistrarAlteracaoValor={onRegistrarAlteracaoValor}
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
            onChange={(e) => emitChange({ servicos_executados: e.target.value })}
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
