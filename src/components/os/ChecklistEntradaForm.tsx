import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Mic, Plus } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  adicionarItemExtraChecklist,
  aplicarModeloAoChecklist,
  atualizarRespostaChecklist,
  CATEGORIAS_CHECKLIST,
  garantirChecklistPadrao,
  getLabelCategoriaChecklist,
  itemExigeFotoChecklist,
  obterModelosAtivos,
  TIPOS_RESPOSTA_CHECKLIST,
} from '@/services/checklist-modelo.service'
import { MensagemCampoErro } from '@/components/shared/MensagemCampoErro'
import { AvaliacaoPorVozDialog } from '@/components/checklist/AvaliacaoPorVozDialog'
import { ChecklistItemFotos } from '@/components/os/ChecklistItemFotos'
import { cn } from '@/lib/utils'
import {
  MSG_CHECKLIST_FOTO_OBRIGATORIA,
  MSG_CHECKLIST_FOTO_OFFLINE,
} from '@/lib/os-form-validation'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import {
  OPCOES_COMBUSTIVEL,
  ehItemCombustivelChecklist,
  extrairValorCombustivel,
  patchCombustivelChecklist,
  type ValorCombustivel,
} from '@/lib/combustivel-checklist'
import { OFFICE_ID } from '@/types/base'
import { useToast } from '@/context/ToastContext'
import {
  carregarFotosOsComPendentesLocais,
  revogarObjectUrls,
} from '@/services/os/offline-service-order-photos.service'
import {
  contarFotosPorItemChecklist,
  FOTOS_OS_ATUALIZADAS_EVENT,
  type FotosOsAtualizadasDetail,
  type ServiceOrderPhotoComUrl,
} from '@/services/os/service-order-photos.service'
import type { ChecklistEntrada, ModeloChecklist, QualidadeResposta } from '@/types'
import type { TipoOficina } from '@/types/tipo-oficina'
import { TIPO_OFICINA_PADRAO } from '@/types/tipo-oficina'
import type { PapelUsuario } from '@/types/auth'

interface ChecklistEntradaFormProps {
  value: ChecklistEntrada
  onChange: (checklist: ChecklistEntrada) => void
  modelos: ModeloChecklist[]
  officeId?: string
  tipoOficina?: TipoOficina
  errosItens?: string[]
  mensagensErroItens?: Record<string, string>
  temErroSecao?: boolean
  mensagemErroSecao?: string
  /** OS já salva — necessária para upload de fotos do checklist */
  osId?: string
  osNumero?: number
  podeAdicionarFoto?: boolean
  createdBy?: string
  createdByName?: string
  userPapel?: PapelUsuario | string
  ehAdminSistema?: boolean
  /** Expõe contagem de fotos por item para validação no salvar */
  onContagemFotosChange?: (contagem: Record<string, number>) => void
  /**
   * Fonte única de fotos (pai). Quando informado, este form não chama
   * listarFotosOSComUrls nem escuta o evento global.
   */
  fotosOS?: ServiceOrderPhotoComUrl[]
  /** Recarrega a fonte única; retorna a lista atualizada */
  onRecarregarFotos?: (opcoes?: {
    osId?: string
    osNumero?: number
  }) => Promise<ServiceOrderPhotoComUrl[]>
  /** OS nova: prepara rascunho antes do upload de foto do checklist */
  onPrepararOsParaFoto?: () => Promise<{ id: string; numero?: number } | null>
}

function CombustivelResposta({
  item,
  onChange,
}: {
  item: ChecklistEntrada['itens'][number]
  onChange: (patch: Partial<ChecklistEntrada['itens'][number]>) => void
}) {
  const valor = extrairValorCombustivel(item)
  return (
    <Select
      value={valor || 'vazio'}
      onValueChange={(v) => onChange(patchCombustivelChecklist(v as ValorCombustivel))}
    >
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder="Nível do tanque" />
      </SelectTrigger>
      <SelectContent>
        {OPCOES_COMBUSTIVEL.map((op) => (
          <SelectItem key={op.value} value={op.value}>
            {op.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function RespostaItem({
  item,
  onChange,
}: {
  item: ChecklistEntrada['itens'][number]
  onChange: (patch: Partial<ChecklistEntrada['itens'][number]>) => void
}) {
  if (ehItemCombustivelChecklist(item)) {
    return <CombustivelResposta item={item} onChange={onChange} />
  }
  switch (item.tipo_resposta) {
    case 'ok_nao_ok':
      return (
        <Select
          value={
            item.valor_ok === true ? 'ok' : item.valor_ok === false ? 'nao_ok' : 'vazio'
          }
          onValueChange={(v) =>
            onChange({ valor_ok: v === 'ok' ? true : v === 'nao_ok' ? false : undefined })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="vazio">—</SelectItem>
            <SelectItem value="ok">OK</SelectItem>
            <SelectItem value="nao_ok">Não OK</SelectItem>
          </SelectContent>
        </Select>
      )
    case 'sim_nao':
      return (
        <Select
          value={item.valor_ok === true ? 'sim' : item.valor_ok === false ? 'nao' : 'vazio'}
          onValueChange={(v) =>
            onChange({ valor_ok: v === 'sim' ? true : v === 'nao' ? false : undefined })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="vazio">—</SelectItem>
            <SelectItem value="sim">Sim</SelectItem>
            <SelectItem value="nao">Não</SelectItem>
          </SelectContent>
        </Select>
      )
    case 'bom_regular_ruim':
      return (
        <Select
          value={item.valor_qualidade ?? 'vazio'}
          onValueChange={(v) =>
            onChange({
              valor_qualidade:
                v === 'vazio' ? undefined : (v as QualidadeResposta),
            })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="vazio">—</SelectItem>
            <SelectItem value="bom">Bom</SelectItem>
            <SelectItem value="regular">Regular</SelectItem>
            <SelectItem value="ruim">Ruim</SelectItem>
          </SelectContent>
        </Select>
      )
    case 'texto_livre':
      return (
        <Input
          value={item.valor_texto ?? ''}
          onChange={(e) => onChange({ valor_texto: e.target.value || undefined })}
          className="h-8 text-xs"
        />
      )
    case 'numero':
      return (
        <Input
          type="number"
          value={item.valor_numero ?? ''}
          onChange={(e) =>
            onChange({
              valor_numero: e.target.value === '' ? undefined : Number(e.target.value),
            })
          }
          className="h-8 text-xs"
        />
      )
    case 'foto_obrigatoria':
      return (
        <p className="text-xs text-muted-foreground">
          Anexe a foto abaixo para registrar este item.
        </p>
      )
    default:
      return null
  }
}

function patchConcluiResposta(
  patch: Partial<ChecklistEntrada['itens'][number]>
): boolean {
  if ('valor_ok' in patch && patch.valor_ok !== undefined) return true
  if ('valor_qualidade' in patch && patch.valor_qualidade !== undefined) return true
  if ('valor_texto' in patch && !!patch.valor_texto?.trim()) return true
  if ('valor_numero' in patch && patch.valor_numero !== undefined) return true
  return false
}

export function ChecklistEntradaForm({
  value,
  onChange,
  modelos,
  officeId,
  tipoOficina = TIPO_OFICINA_PADRAO,
  errosItens = [],
  mensagensErroItens = {},
  temErroSecao = false,
  mensagemErroSecao,
  osId,
  osNumero,
  podeAdicionarFoto = true,
  createdBy,
  createdByName,
  userPapel,
  ehAdminSistema,
  onContagemFotosChange,
  fotosOS: fotosOSControladas,
  onRecarregarFotos,
  onPrepararOsParaFoto,
}: ChecklistEntradaFormProps) {
  const { toast } = useToast()
  const online = useOnlineStatus()
  const modelosAtivos = useMemo(
    () => obterModelosAtivos(garantirChecklistPadrao(modelos, officeId ?? OFFICE_ID, tipoOficina)),
    [modelos, officeId, tipoOficina]
  )
  const [extraNome, setExtraNome] = useState('')
  const [avaliacaoVozAberta, setAvaliacaoVozAberta] = useState(false)
  const fotosControladas = fotosOSControladas !== undefined
  const [fotosOsLocal, setFotosOsLocal] = useState<ServiceOrderPhotoComUrl[]>([])
  const carregarFotosSeqRef = useRef(0)
  const objectUrlsLocaisRef = useRef<string[]>([])

  const carregarFotosLocal = useCallback(
    async (ctx?: {
      osId?: string
      osNumero?: number
    }): Promise<ServiceOrderPhotoComUrl[]> => {
      const seq = ++carregarFotosSeqRef.current
      const idCarregar = (ctx?.osId ?? osId)?.trim()
      const numeroCarregar = ctx?.osNumero ?? osNumero
      if (!idCarregar || !officeId) {
        if (carregarFotosSeqRef.current !== seq) return []
        revogarObjectUrls(objectUrlsLocaisRef.current)
        objectUrlsLocaisRef.current = []
        setFotosOsLocal([])
        onContagemFotosChange?.({})
        return []
      }
      const resultado = await carregarFotosOsComPendentesLocais({
        officeId,
        serviceOrderId: idCarregar,
        osNumero: numeroCarregar,
      })
      if (carregarFotosSeqRef.current !== seq) {
        if (resultado.ok && resultado.dados) {
          revogarObjectUrls(resultado.dados.objectUrls)
        }
        return resultado.ok && resultado.dados ? resultado.dados.fotos : []
      }
      revogarObjectUrls(objectUrlsLocaisRef.current)
      objectUrlsLocaisRef.current = []
      if (!resultado.ok || !resultado.dados) {
        setFotosOsLocal([])
        onContagemFotosChange?.({})
        return []
      }
      objectUrlsLocaisRef.current = resultado.dados.objectUrls
      setFotosOsLocal(resultado.dados.fotos)
      onContagemFotosChange?.(contarFotosPorItemChecklist(resultado.dados.fotos))
      return resultado.dados.fotos
    },
    [osId, officeId, osNumero, onContagemFotosChange]
  )

  useEffect(() => {
    return () => {
      revogarObjectUrls(objectUrlsLocaisRef.current)
      objectUrlsLocaisRef.current = []
    }
  }, [])

  // Modo legado: só carrega/escuta se o pai não forneceu a fonte única
  useEffect(() => {
    if (fotosControladas) return
    void carregarFotosLocal()
  }, [fotosControladas, carregarFotosLocal])

  useEffect(() => {
    if (fotosControladas) return
    const osIdAtual = osId?.trim()
    if (!osIdAtual) return

    function onFotosAtualizadas(ev: Event) {
      const detail = (ev as CustomEvent<FotosOsAtualizadasDetail>).detail
      const idEvento = detail?.serviceOrderId?.trim()
      if (!idEvento || idEvento !== osIdAtual) return
      void carregarFotosLocal()
    }

    window.addEventListener(FOTOS_OS_ATUALIZADAS_EVENT, onFotosAtualizadas)
    return () => {
      window.removeEventListener(FOTOS_OS_ATUALIZADAS_EVENT, onFotosAtualizadas)
    }
  }, [fotosControladas, osId, carregarFotosLocal])

  const fotosOs = fotosControladas ? fotosOSControladas : fotosOsLocal

  useEffect(() => {
    if (!fotosControladas) return
    onContagemFotosChange?.(contarFotosPorItemChecklist(fotosOs))
  }, [fotosControladas, fotosOs, onContagemFotosChange])

  const fotosPorItem = useMemo(() => {
    const mapa = new Map<string, ServiceOrderPhotoComUrl[]>()
    for (const foto of fotosOs) {
      const itemId = foto.checklist_item_id?.trim()
      if (!itemId) continue
      const lista = mapa.get(itemId) ?? []
      lista.push(foto)
      mapa.set(itemId, lista)
    }
    return mapa
  }, [fotosOs])

  const contagemPorItem = useMemo(
    () => contarFotosPorItemChecklist(fotosOs),
    [fotosOs]
  )

  const itensPorCategoria = useMemo(() => {
    const grupos = new Map<string, ChecklistEntrada['itens']>()
    for (const item of [...value.itens].sort((a, b) => a.ordem - b.ordem)) {
      const cat = getLabelCategoriaChecklist(item.categoria)
      const lista = grupos.get(cat) ?? []
      lista.push(item)
      grupos.set(cat, lista)
    }
    return [...grupos.entries()]
  }, [value.itens])

  function trocarModelo(modeloId: string) {
    const modelo = modelosAtivos.find((m) => m.id === modeloId)
    if (!modelo || modelo.id === value.modelo_id) return
    if (
      value.itens.some(
        (i) =>
          i.valor_ok !== undefined ||
          i.valor_qualidade ||
          i.valor_texto ||
          i.valor_numero !== undefined ||
          i.observacao
      ) &&
      !window.confirm(
        'Trocar o modelo recarrega os itens do checklist. As respostas atuais serão substituídas. Continuar?'
      )
    ) {
      return
    }
    onChange(aplicarModeloAoChecklist(value, modelo, false, modelos, officeId ?? OFFICE_ID, tipoOficina))
  }

  function alterarItem(
    itemId: string,
    patch: Partial<ChecklistEntrada['itens'][number]>
  ) {
    onChange(atualizarRespostaChecklist(value, itemId, patch))
  }

  function tentarAlterarItem(
    itemId: string,
    patch: Partial<ChecklistEntrada['itens'][number]>
  ) {
    const item = value.itens.find((i) => i.item_id === itemId)
    if (!item) return

    if (
      itemExigeFotoChecklist(item) &&
      (contagemPorItem[itemId] ?? 0) < 1 &&
      patchConcluiResposta(patch)
    ) {
      toast.atencao(online ? MSG_CHECKLIST_FOTO_OBRIGATORIA : MSG_CHECKLIST_FOTO_OFFLINE)
      return
    }

    alterarItem(itemId, patch)
  }

  async function aoAlterarFotosItem(
    itemId: string,
    ctx?: { osId?: string; osNumero?: number }
  ) {
    const lista = onRecarregarFotos
      ? await onRecarregarFotos(ctx)
      : await carregarFotosLocal(ctx)
    const item = value.itens.find((i) => i.item_id === itemId)
    if (!item) return

    const fotosItem = lista.filter((f) => f.checklist_item_id?.trim() === itemId)

    if (item.tipo_resposta === 'foto_obrigatoria') {
      alterarItem(itemId, {
        valor_texto: fotosItem.length > 0 ? 'foto_anexada' : undefined,
      })
    }
  }

  function adicionarExtra() {
    const nome = extraNome.trim()
    if (!nome) return
    onChange(
      adicionarItemExtraChecklist(value, {
        nome,
        categoria: 'outros',
        tipo_resposta: 'ok_nao_ok',
        obrigatorio: false,
        foto_obrigatoria: false,
      })
    )
    setExtraNome('')
  }

  return (
    <div
      id="os-campo-checklist"
      className={cn(
        'space-y-4 rounded-lg border bg-muted/10 p-4',
        temErroSecao ? 'border-destructive/60' : 'border-border'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">Checklist de Entrada</h4>
          <p className="text-xs text-muted-foreground">
            Modelo: {value.modelo_nome} — respostas salvas apenas nesta OS
          </p>
          <MensagemCampoErro mensagem={mensagemErroSecao} />
          {temErroSecao && errosItens.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-destructive">
              {value.itens
                .filter((item) => errosItens.includes(item.item_id))
                .map((item) => (
                  <li key={item.item_id}>
                    • {item.nome}
                    {mensagensErroItens[item.item_id]
                      ? ` — ${mensagensErroItens[item.item_id]}`
                      : ''}
                  </li>
                ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-[220px] flex-1 gap-2">
            <Label className="text-xs">Modelo de checklist</Label>
            <Select value={value.modelo_id} onValueChange={trocarModelo}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o modelo" />
              </SelectTrigger>
              <SelectContent>
                {modelosAtivos.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome}
                    {m.padrao ? ' (padrão)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 shrink-0"
            onClick={() => setAvaliacaoVozAberta(true)}
          >
            <Mic className="h-4 w-4" />
            Avaliação por voz
          </Button>
        </div>
      </div>

      <div className="space-y-5">
        {itensPorCategoria.map(([categoria, itens]) => (
          <div key={categoria}>
            <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {categoria}
            </h5>
            <div className="grid gap-3 sm:grid-cols-2">
              {itens.map((item) => {
                const itemInvalido = errosItens.includes(item.item_id)
                const exigeFoto = itemExigeFotoChecklist(item)
                const fotosItem = fotosPorItem.get(item.item_id) ?? []
                const msgItem =
                  mensagensErroItens[item.item_id] ||
                  (itemInvalido && exigeFoto && fotosItem.length === 0
                    ? online
                      ? MSG_CHECKLIST_FOTO_OBRIGATORIA
                      : MSG_CHECKLIST_FOTO_OFFLINE
                    : itemInvalido
                      ? 'Resposta obrigatória.'
                      : undefined)

                return (
                  <div
                    key={item.item_id}
                    className={cn(
                      'rounded-lg border p-3',
                      itemInvalido && 'border-destructive/60 bg-destructive/5',
                      !itemInvalido && item.extra && 'border-primary/30 bg-primary/5',
                      !itemInvalido && !item.extra && 'border-border'
                    )}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          {item.nome}
                          {item.obrigatorio && (
                            <span className="ml-1 text-destructive">*</span>
                          )}
                        </p>
                        {item.extra && (
                          <span className="text-[10px] uppercase text-primary">
                            Extra nesta OS
                          </span>
                        )}
                      </div>
                    </div>
                    <RespostaItem
                      item={item}
                      onChange={(patch) => tentarAlterarItem(item.item_id, patch)}
                    />
                    {ehItemCombustivelChecklist(item) ? (
                      <Input
                        placeholder="Observação extra (opcional)"
                        value={item.observacao ?? ''}
                        onChange={(e) =>
                          alterarItem(item.item_id, {
                            observacao: e.target.value || undefined,
                          })
                        }
                        className="mt-2 h-8 text-xs"
                      />
                    ) : (
                      <Input
                        placeholder="Observação (opcional)"
                        value={item.observacao ?? ''}
                        onChange={(e) =>
                          alterarItem(item.item_id, {
                            observacao: e.target.value || undefined,
                          })
                        }
                        className="mt-2 h-8 text-xs"
                      />
                    )}

                    <ChecklistItemFotos
                      itemId={item.item_id}
                      itemNome={item.nome}
                      fotoObrigatoria={exigeFoto}
                      fotos={fotosItem}
                      osId={osId}
                      osNumero={osNumero}
                      officeId={officeId}
                      podeAdicionar={podeAdicionarFoto}
                      createdBy={createdBy}
                      createdByName={createdByName}
                      userPapel={userPapel}
                      ehAdminSistema={ehAdminSistema}
                      emitirEventoGlobal
                      onAlterou={(ctx) => void aoAlterarFotosItem(item.item_id, ctx)}
                      onPrepararOsParaFoto={onPrepararOsParaFoto}
                    />

                    {msgItem && (
                      <p className="mt-2 text-xs text-destructive">{msgItem}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Input
          placeholder="Nome do item extra (somente nesta OS)"
          value={extraNome}
          onChange={(e) => setExtraNome(e.target.value)}
          className="max-w-xs"
        />
        <Button type="button" variant="outline" size="sm" onClick={adicionarExtra}>
          <Plus className="h-4 w-4" />
          Adicionar item extra
        </Button>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="checklist-obs">Observações gerais da entrada</Label>
        <Textarea
          id="checklist-obs"
          value={value.observacoes_gerais ?? ''}
          onChange={(e) => onChange({ ...value, observacoes_gerais: e.target.value })}
          placeholder="Avarias, detalhes da entrega, etc."
          rows={2}
        />
      </div>

      <AvaliacaoPorVozDialog
        aberto={avaliacaoVozAberta}
        onFechar={() => setAvaliacaoVozAberta(false)}
        checklist={value}
        contagemFotosPorItem={contagemPorItem}
        onAplicar={onChange}
      />
    </div>
  )
}

export { CATEGORIAS_CHECKLIST, TIPOS_RESPOSTA_CHECKLIST }
