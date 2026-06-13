import { useMemo, useState } from 'react'
import { AlertTriangle, Check, X } from 'lucide-react'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  criarPecaUtilizadaDeEstoque,
  filtrarPecasEstoqueParaSugestao,
  inferirUnidadeDaPeca,
  sincronizarValorPecasForm,
  validarAdicaoPecaEstoque,
  verificarEstoqueInsuficiente,
} from '@/services/os-pecas.service'
import { removerPecaSugeridaDoServicoOS } from '@/services/servico-catalogo.service'
import { podeEditarValoresLinhaOS, podeGerenciarLinhasOS } from '@/services/auth/permissions'
import type { PapelUsuario } from '@/types/auth'
import type { OrdemServico, Peca } from '@/types'
import type { PecaSugeridaOSItem, ServicoOSItem } from '@/types/servico-catalogo'
import {
  UNIDADES_PECA_OS,
  formatQuantidadeComUnidade,
  normalizarUnidadePeca,
  parseQuantidadeDecimalComValidacao,
  type UnidadePecaOS,
} from '@/types/unidade-peca'
import { cn, formatarMoeda } from '@/lib/utils'

type FormComPecas = Pick<OrdemServico, 'servicos_itens' | 'pecas_utilizadas' | 'valor_pecas'>

interface SelecaoSugestao {
  peca_id: string
  quantidade: string
  unidade: UnidadePecaOS
  valor_unitario: number
  observacao: string
}

interface PecasSugeridasServicoOSProps {
  servicoItem: ServicoOSItem
  form: FormComPecas
  pecasEstoque: Peca[]
  papel: PapelUsuario
  onChange: (patch: Partial<FormComPecas>) => void
}

function chaveSelecao(servicoId: string, sugestaoId: string) {
  return `${servicoId}:${sugestaoId}`
}

function criarSelecaoInicial(
  sugestao: PecaSugeridaOSItem,
  pecasEstoque: Peca[]
): SelecaoSugestao {
  const opcoes = filtrarPecasEstoqueParaSugestao(pecasEstoque, sugestao)
  const ref =
    (sugestao.peca_referencia_id
      ? opcoes.find((p) => p.id === sugestao.peca_referencia_id)
      : undefined) ?? opcoes[0]

  return {
    peca_id: ref?.id ?? '',
    quantidade: String(sugestao.quantidade),
    unidade: normalizarUnidadePeca(
      sugestao.unidade ?? (ref ? inferirUnidadeDaPeca(ref) : 'unidade')
    ),
    valor_unitario: ref?.preco_venda ?? 0,
    observacao: '',
  }
}

export function PecasSugeridasServicoOS({
  servicoItem,
  form,
  pecasEstoque,
  papel,
  onChange,
}: PecasSugeridasServicoOSProps) {
  const podeGerenciar = podeGerenciarLinhasOS(papel)
  const podeEditarValor = podeEditarValoresLinhaOS(papel)
  const sugestoes = servicoItem.pecas_sugeridas ?? []

  const [selecoes, setSelecoes] = useState<Record<string, SelecaoSugestao>>({})

  const selecoesAtivas = useMemo(() => {
    const mapa: Record<string, SelecaoSugestao> = { ...selecoes }
    for (const s of sugestoes) {
      const key = chaveSelecao(servicoItem.id, s.id)
      if (!mapa[key]) mapa[key] = criarSelecaoInicial(s, pecasEstoque)
    }
    return mapa
  }, [selecoes, sugestoes, servicoItem.id, pecasEstoque])

  if (!sugestoes.length) return null

  function atualizarSelecao(sugestaoId: string, patch: Partial<SelecaoSugestao>) {
    const key = chaveSelecao(servicoItem.id, sugestaoId)
    setSelecoes((prev) => ({
      ...prev,
      [key]: { ...selecoesAtivas[key], ...patch },
    }))
  }

  function aoEscolherPeca(sugestao: PecaSugeridaOSItem, pecaId: string) {
    const peca = pecasEstoque.find((p) => p.id === pecaId)
    atualizarSelecao(sugestao.id, {
      peca_id: pecaId,
      valor_unitario: peca?.preco_venda ?? 0,
      unidade:
        selecoesAtivas[chaveSelecao(servicoItem.id, sugestao.id)]?.unidade ??
        (peca?.categoria === 'oleo' ? 'litro' : 'unidade'),
    })
  }

  function ignorarSugestao(sugestaoId: string) {
    onChange(removerPecaSugeridaDoServicoOS(form, servicoItem.id, sugestaoId))
  }

  function adicionarSugestaoNaOS(sugestao: PecaSugeridaOSItem) {
    const key = chaveSelecao(servicoItem.id, sugestao.id)
    const sel = selecoesAtivas[key]

    const validacao = validarAdicaoPecaEstoque({
      peca_id: sel?.peca_id,
      quantidade: sel?.quantidade,
      unidade: sel?.unidade,
    })
    if (!validacao.valido) {
      window.alert(validacao.mensagem)
      return
    }

    const parse = parseQuantidadeDecimalComValidacao(sel?.quantidade ?? '')
    if (parse.valor === null) {
      window.alert(parse.erro ?? 'Informe a quantidade utilizada.')
      return
    }

    const peca = pecasEstoque.find((p) => p.id === sel.peca_id)
    if (!peca) {
      window.alert('Selecione uma peça do estoque.')
      return
    }

    const quantidade = parse.valor
    const unidade = normalizarUnidadePeca(sel.unidade)
    const novaLinha = criarPecaUtilizadaDeEstoque(peca, quantidade, {
      unidade,
      valor_unitario: sel.valor_unitario,
      observacao: sel.observacao.trim() || undefined,
      servico_item_id: servicoItem.id,
      sugestao_id: sugestao.id,
      pendencia_compra: quantidade > (peca.quantidade ?? 0),
    })

    const pecas_utilizadas = [...(form.pecas_utilizadas ?? []), novaLinha]
    const semSugestao = removerPecaSugeridaDoServicoOS(
      { ...form, pecas_utilizadas },
      servicoItem.id,
      sugestao.id
    )

    onChange(sincronizarValorPecasForm(semSugestao))
  }

  return (
    <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-3">
      <p className="text-sm font-medium text-primary">
        Peças sugeridas para este serviço
      </p>
      <p className="text-xs text-muted-foreground">
        Escolha a peça real do estoque, ajuste quantidade e confirme. Nada é adicionado
        automaticamente.
      </p>

      <div className="space-y-3">
        {sugestoes.map((sugestao) => {
          const key = chaveSelecao(servicoItem.id, sugestao.id)
          const sel = selecoesAtivas[key]
          const opcoes = filtrarPecasEstoqueParaSugestao(pecasEstoque, sugestao)
          const pecaSel = sel?.peca_id ? pecasEstoque.find((p) => p.id === sel.peca_id) : undefined
          const qtd = parseQuantidadeDecimalComValidacao(sel?.quantidade ?? String(sugestao.quantidade))
            .valor ?? sugestao.quantidade
          const total = qtd * (sel?.valor_unitario ?? 0)
          const estoqueInsuficiente = pecaSel ? qtd > pecaSel.quantidade : false

          const alertaSimulado = pecaSel
            ? verificarEstoqueInsuficiente(
                [
                  criarPecaUtilizadaDeEstoque(pecaSel, qtd, {
                    unidade: sel?.unidade,
                    valor_unitario: sel?.valor_unitario ?? 0,
                  }),
                ],
                pecasEstoque
              )
            : []

          return (
            <div
              key={sugestao.id}
              className={cn(
                'rounded-md border bg-background/80 p-3 space-y-3',
                estoqueInsuficiente ? 'border-amber-500/40' : 'border-border'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{sugestao.descricao}</p>
                  <p className="text-xs text-muted-foreground">
                    Sugestão: {formatQuantidadeComUnidade(sugestao.quantidade, sugestao.unidade)}
                  </p>
                </div>
                {podeGerenciar && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => ignorarSugestao(sugestao.id)}
                  >
                    <X className="h-4 w-4" />
                    Ignorar
                  </Button>
                )}
              </div>

              {podeGerenciar && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1 sm:col-span-2">
                      <Label className="text-xs">Peça do estoque *</Label>
                      <Select
                        value={sel?.peca_id || 'none'}
                        onValueChange={(v) =>
                          v !== 'none' && aoEscolherPeca(sugestao, v)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Escolher peça real..." />
                        </SelectTrigger>
                        <SelectContent>
                          {opcoes.length === 0 ? (
                            <SelectItem value="none" disabled>
                              Nenhuma peça compatível no estoque
                            </SelectItem>
                          ) : (
                            opcoes.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.nome} — {formatarMoeda(p.preco_venda)} (estoque:{' '}
                                {p.quantidade})
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-1">
                      <Label className="text-xs">Quantidade</Label>
                      <Input
                        inputMode="decimal"
                        value={sel?.quantidade ?? ''}
                        onChange={(e) =>
                          atualizarSelecao(sugestao.id, { quantidade: e.target.value })
                        }
                      />
                    </div>

                    <div className="grid gap-1">
                      <Label className="text-xs">Unidade</Label>
                      <Select
                        value={normalizarUnidadePeca(sel?.unidade)}
                        onValueChange={(v) =>
                          atualizarSelecao(sugestao.id, { unidade: normalizarUnidadePeca(v) })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UNIDADES_PECA_OS.map((u) => (
                            <SelectItem key={u.value} value={u.value}>
                              {u.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-1">
                      <Label className="text-xs">Valor unitário</Label>
                      <MoneyInput
                        value={sel?.valor_unitario ?? 0}
                        disabled={!podeEditarValor}
                        onChange={(v) => atualizarSelecao(sugestao.id, { valor_unitario: v })}
                      />
                    </div>

                    <div className="grid gap-1">
                      <Label className="text-xs">Valor total</Label>
                      <div className="flex h-10 items-center rounded-md border border-border bg-muted/30 px-3 text-sm font-medium">
                        {formatarMoeda(total)}
                      </div>
                    </div>

                    <div className="grid gap-1 sm:col-span-2">
                      <Label className="text-xs">Observação</Label>
                      <Input
                        value={sel?.observacao ?? ''}
                        placeholder="Opcional"
                        onChange={(e) =>
                          atualizarSelecao(sugestao.id, { observacao: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  {alertaSimulado.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-amber-200">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Estoque insuficiente: disponível {pecaSel?.quantidade ?? 0},{' '}
                      necessário {qtd}
                    </div>
                  )}

                  <Button
                    type="button"
                    size="sm"
                    disabled={!sel?.peca_id}
                    onClick={() => adicionarSugestaoNaOS(sugestao)}
                  >
                    <Check className="h-4 w-4" />
                    Adicionar peça selecionada à OS
                  </Button>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
