import { useMemo, useState } from 'react'
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Copy,
  MessageCircle,
  Plus,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { BuscaInput } from '@/components/shared/BuscaInput'
import { AgendarMensagemDialog } from '@/components/comunicacao/AgendarMensagemDialog'
import { AdiarMensagemAgendadaDialog } from '@/components/comunicacao/AdiarMensagemAgendadaDialog'
import { useComunicacao } from '@/context/ComunicacaoContext'
import { useOficinaData } from '@/context/CraftContext'
import { useToast } from '@/context/ToastContext'
import { abrirWhatsAppWeb } from '@/services/comunicacao/whatsapp.service'
import { filtrarMensagensAgendadas } from '@/services/comunicacao/mensagens-agendadas.service'
import { formatarData, formatarTelefone } from '@/lib/utils'
import { getLabelTipoMensagemOficina } from '@/lib/mensagem-agendada-helpers'
import {
  FILTROS_MENSAGENS_AGENDADAS,
  getLabelOrigemMensagemAgendada,
  getLabelStatusMensagemAgendada,
  type FiltroMensagensAgendadas,
  type MensagemAgendadaComStatus,
} from '@/types/mensagem-agendada'
import { cn } from '@/lib/utils'

const STATUS_VARIANT: Record<string, string> = {
  pendente: 'border-border text-muted-foreground',
  atrasada: 'border-destructive/40 text-destructive',
  enviada: 'border-emerald-500/40 text-emerald-400',
  cancelada: 'border-border text-muted-foreground line-through',
}

function formatarDataHora(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))
}

interface MensagensAgendadasSectionProps {
  mostrarResumo?: boolean
}

export function MensagensAgendadasSection({ mostrarResumo = true }: MensagensAgendadasSectionProps) {
  const {
    mensagensAgendadas,
    resumoMensagensAgendadas,
    marcarMensagemEnviada,
    cancelarMensagemAgendada,
    adiarMensagemAgendada,
  } = useComunicacao()
  const { configuracao } = useOficinaData()
  const { toast } = useToast()

  const [filtro, setFiltro] = useState<FiltroMensagensAgendadas>('hoje')
  const [busca, setBusca] = useState('')
  const [dialogNova, setDialogNova] = useState(false)
  const [mensagemAdiar, setMensagemAdiar] = useState<MensagemAgendadaComStatus | null>(null)

  const lista = useMemo(() => {
    let items = filtrarMensagensAgendadas(mensagensAgendadas, filtro)
    const q = busca.trim().toLowerCase()
    if (q) {
      items = items.filter(
        (m) =>
          m.cliente_nome.toLowerCase().includes(q) ||
          m.telefone.includes(q) ||
          m.placa?.toLowerCase().includes(q) ||
          String(m.ordem_servico_numero ?? '').includes(q)
      )
    }
    return items
  }, [mensagensAgendadas, filtro, busca])

  function acaoCopiar(mensagem: MensagemAgendadaComStatus) {
    void navigator.clipboard.writeText(mensagem.mensagem).then(
      () => toast.sucesso('Mensagem copiada.'),
      () => toast.erro('Não foi possível copiar.')
    )
  }

  function acaoWhatsApp(mensagem: MensagemAgendadaComStatus) {
    if (!mensagem.telefone?.trim()) {
      toast.erro('Cliente sem telefone cadastrado.')
      return
    }
    try {
      abrirWhatsAppWeb(mensagem.telefone, mensagem.mensagem)
    } catch (err) {
      toast.erro(err instanceof Error ? err.message : 'Não foi possível abrir o WhatsApp.')
    }
  }

  return (
    <div className="space-y-6">
      {mostrarResumo && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="text-2xl font-bold text-amber-500">
              {resumoMensagensAgendadas.totalPendentesHoje}
            </p>
            <p className="text-sm text-muted-foreground">Para enviar hoje</p>
          </div>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-2xl font-bold text-destructive">
              {resumoMensagensAgendadas.totalAtrasadas}
            </p>
            <p className="text-sm text-muted-foreground">Atrasadas</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-2xl font-bold">{resumoMensagensAgendadas.proximas.length}</p>
            <p className="text-sm text-muted-foreground">Próximas</p>
          </div>
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
            <p className="text-2xl font-bold text-emerald-500">
              {resumoMensagensAgendadas.enviadas.length}
            </p>
            <p className="text-sm text-muted-foreground">Enviadas</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-5 w-5 text-primary" />
              Mensagens agendadas
            </CardTitle>
            <CardDescription>
              Agende avisos e abra o WhatsApp manualmente no horário certo
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setDialogNova(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova mensagem
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {FILTROS_MENSAGENS_AGENDADAS.map((f) => (
                <Button
                  key={f.value}
                  size="sm"
                  variant={filtro === f.value ? 'default' : 'outline'}
                  onClick={() => setFiltro(f.value)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
            <BuscaInput
              valor={busca}
              onChange={setBusca}
              placeholder="Buscar cliente, placa ou OS..."
              className="w-full sm:max-w-xs"
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agendado</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      Nenhuma mensagem neste filtro.
                    </TableCell>
                  </TableRow>
                ) : (
                  lista.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatarDataHora(item.agendado_para)}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{item.cliente_nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatarTelefone(item.telefone)}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm">
                        {item.veiculo_descricao ? (
                          <>
                            <p>{item.veiculo_descricao}</p>
                            {item.placa && (
                              <p className="text-xs text-muted-foreground">{item.placa}</p>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {getLabelTipoMensagemOficina(item.tipo_mensagem, configuracao)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {getLabelOrigemMensagemAgendada(item.origem)}
                        {item.ordem_servico_numero ? ` #${item.ordem_servico_numero}` : ''}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(STATUS_VARIANT[item.status_exibicao])}
                        >
                          {getLabelStatusMensagemAgendada(item.status_exibicao)}
                        </Badge>
                        {item.responsavel_nome && (
                          <p className="mt-1 text-xs text-muted-foreground">{item.responsavel_nome}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-1">
                          {item.status === 'pendente' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => acaoWhatsApp(item)}
                                title="Abrir WhatsApp"
                              >
                                <MessageCircle className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => acaoCopiar(item)}
                                title="Copiar mensagem"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setMensagemAdiar(item)}
                                title="Adiar agendamento"
                              >
                                <Clock className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => marcarMensagemEnviada(item.id, item.mensagem)}
                                title="Marcar como enviada"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => cancelarMensagemAgendada(item.id)}
                                title="Cancelar agendamento"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {item.status === 'enviada' && item.enviado_em && (
                            <span className="text-xs text-muted-foreground">
                              {formatarData(item.enviado_em.slice(0, 10))}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AgendarMensagemDialog
        aberto={dialogNova}
        onFechar={() => setDialogNova(false)}
        permitirSelecionarCliente
        origem="manual"
        titulo="Agendar mensagem manual"
      />

      <AdiarMensagemAgendadaDialog
        mensagem={mensagemAdiar}
        aberto={mensagemAdiar != null}
        onFechar={() => setMensagemAdiar(null)}
        onConfirmar={(id, data, hora) => {
          adiarMensagemAgendada(id, data, hora)
          toast.sucesso('Mensagem reagendada.')
        }}
      />
    </div>
  )
}
