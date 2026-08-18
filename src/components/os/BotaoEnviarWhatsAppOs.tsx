import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  EnviarWhatsAppOsDialog,
  type DetalheMarcarEnvioCliente,
} from '@/components/os/EnviarWhatsAppOsDialog'
import { useAssinatura } from '@/context/AssinaturaContext'
import { useAuth } from '@/context/AuthContext'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { ehDocumentoOrcamento } from '@/lib/os-modo-documento'
import { patchMarcarOrcamentoEnviado } from '@/lib/orcamento-fluxo'
import {
  podeEnviarWhatsAppOs,
  rotuloBotaoEnviarWhatsAppOs,
  type TipoEnvioCliente,
} from '@/lib/whatsapp-os-mensagem'
import { anexarEventosHistoricoOS, criarEventoHistoricoOS } from '@/services/os-historico.service'
import { podeVerValoresFinanceirosOS } from '@/services/auth/permissions'
import { temRecursoComAssinatura } from '@/services/assinatura/plano-features'
import type { Cliente, Moto, OrdemServico } from '@/types'
import { cn } from '@/lib/utils'

interface BotaoEnviarWhatsAppOsProps {
  os: OrdemServico
  cliente: Cliente
  moto: Moto
  variant?: 'icon' | 'sm' | 'default'
  className?: string
  exibirValores?: boolean
  /** Abre o modal já no tipo escolhido (ex.: fotos). */
  tipoInicial?: TipoEnvioCliente
  /** Rótulo do botão; se omitido, usa o padrão. */
  rotulo?: string
}

export function BotaoEnviarWhatsAppOs({
  os,
  cliente,
  moto,
  variant = 'sm',
  className,
  exibirValores,
  tipoInicial,
  rotulo: rotuloProp,
}: BotaoEnviarWhatsAppOsProps) {
  const { session } = useAuth()
  const { assinatura, temRecurso } = useAssinatura()
  const { configuracao } = useOficinaData()
  const { atualizarOS } = useCraft()
  const [dialogAberto, setDialogAberto] = useState(false)

  const user = session?.user
  if (!user || !podeEnviarWhatsAppOs(user, os, configuracao)) {
    return null
  }

  const usuarioAtual = user

  const rotulo =
    rotuloProp ??
    (tipoInicial === 'fotos' ? 'Enviar fotos ao cliente' : rotuloBotaoEnviarWhatsAppOs(os))
  const mostrarValores =
    exibirValores ?? podeVerValoresFinanceirosOS(usuarioAtual, configuracao)
  const podeExportarPdf = temRecursoComAssinatura(assinatura, 'pdf_os')

  function handleAbrir() {
    if (!temRecurso('comunicacao')) {
      window.alert(
        'Comunicação com cliente disponível a partir do plano Profissional. Acesse Planos para fazer upgrade.'
      )
      return
    }
    setDialogAberto(true)
  }

  async function handleMarcarComoEnviado(detalhe: DetalheMarcarEnvioCliente) {
    const tituloHistorico =
      detalhe.tipo === 'fotos'
        ? 'Envio de fotos ao cliente (WhatsApp)'
        : 'Comunicação WhatsApp manual'

    const evento = criarEventoHistoricoOS({
      tipo: 'comunicacao_whatsapp',
      titulo: tituloHistorico,
      usuario_id: usuarioAtual.id,
      usuario_nome: usuarioAtual.nome,
      detalhe: detalhe.detalheHistorico,
    })

    const patch: Partial<OrdemServico> = {
      ...anexarEventosHistoricoOS(os, [evento]),
    }

    // Só marca orçamento como enviado quando o tipo for orçamento/portal.
    if (
      ehDocumentoOrcamento(os) &&
      (detalhe.tipo === 'orcamento' || detalhe.tipo === 'link_aprovacao')
    ) {
      const statusPatch = patchMarcarOrcamentoEnviado(os)
      if (statusPatch) Object.assign(patch, statusPatch)
    }

    await atualizarOS(os.id, patch)
  }

  return (
    <>
      {variant === 'icon' ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleAbrir}
          title={rotulo}
          className={cn('text-emerald-400 hover:text-emerald-300', className)}
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          variant={variant === 'default' ? 'default' : 'outline'}
          size="sm"
          onClick={handleAbrir}
          className={cn(
            'gap-2',
            variant !== 'default' && 'text-emerald-400 border-emerald-500/30',
            className
          )}
        >
          <MessageCircle className="h-4 w-4" />
          {rotulo}
        </Button>
      )}

      <EnviarWhatsAppOsDialog
        aberto={dialogAberto}
        onFechar={() => setDialogAberto(false)}
        os={os}
        cliente={cliente}
        moto={moto}
        exibirValores={mostrarValores}
        podeExportarPdf={podeExportarPdf}
        tipoInicial={tipoInicial}
        onMarcarComoEnviado={handleMarcarComoEnviado}
      />
    </>
  )
}
