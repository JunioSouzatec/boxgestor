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
import { calcularTotalGeralDeCampos } from '@/services/os-financeiro.service'
import { useAssinatura } from '@/context/AssinaturaContext'
import { useAuth } from '@/context/AuthContext'
import { useComunicacao } from '@/context/ComunicacaoContext'
import { useOficinaData } from '@/context/CraftContext'
import {
  montarMensagem,
  sugerirTipoMensagem,
  getLabelStatusOS,
} from '@/services/comunicacao/comunicacao.service'
import { abrirWhatsAppWeb } from '@/services/comunicacao/whatsapp.service'
import { TIPOS_MENSAGEM, type TipoMensagem } from '@/types/comunicacao'
import { formatarMoeda } from '@/lib/utils'
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
  const { configuracao } = useOficinaData()
  const { registrarContato } = useComunicacao()
  const [dialogAberto, setDialogAberto] = useState(false)

  const papel = session?.user.papel
  if (!papel || !PAPEIS_COMUNICACAO.includes(papel as (typeof PAPEIS_COMUNICACAO)[number])) {
    return null
  }

  const tipoInicial =
    tipoSugerido ??
    (os ? sugerirTipoMensagem(os.status, os.status_orcamento) : 'lembrete_revisao')

  const [tipo, setTipo] = useState<TipoMensagem>(tipoInicial)

  useEffect(() => {
    if (dialogAberto) setTipo(tipoInicial)
  }, [dialogAberto, tipoInicial])

  const vars = useMemo(
    () => ({
      nome_cliente: cliente.nome,
      moto: moto ? `${moto.marca} ${moto.modelo}` : 'sua moto',
      placa: moto?.placa ?? '—',
      status_os: os ? getLabelStatusOS(os.status) : '—',
      nome_oficina: configuracao.nome,
      numero_os: os ? String(os.numero) : '—',
      valor_os: os ? formatarMoeda(calcularTotalGeralDeCampos(os)) : undefined,
      data_garantia: os?.data_vencimento_garantia,
    }),
    [cliente.nome, moto, os, configuracao.nome]
  )

  const mensagem = useMemo(() => montarMensagem(tipo, vars), [tipo, vars])

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
              {moto && (
                <p className="mt-1 text-muted-foreground">
                  {moto.marca} {moto.modelo} · {moto.placa}
                </p>
              )}
              {os && (
                <p className="mt-1 text-muted-foreground">
                  OS #{os.numero} · {getLabelStatusOS(os.status)}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label>Mensagem pronta</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoMensagem)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_MENSAGEM.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Pré-visualização</Label>
              <Textarea value={mensagem} readOnly rows={8} className="resize-none text-sm" />
            </div>

            <Button onClick={handleEnviar} className="w-full gap-2 bg-emerald-600 hover:bg-emerald-500">
              <MessageCircle className="h-4 w-4" />
              Abrir WhatsApp Web
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
