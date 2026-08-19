import { useMemo, useState, useEffect } from 'react'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAssinatura } from '@/context/AssinaturaContext'
import { useAuth } from '@/context/AuthContext'
import { useComunicacao } from '@/context/ComunicacaoContext'
import { useOficinaData } from '@/context/CraftContext'
import { useTermosOficina } from '@/hooks/useTermosOficina'
import {
  montarMensagem,
  sugerirTipoMensagem,
  getLabelStatusOS,
} from '@/services/comunicacao/comunicacao.service'
import {
  listarTiposMensagemDisponiveis,
  montarVariaveisMensagemCliente,
} from '@/lib/mensagem-agendada-helpers'
import { abrirWhatsAppWeb } from '@/services/comunicacao/whatsapp.service'
import type { TipoMensagem } from '@/types/comunicacao'
import type { Cliente, Moto, OrdemServico } from '@/types'
import { cn } from '@/lib/utils'

const PAPEIS_COMUNICACAO = ['dono', 'gerente', 'recepcao'] as const

interface BotaoWhatsAppProps {
  cliente: Cliente
  moto?: Moto
  os?: OrdemServico
  tipoSugerido?: TipoMensagem
  variant?: 'icon' | 'sm'
  className?: string
}

export function BotaoWhatsApp({
  cliente,
  moto,
  os,
  tipoSugerido,
  variant = 'icon',
  className,
}: BotaoWhatsAppProps) {
  const { session } = useAuth()
  const { temRecurso } = useAssinatura()
  const { configuracao, motos } = useOficinaData()
  const termos = useTermosOficina()
  const { registrarContato } = useComunicacao()
  const [dialogAberto, setDialogAberto] = useState(false)
  const [tipo, setTipo] = useState<TipoMensagem>('lembrete_revisao')
  const [motoSelecionadaId, setMotoSelecionadaId] = useState<string>('')

  const papel = session?.user.papel
  const podeComunicar =
    !!papel && PAPEIS_COMUNICACAO.includes(papel as (typeof PAPEIS_COMUNICACAO)[number])

  const motosDoCliente = useMemo(
    () => motos.filter((m) => m.cliente_id === cliente.id),
    [motos, cliente.id]
  )

  const tipoInicial =
    tipoSugerido ??
    (os ? sugerirTipoMensagem(os.status, os.status_orcamento) : 'lembrete_revisao')

  useEffect(() => {
    if (!dialogAberto) return
    setTipo(tipoInicial)
    if (moto?.id) {
      setMotoSelecionadaId(moto.id)
    } else if (os?.moto_id) {
      setMotoSelecionadaId(os.moto_id)
    } else if (motosDoCliente.length === 1) {
      setMotoSelecionadaId(motosDoCliente[0].id)
    } else {
      setMotoSelecionadaId('')
    }
  }, [dialogAberto, tipoInicial, moto?.id, os?.moto_id, motosDoCliente])

  const motoEfetiva = useMemo(() => {
    if (motoSelecionadaId) {
      return motosDoCliente.find((m) => m.id === motoSelecionadaId) ?? moto
    }
    return moto
  }, [motoSelecionadaId, motosDoCliente, moto])

  const vars = useMemo(
    () =>
      montarVariaveisMensagemCliente({
        cliente,
        configuracao,
        moto: motoEfetiva,
        os,
        exibirValoresFinanceiros: true,
      }),
    [cliente, configuracao, motoEfetiva, os]
  )

  const mensagem = useMemo(
    () => montarMensagem(tipo, vars, configuracao),
    [tipo, vars, configuracao]
  )

  const tiposMensagem = useMemo(
    () => listarTiposMensagemDisponiveis(true, configuracao),
    [configuracao]
  )

  if (!podeComunicar) {
    return null
  }

  function handleAbrir() {
    if (!temRecurso('comunicacao')) {
      window.alert(
        'Comunicação com cliente disponível a partir do plano Profissional. Acesse Planos para fazer upgrade.'
      )
      return
    }
    setTipo(tipoInicial)
    setDialogAberto(true)
  }

  function handleEnviar() {
    if (!cliente.telefone?.trim()) {
      window.alert('Cliente sem telefone cadastrado.')
      return
    }
    try {
      abrirWhatsAppWeb(cliente.telefone, mensagem)
      registrarContato({
        cliente_id: cliente.id,
        cliente_nome: cliente.nome,
        tipo_mensagem: tipo,
        ordem_servico_id: os?.id,
        ordem_servico_numero: os?.numero,
        mensagemCompleta: mensagem,
      })
      setDialogAberto(false)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Não foi possível abrir o WhatsApp.')
    }
  }

  return (
    <>
      {variant === 'icon' ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleAbrir}
          title="Enviar WhatsApp"
          className={cn('text-emerald-400 hover:text-emerald-300', className)}
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={handleAbrir}
          className={cn('gap-2 text-emerald-400 border-emerald-500/30', className)}
        >
          <MessageCircle className="h-4 w-4" />
          Enviar WhatsApp
        </Button>
      )}

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar WhatsApp</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
              <p className="font-medium">{cliente.nome}</p>
              <p className="text-muted-foreground">{cliente.telefone}</p>
              {motoEfetiva ? (
                <p className="mt-1 text-muted-foreground">
                  {motoEfetiva.marca} {motoEfetiva.modelo} · {motoEfetiva.placa}
                </p>
              ) : (
                <p className="mt-1 text-muted-foreground">
                  Sem {termos.palavraVeiculo} selecionado — a mensagem usará termo neutro.
                </p>
              )}
              {os && (
                <p className="mt-1 text-muted-foreground">
                  OS #{os.numero} · {getLabelStatusOS(os.status)}
                </p>
              )}
            </div>

            {!moto && motosDoCliente.length > 1 ? (
              <div className="grid gap-2">
                <Label>{termos.veiculo} (opcional)</Label>
                <Select
                  value={motoSelecionadaId || '__nenhum__'}
                  onValueChange={(v) => setMotoSelecionadaId(v === '__nenhum__' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={`Selecionar ${termos.palavraVeiculo}`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__nenhum__">Sem {termos.palavraVeiculo} específico</SelectItem>
                    {motosDoCliente.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.marca} {m.modelo} · {m.placa}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label>Mensagem pronta</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoMensagem)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tiposMensagem.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea value={mensagem} readOnly rows={8} className="resize-y text-sm" />
            </div>

            <Button
              type="button"
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-500"
              onClick={handleEnviar}
            >
              <MessageCircle className="h-4 w-4" />
              Abrir WhatsApp
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
