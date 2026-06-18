import { useEffect, useMemo, useState } from 'react'
import { Bell, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useLembretes } from '@/context/LembretesContext'
import {
  calcularDataRetornoRegra,
  montarMensagemLembrete,
  montarVarsLembrete,
  sugerirRegrasPorOS,
} from '@/services/lembretes/lembretes.service'
import { obterRegrasLembreteDeServicosOS } from '@/services/servico-catalogo.service'
import { formatarData, getDataLocalHoje } from '@/lib/utils'
import type { Moto, OrdemServico } from '@/types'
import type { LembreteRegraOverride } from '@/types/lembrete'
import type { ServicoCatalogo } from '@/types/servico-catalogo'
import { cn } from '@/lib/utils'

type ModoLembreteOS = 'nenhum' | 'regras' | 'personalizado'

interface OverrideForm {
  servico: string
  data_prevista: string
  km_prevista: string
  mensagem: string
  observacoes: string
  expandido: boolean
}

interface CriarLembretesOSDialogProps {
  os: OrdemServico | null
  moto: Moto | null
  clienteNome: string
  nomeOficina: string
  servicosCatalogo?: ServicoCatalogo[]
  aberto: boolean
  onFechar: () => void
}

function criarOverrideInicial(
  servico: string,
  dataPrevista: string,
  kmPrevista: number | undefined,
  mensagem: string,
  observacoes: string
): OverrideForm {
  return {
    servico,
    data_prevista: dataPrevista,
    km_prevista: kmPrevista != null ? String(kmPrevista) : '',
    mensagem,
    observacoes,
    expandido: false,
  }
}

export function CriarLembretesOSDialog({
  os,
  moto,
  clienteNome,
  nomeOficina,
  servicosCatalogo = [],
  aberto,
  onFechar,
}: CriarLembretesOSDialogProps) {
  const { regras, criarLembretesDeRegras, criarLembretePersonalizado } = useLembretes()
  const [modo, setModo] = useState<ModoLembreteOS>('regras')
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [overrides, setOverrides] = useState<Record<string, OverrideForm>>({})
  const [personalizado, setPersonalizado] = useState({
    servico: '',
    data_prevista: '',
    km_prevista: '',
    mensagem: '',
    observacoes: '',
  })

  const regrasAtivas = useMemo(() => regras.filter((r) => r.ativo), [regras])
  const dataBase = useMemo(() => getDataLocalHoje(), [aberto])

  const kmBase = useMemo(() => {
    if (!os || !moto) return 0
    return os.quilometragem_saida ?? os.quilometragem_entrada ?? moto.quilometragem
  }, [os, moto])

  const sugeridas = useMemo(() => {
    if (!os) return []
    const porTexto = sugerirRegrasPorOS(regrasAtivas, os.servicos_executados ?? '')
    const porCatalogo = obterRegrasLembreteDeServicosOS(os, servicosCatalogo, regrasAtivas)
    const ids = new Set<string>()
    return [...porCatalogo, ...porTexto].filter((r) => {
      if (ids.has(r.id)) return false
      ids.add(r.id)
      return true
    })
  }, [os, regrasAtivas, servicosCatalogo])

  const regrasParaLista = useMemo(() => {
    const map = new Map<string, (typeof regrasAtivas)[number]>()
    for (const r of regrasAtivas) map.set(r.id, r)
    for (const r of sugeridas) map.set(r.id, r)
    return [...map.values()]
  }, [regrasAtivas, sugeridas])

  useEffect(() => {
    if (!aberto || !os || !moto) return

    setModo(sugeridas.length > 0 ? 'regras' : 'nenhum')
    setSelecionadas(new Set(sugeridas.map((r) => r.id)))

    const novosOverrides: Record<string, OverrideForm> = {}
    for (const regra of regrasParaLista) {
      const dataPrevista = calcularDataRetornoRegra(dataBase, regra)
      const kmPrevista = regra.km_retorno ? kmBase + regra.km_retorno : undefined
      const vars = montarVarsLembrete(
        clienteNome,
        moto,
        regra.servico_relacionado,
        dataPrevista,
        kmPrevista,
        nomeOficina
      )
      novosOverrides[regra.id] = criarOverrideInicial(
        regra.servico_relacionado,
        dataPrevista,
        kmPrevista,
        montarMensagemLembrete(regra.mensagem_padrao, vars),
        regra.observacoes_internas ?? ''
      )
    }
    setOverrides(novosOverrides)

    const dataPadrao = calcularDataRetornoRegra(dataBase, {
      prazo_dias: 90,
      prazo_meses: 0,
    })
    setPersonalizado({
      servico: os.servicos_executados?.split('\n')[0]?.trim() ?? '',
      data_prevista: dataPadrao,
      km_prevista: '',
      mensagem: `Olá ${clienteNome}! Passando para lembrar do retorno da sua moto ${moto.marca} ${moto.modelo} (placa ${moto.placa}). ${nomeOficina}`,
      observacoes: '',
    })
  }, [aberto, os, moto, sugeridas, regrasParaLista, dataBase, kmBase, clienteNome, nomeOficina])

  function toggleRegra(id: string) {
    setSelecionadas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function atualizarOverride(regraId: string, campo: keyof OverrideForm, valor: string | boolean) {
    setOverrides((prev) => ({
      ...prev,
      [regraId]: { ...prev[regraId], [campo]: valor },
    }))
  }

  function handleConfirmar() {
    if (!os || !moto) return

    if (modo === 'nenhum') {
      onFechar()
      return
    }

    if (modo === 'personalizado') {
      if (!personalizado.servico.trim() || !personalizado.data_prevista || !personalizado.mensagem.trim()) {
        window.alert('Preencha serviço, data de retorno e mensagem.')
        return
      }
      criarLembretePersonalizado(os, moto, {
        servico: personalizado.servico.trim(),
        data_prevista: personalizado.data_prevista,
        km_prevista: personalizado.km_prevista ? Number(personalizado.km_prevista) : undefined,
        mensagem: personalizado.mensagem.trim(),
        observacoes: personalizado.observacoes.trim() || undefined,
      })
      onFechar()
      return
    }

    const escolhidas = regrasParaLista.filter((r) => selecionadas.has(r.id))
    if (escolhidas.length === 0) {
      onFechar()
      return
    }

    const overridesPayload: LembreteRegraOverride[] = escolhidas.map((regra) => {
      const ov = overrides[regra.id]
      return {
        regra_id: regra.id,
        servico: ov?.servico.trim() || regra.servico_relacionado,
        data_prevista: ov?.data_prevista,
        km_prevista: ov?.km_prevista ? Number(ov.km_prevista) : undefined,
        mensagem: ov?.mensagem.trim(),
        observacoes: ov?.observacoes.trim() || undefined,
      }
    })

    criarLembretesDeRegras(os, moto, clienteNome, escolhidas, nomeOficina, overridesPayload)
    onFechar()
  }

  if (!os || !moto) return null

  const motoLabel = `${moto.marca} ${moto.modelo} · ${moto.placa}`

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Lembretes de retorno
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          OS #{os.numero} finalizada — {clienteNome} · {motoLabel}
        </p>

        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'nenhum', label: 'Não criar lembrete' },
              { id: 'regras', label: 'Usar regra padrão' },
              { id: 'personalizado', label: 'Lembrete personalizado' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setModo(opt.id)}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm transition-colors cursor-pointer',
                modo === opt.id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/30'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {modo === 'nenhum' && (
          <p className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            Nenhum lembrete será criado para esta OS. Você pode adicionar lembretes depois na tela
            Lembretes.
          </p>
        )}

        {modo === 'regras' && (
          <div className="space-y-2">
            {regrasParaLista.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma regra ativa. Configure em Lembretes → Regras de Retorno ou vincule lembretes
                aos serviços do catálogo.
              </p>
            ) : (
              regrasParaLista.map((regra) => {
                const ov = overrides[regra.id]
                if (!ov) return null
                const selecionada = selecionadas.has(regra.id)
                return (
                  <div
                    key={regra.id}
                    className={cn(
                      'rounded-lg border bg-muted/20 transition-colors',
                      selecionada ? 'border-primary/40' : 'border-border'
                    )}
                  >
                    <div className="flex items-start gap-3 p-3">
                      <input
                        type="checkbox"
                        checked={selecionada}
                        onChange={() => toggleRegra(regra.id)}
                        className="mt-1 h-4 w-4 shrink-0 rounded accent-primary"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm">{regra.nome_regra}</p>
                        <p className="text-xs text-muted-foreground">
                          {regra.servico_relacionado}
                          {regra.prazo_dias > 0 ? ` · ${regra.prazo_dias} dias` : ''}
                          {regra.prazo_meses > 0 ? ` · ${regra.prazo_meses} meses` : ''}
                          {regra.km_retorno
                            ? ` · +${regra.km_retorno.toLocaleString('pt-BR')} km`
                            : ''}
                          {' · '}
                          {formatarData(ov.data_prevista)}
                        </p>
                      </div>
                      {selecionada && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="shrink-0 h-8 px-2"
                          onClick={() =>
                            atualizarOverride(regra.id, 'expandido', !ov.expandido)
                          }
                        >
                          {ov.expandido ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                          Editar
                        </Button>
                      )}
                    </div>

                    {selecionada && ov.expandido && (
                      <div className="grid gap-3 border-t border-border p-3 pt-0">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="grid gap-1">
                            <Label className="text-xs">Serviço/peça</Label>
                            <Input
                              value={ov.servico}
                              onChange={(e) =>
                                atualizarOverride(regra.id, 'servico', e.target.value)
                              }
                            />
                          </div>
                          <div className="grid gap-1">
                            <Label className="text-xs">Data de retorno</Label>
                            <Input
                              type="date"
                              value={ov.data_prevista}
                              onChange={(e) =>
                                atualizarOverride(regra.id, 'data_prevista', e.target.value)
                              }
                            />
                          </div>
                          <div className="grid gap-1">
                            <Label className="text-xs">Km de retorno</Label>
                            <Input
                              type="number"
                              min={0}
                              value={ov.km_prevista}
                              onChange={(e) =>
                                atualizarOverride(regra.id, 'km_prevista', e.target.value)
                              }
                              placeholder={`Base: ${kmBase.toLocaleString('pt-BR')} km`}
                            />
                          </div>
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs">Mensagem WhatsApp</Label>
                          <Textarea
                            value={ov.mensagem}
                            onChange={(e) =>
                              atualizarOverride(regra.id, 'mensagem', e.target.value)
                            }
                            rows={3}
                            className="text-sm"
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs">Observações internas</Label>
                          <Textarea
                            value={ov.observacoes}
                            onChange={(e) =>
                              atualizarOverride(regra.id, 'observacoes', e.target.value)
                            }
                            rows={2}
                            className="text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}

        {modo === 'personalizado' && (
          <div className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label>Serviço/peça</Label>
                <Input
                  value={personalizado.servico}
                  onChange={(e) =>
                    setPersonalizado({ ...personalizado, servico: e.target.value })
                  }
                  placeholder="Ex.: Troca de pastilha dianteira"
                />
              </div>
              <div className="grid gap-1">
                <Label>Data de retorno</Label>
                <Input
                  type="date"
                  value={personalizado.data_prevista}
                  onChange={(e) =>
                    setPersonalizado({ ...personalizado, data_prevista: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-1 sm:col-span-2">
                <Label>Quilometragem de retorno (opcional)</Label>
                <Input
                  type="number"
                  min={0}
                  value={personalizado.km_prevista}
                  onChange={(e) =>
                    setPersonalizado({ ...personalizado, km_prevista: e.target.value })
                  }
                  placeholder={`Km absoluto (base atual: ${kmBase.toLocaleString('pt-BR')} km)`}
                />
              </div>
            </div>
            <div className="grid gap-1">
              <Label>Mensagem para WhatsApp</Label>
              <Textarea
                value={personalizado.mensagem}
                onChange={(e) =>
                  setPersonalizado({ ...personalizado, mensagem: e.target.value })
                }
                rows={4}
              />
            </div>
            <div className="grid gap-1">
              <Label>Observações internas</Label>
              <Textarea
                value={personalizado.observacoes}
                onChange={(e) =>
                  setPersonalizado({ ...personalizado, observacoes: e.target.value })
                }
                rows={2}
                placeholder="Ex.: Cliente pediu lembrete em 60 dias por viagem"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onFechar}>
            {modo === 'nenhum' ? 'Fechar' : 'Pular'}
          </Button>
          <Button onClick={handleConfirmar} className="gap-2">
            <Check className="h-4 w-4" />
            {modo === 'nenhum' ? 'Confirmar' : 'Salvar lembretes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
