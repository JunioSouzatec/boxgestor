import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Copy, Loader2, MessageCircle, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { useAuth } from '@/context/AuthContext'
import { useComunicacao } from '@/context/ComunicacaoContext'
import { useOficinaData } from '@/context/CraftContext'
import { useToast } from '@/context/ToastContext'
import {
  listarTiposMensagemDisponiveis,
  montarTextoMensagemAgendada,
  montarVariaveisMensagemCliente,
} from '@/lib/mensagem-agendada-helpers'
import { obterResponsavelLogado } from '@/services/lembretes/lembretes-responsavel'
import { combinarDataHoraAgendamento } from '@/services/comunicacao/mensagens-agendadas.service'
import { abrirWhatsAppWeb } from '@/services/comunicacao/whatsapp.service'
import { podeVerValoresFinanceirosOS } from '@/services/auth/permissions'
import { getDataLocalHoje } from '@/lib/data-local'
import { sugerirTipoMensagem } from '@/services/comunicacao/comunicacao.service'
import type { TipoMensagem } from '@/types/comunicacao'
import type { OrigemMensagemAgendada } from '@/types/mensagem-agendada'
import type { Cliente, Moto, OrdemServico } from '@/types'
import { ehDocumentoOrcamento } from '@/lib/os-modo-documento'

export interface AgendarMensagemDialogProps {
  aberto: boolean
  onFechar: () => void
  cliente?: Cliente
  moto?: Moto
  os?: OrdemServico
  tipoInicial?: TipoMensagem
  modoInicial?: 'agendar' | 'enviar_agora'
  origem?: OrigemMensagemAgendada
  titulo?: string
  dataRevisaoSugerida?: string
  tipoRevisao?: string
  permitirSelecionarCliente?: boolean
}

export function AgendarMensagemDialog({
  aberto,
  onFechar,
  cliente: clienteProp,
  moto: motoProp,
  os,
  tipoInicial,
  modoInicial = 'agendar',
  origem: origemProp,
  titulo,
  dataRevisaoSugerida,
  tipoRevisao: tipoRevisaoProp,
  permitirSelecionarCliente = false,
}: AgendarMensagemDialogProps) {
  const { session } = useAuth()
  const { configuracao, clientes, motos } = useOficinaData()
  const { criarMensagemAgendada, registrarContato } = useComunicacao()
  const { toast } = useToast()

  const exibirValores = podeVerValoresFinanceirosOS(session?.user ?? 'recepcao', configuracao)
  const tiposDisponiveis = useMemo(
    () => listarTiposMensagemDisponiveis(exibirValores),
    [exibirValores]
  )

  const [clienteId, setClienteId] = useState(clienteProp?.id ?? '')
  const [motoId, setMotoId] = useState(motoProp?.id ?? '')
  const [telefone, setTelefone] = useState(clienteProp?.telefone ?? '')
  const [modo, setModo] = useState<'agendar' | 'enviar_agora'>(modoInicial)
  const [tipo, setTipo] = useState<TipoMensagem>(
    tipoInicial ?? (os ? sugerirTipoMensagem(os.status, os.status_orcamento) : 'lembrete_revisao')
  )
  const [dataAgendamento, setDataAgendamento] = useState(dataRevisaoSugerida ?? getDataLocalHoje())
  const [horaAgendamento, setHoraAgendamento] = useState('09:00')
  const [texto, setTexto] = useState('')
  const [observacao, setObservacao] = useState('')
  const [tipoRevisao, setTipoRevisao] = useState(tipoRevisaoProp ?? 'Revisão periódica')
  const [salvando, setSalvando] = useState(false)

  const cliente = useMemo(
    () => clienteProp ?? clientes.find((c) => c.id === clienteId),
    [clienteProp, clientes, clienteId]
  )

  const moto = useMemo(
    () => motoProp ?? motos.find((m) => m.id === motoId),
    [motoProp, motos, motoId]
  )

  const origem: OrigemMensagemAgendada = useMemo(() => {
    if (origemProp) return origemProp
    if (tipoInicial === 'lembrete_revisao' || tipoRevisaoProp) return 'revisao'
    if (os && ehDocumentoOrcamento(os)) return 'orcamento'
    if (os) return 'os'
    return 'manual'
  }, [origemProp, tipoInicial, tipoRevisaoProp, os])

  const vars = useMemo(() => {
    if (!cliente) return null
    return montarVariaveisMensagemCliente({
      cliente,
      configuracao,
      moto,
      os,
      exibirValoresFinanceiros: exibirValores,
      dataPrevista: dataAgendamento,
      dataEntrega: os?.data_saida,
    })
  }, [cliente, configuracao, moto, os, exibirValores, dataAgendamento])

  useEffect(() => {
    if (!aberto) return
    setModo(modoInicial)
    setClienteId(clienteProp?.id ?? '')
    setMotoId(motoProp?.id ?? os?.moto_id ?? '')
    setTelefone(clienteProp?.telefone ?? '')
    setTipo(
      tipoInicial ?? (os ? sugerirTipoMensagem(os.status, os.status_orcamento) : 'lembrete_revisao')
    )
    setDataAgendamento(dataRevisaoSugerida ?? getDataLocalHoje())
    setHoraAgendamento('09:00')
    setObservacao('')
    setTipoRevisao(tipoRevisaoProp ?? 'Revisão periódica')
  }, [aberto, modoInicial, clienteProp, motoProp, os, tipoInicial, dataRevisaoSugerida, tipoRevisaoProp])

  useEffect(() => {
    if (!vars) return
    setTexto(montarTextoMensagemAgendada(tipo, vars))
  }, [tipo, vars])

  useEffect(() => {
    if (cliente?.telefone && !telefone) setTelefone(cliente.telefone)
  }, [cliente, telefone])

  const motosDoCliente = useMemo(
    () => (cliente ? motos.filter((m) => m.cliente_id === cliente.id) : []),
    [cliente, motos]
  )

  function fechar() {
    onFechar()
  }

  async function copiarMensagem() {
    try {
      await navigator.clipboard.writeText(texto)
      toast.sucesso('Mensagem copiada.')
    } catch {
      toast.erro('Não foi possível copiar a mensagem.')
    }
  }

  function validarTelefone(): boolean {
    if (!telefone.trim()) {
      toast.erro('Informe o telefone do cliente para continuar.')
      return false
    }
    return true
  }

  function abrirWhatsApp() {
    if (!cliente || !validarTelefone()) return
    try {
      abrirWhatsAppWeb(telefone, texto)
    } catch (err) {
      toast.erro(err instanceof Error ? err.message : 'Não foi possível abrir o WhatsApp.')
    }
  }

  function salvarAgendamento() {
    if (!cliente || !validarTelefone()) return
    setSalvando(true)
    try {
      const responsavel = obterResponsavelLogado(session?.user)
      criarMensagemAgendada({
        agendado_para:
          modo === 'enviar_agora'
            ? new Date().toISOString()
            : combinarDataHoraAgendamento(dataAgendamento, horaAgendamento),
        cliente_id: cliente.id,
        cliente_nome: cliente.nome,
        telefone: telefone.trim(),
        moto_id: moto?.id,
        veiculo_descricao: moto ? `${moto.marca} ${moto.modelo}` : undefined,
        placa: moto?.placa,
        tipo_mensagem: tipo,
        mensagem: texto,
        observacao_interna: observacao || undefined,
        ordem_servico_id: os?.id,
        ordem_servico_numero: os?.numero,
        origem,
        responsavel_id: responsavel.id,
        responsavel_nome: responsavel.nome,
        tipo_revisao: origem === 'revisao' ? tipoRevisao : undefined,
      })
      toast.sucesso(
        modo === 'enviar_agora'
          ? 'Mensagem registrada. Abra o WhatsApp quando estiver pronto.'
          : 'Mensagem agendada com sucesso.'
      )
      fechar()
    } finally {
      setSalvando(false)
    }
  }

  function enviarAgoraComHistorico() {
    if (!cliente || !validarTelefone()) return
    try {
      abrirWhatsAppWeb(telefone, texto)
      registrarContato({
        cliente_id: cliente.id,
        cliente_nome: cliente.nome,
        tipo_mensagem: tipo,
        ordem_servico_id: os?.id,
        ordem_servico_numero: os?.numero,
        mensagemCompleta: texto,
      })
      toast.sucesso('WhatsApp aberto. Marque como enviada após concluir o envio, se agendou antes.')
      fechar()
    } catch (err) {
      toast.erro(err instanceof Error ? err.message : 'Não foi possível abrir o WhatsApp.')
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && fechar()}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titulo ?? 'Mensagem para o cliente'}</DialogTitle>
          <DialogDescription>
            O envio é manual pelo WhatsApp. O sistema apenas agenda e prepara o texto.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {permitirSelecionarCliente && (
            <div className="grid gap-2">
              <Label>Cliente</Label>
              <Select value={clienteId} onValueChange={setClienteId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {cliente && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm space-y-1">
              <p className="font-medium">{cliente.nome}</p>
              {!permitirSelecionarCliente && (
                <p className="text-muted-foreground">{telefone || cliente.telefone || 'Sem telefone'}</p>
              )}
              {moto && (
                <p className="text-muted-foreground">
                  {moto.marca} {moto.modelo} · {moto.placa}
                </p>
              )}
              {os && <p className="text-muted-foreground">OS #{os.numero}</p>}
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="telefone-msg">Telefone / WhatsApp</Label>
            <Input
              id="telefone-msg"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(00) 00000-0000"
            />
          </div>

          {permitirSelecionarCliente && motosDoCliente.length > 0 && (
            <div className="grid gap-2">
              <Label>Veículo (opcional)</Label>
              <Select value={motoId || '_none'} onValueChange={(v) => setMotoId(v === '_none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Nenhum</SelectItem>
                  {motosDoCliente.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.marca} {m.modelo} · {m.placa}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-2">
            <Label>Tipo de mensagem</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoMensagem)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tiposDisponiveis.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {origem === 'revisao' && (
            <div className="grid gap-2">
              <Label htmlFor="tipo-revisao">Tipo de revisão</Label>
              <Input
                id="tipo-revisao"
                value={tipoRevisao}
                onChange={(e) => setTipoRevisao(e.target.value)}
              />
            </div>
          )}

          {modo === 'agendar' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="data-ag">Data</Label>
                <Input
                  id="data-ag"
                  type="date"
                  value={dataAgendamento}
                  onChange={(e) => setDataAgendamento(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="hora-ag">Horário</Label>
                <Input
                  id="hora-ag"
                  type="time"
                  value={horaAgendamento}
                  onChange={(e) => setHoraAgendamento(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <Label>Mensagem</Label>
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={8}
              className="resize-y text-sm"
            />
          </div>

          <div className="grid gap-2">
            <Label>Observação interna (opcional)</Label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              className="resize-none text-sm"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button type="button" variant="outline" onClick={() => void copiarMensagem()}>
              <Copy className="mr-2 h-4 w-4" />
              Copiar mensagem
            </Button>
            {modo === 'agendar' ? (
              <Button type="button" onClick={salvarAgendamento} disabled={salvando || !cliente}>
                {salvando ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CalendarClock className="mr-2 h-4 w-4" />
                )}
                Salvar agendamento
              </Button>
            ) : (
              <>
                <Button type="button" variant="secondary" onClick={abrirWhatsApp} disabled={!cliente}>
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Abrir WhatsApp
                </Button>
                <Button type="button" onClick={enviarAgoraComHistorico} disabled={!cliente}>
                  <Send className="mr-2 h-4 w-4" />
                  Enviar agora
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
