import { useMemo, useState } from 'react'
import { BellRing } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BuscaInput } from '@/components/shared/BuscaInput'
import { AlertaComunicacaoCard, AlertasResumoCards } from '@/components/comunicacao/AlertaComunicacaoCard'
import { AdiarAlertaDialog } from '@/components/comunicacao/AdiarAlertaDialog'
import { AlertaMensagemDialog } from '@/components/comunicacao/AlertaMensagemDialog'
import { useComunicacao } from '@/context/ComunicacaoContext'
import { useToast } from '@/context/ToastContext'
import { abrirWhatsAppWeb } from '@/services/comunicacao/whatsapp.service'
import { filtrarAlertas } from '@/services/comunicacao/alertas-comunicacao.service'
import {
  FILTROS_ALERTAS_COMUNICACAO,
  type AlertaComunicacao,
  type FiltroAlertasComunicacao,
} from '@/types/alerta-comunicacao'

export function AlertasComunicacaoSection() {
  const {
    alertas,
    resumoAlertas,
    atualizarMensagemAlerta,
    marcarAlertaEnviado,
    marcarAlertaResolvido,
    adiarAlerta,
    registrarContato,
  } = useComunicacao()
  const { toast } = useToast()

  const [filtro, setFiltro] = useState<FiltroAlertasComunicacao>('pendentes')
  const [busca, setBusca] = useState('')
  const [alertaMensagem, setAlertaMensagem] = useState<AlertaComunicacao | null>(null)
  const [alertaAdiar, setAlertaAdiar] = useState<AlertaComunicacao | null>(null)

  const lista = useMemo(() => {
    let items = filtrarAlertas(alertas, filtro)
    const q = busca.trim().toLowerCase()
    if (q) {
      items = items.filter(
        (a) =>
          a.cliente_nome.toLowerCase().includes(q) ||
          a.motivo.toLowerCase().includes(q) ||
          a.placa?.toLowerCase().includes(q) ||
          a.moto_descricao?.toLowerCase().includes(q) ||
          String(a.ordem_servico_numero ?? '').includes(q)
      )
    }
    return items
  }, [alertas, filtro, busca])

  function copiar(alerta: AlertaComunicacao) {
    void navigator.clipboard.writeText(alerta.message_text).then(
      () => toast.sucesso('Mensagem copiada.'),
      () => toast.erro('Não foi possível copiar.')
    )
  }

  function registrarEnvio(alerta: AlertaComunicacao, texto: string) {
    marcarAlertaEnviado(alerta.id)
    registrarContato({
      cliente_id: alerta.cliente_id,
      cliente_nome: alerta.cliente_nome,
      tipo_mensagem: alerta.tipo_mensagem,
      ordem_servico_id: alerta.ordem_servico_id,
      ordem_servico_numero: alerta.ordem_servico_numero,
      mensagemCompleta: texto,
    })
    toast.sucesso('Alerta marcado como enviado e registrado no histórico.')
  }

  function handleEnviarDoDialog(id: string, texto: string) {
    const alerta = alertas.find((a) => a.id === id)
    if (alerta) registrarEnvio(alerta, texto)
  }

  function handleWhatsAppDireto(alerta: AlertaComunicacao) {
    if (!alerta.telefone?.trim()) {
      toast.erro('Cliente sem telefone cadastrado.')
      return
    }
    try {
      abrirWhatsAppWeb(alerta.telefone, alerta.message_text)
      registrarEnvio(alerta, alerta.message_text)
    } catch (err) {
      toast.erro(err instanceof Error ? err.message : 'Não foi possível abrir o WhatsApp.')
    }
  }

  return (
    <div className="space-y-6">
      <AlertasResumoCards
        vencidos={resumoAlertas.vencidos}
        hoje={resumoAlertas.hoje}
        proximos={resumoAlertas.proximos}
        pendentes={resumoAlertas.pendentes}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRing className="h-5 w-5 text-amber-400" />
            Central de alertas
          </CardTitle>
          <CardDescription>
            Retornos, entregas, revisões e agendamentos — revise a mensagem antes de enviar pelo
            WhatsApp
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {FILTROS_ALERTAS_COMUNICACAO.map((f) => (
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

          {lista.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-12 text-center text-muted-foreground">
              Nenhum alerta neste filtro.
            </div>
          ) : (
            <div className="grid gap-3">
              {lista.map((alerta) => (
                <AlertaComunicacaoCard
                  key={alerta.id}
                  alerta={alerta}
                  onVerMensagem={setAlertaMensagem}
                  onWhatsApp={handleWhatsAppDireto}
                  onCopiar={copiar}
                  onAdiar={setAlertaAdiar}
                  onResolver={(a) => {
                    marcarAlertaResolvido(a.id)
                    toast.sucesso('Alerta marcado como resolvido.')
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertaMensagemDialog
        alerta={alertaMensagem}
        aberto={alertaMensagem != null}
        onFechar={() => setAlertaMensagem(null)}
        onSalvarMensagem={atualizarMensagemAlerta}
        onEnviarWhatsApp={handleEnviarDoDialog}
      />

      <AdiarAlertaDialog
        alerta={alertaAdiar}
        aberto={alertaAdiar != null}
        onFechar={() => setAlertaAdiar(null)}
        onConfirmar={(id, data) => {
          adiarAlerta(id, data)
          toast.sucesso('Alerta adiado.')
        }}
      />
    </div>
  )
}
