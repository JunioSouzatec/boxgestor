import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  FileDown,
  Loader2,
  Pencil,
  Printer,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { OsDocumentoConteudo } from '@/components/os/OsDocumentoConteudo'
import { BotaoEnviarWhatsAppOs } from '@/components/os/BotaoEnviarWhatsAppOs'
import { useAuth } from '@/context/AuthContext'
import { useAssinatura } from '@/context/AssinaturaContext'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { useSalvarAcao } from '@/hooks/useSalvarAcao'
import { buildOsDocumentoViewModel, exportarOsPdf } from '@/services/os-pdf.service'
import { temRecursoComAssinatura } from '@/services/assinatura/plano-features'
import {
  osVisivelParaUsuario,
  podeAcessarModuloUsuario,
  podeVerValoresFinanceirosOS,
} from '@/services/auth/permissions'
import { ehDocumentoOrcamento, converterOrcamentoEmOS } from '@/lib/os-modo-documento'
import { resolverOsPorParametroRota } from '@/lib/rota-os'
import { normalizarTipoOficina } from '@/types/tipo-oficina'
import { garantirChecklistPadrao } from '@/services/checklist-modelo.service'
import type { OrdemServico } from '@/types'

export function OrdensServicoVisualizarPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { session } = useAuth()
  const user = session?.user
  const { assinatura } = useAssinatura()
  const { atualizarOS } = useCraft()
  const { ordens, clientes, motos, lancamentos, configuracao, modelosChecklist } =
    useOficinaData()
  const officeId = configuracao.office_id ?? configuracao.oficina_id
  const tipoOficina = normalizarTipoOficina(configuracao.tipo_oficina)
  const modelosSeguros = useMemo(
    () => garantirChecklistPadrao(modelosChecklist, officeId, tipoOficina),
    [modelosChecklist, officeId, tipoOficina]
  )
  const { executar } = useSalvarAcao()
  const [exportandoPdf, setExportandoPdf] = useState(false)

  const os = useMemo(
    () => resolverOsPorParametroRota(ordens, id),
    [ordens, id]
  )

  const podeVerModulo = useMemo(
    () =>
      user != null && podeAcessarModuloUsuario(user, 'ordens_servico', configuracao),
    [user, configuracao]
  )

  const podeVerFinanceiro = useMemo(
    () => podeVerValoresFinanceirosOS(user ?? 'dono', configuracao),
    [user, configuracao]
  )

  const podeExportarPdf = temRecursoComAssinatura(assinatura, 'pdf_os')

  const dados = useMemo(() => {
    if (!os) return null
    const cliente = clientes.find((c) => c.id === os.cliente_id)
    const moto = motos.find((m) => m.id === os.moto_id)
    if (!cliente || !moto) return null
    return buildOsDocumentoViewModel(
      os,
      cliente,
      moto,
      configuracao,
      lancamentos,
      modelosSeguros,
      officeId
    )
  }, [os, clientes, motos, configuracao, lancamentos, modelosSeguros, officeId])

  useEffect(() => {
    if (!dados) return
    document.title = `${dados.os.rotuloNumero} — BoxGestor`
    return () => {
      document.title = 'BoxGestor'
    }
  }, [dados])

  if (!id) {
    return <Navigate to="/ordens-servico" replace />
  }

  if (!podeVerModulo) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
        <p className="max-w-md text-sm text-muted-foreground">
          Você não tem permissão para visualizar esta ordem de serviço.
        </p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/ordens-servico">Voltar para ordens de serviço</Link>
        </Button>
      </div>
    )
  }

  if (!os) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-sm text-muted-foreground">Ordem de serviço não encontrada.</p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/ordens-servico">Voltar para ordens de serviço</Link>
        </Button>
      </div>
    )
  }

  if (!user || !osVisivelParaUsuario(os, user, configuracao)) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
        <p className="max-w-md text-sm text-muted-foreground">
          Você não tem permissão para visualizar esta ordem de serviço.
        </p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/ordens-servico">Voltar para ordens de serviço</Link>
        </Button>
      </div>
    )
  }

  if (!dados) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-sm text-muted-foreground">
          Não foi possível montar o documento desta ordem de serviço.
        </p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/ordens-servico">Voltar para ordens de serviço</Link>
        </Button>
      </div>
    )
  }

  const ehOrcamento = ehDocumentoOrcamento(os)
  const cliente = clientes.find((c) => c.id === os.cliente_id)
  const moto = motos.find((m) => m.id === os.moto_id)

  function voltarLista() {
    navigate('/ordens-servico')
  }

  function abrirEditar() {
    navigate(`/ordens-servico?editar=${os!.id}`)
  }

  async function exportarPdf() {
    if (!podeExportarPdf) {
      window.alert('Exportação PDF disponível a partir do plano Profissional.')
      return
    }
    const cliente = clientes.find((c) => c.id === os!.cliente_id)
    const moto = motos.find((m) => m.id === os!.moto_id)
    if (!cliente || !moto) {
      window.alert('Cliente ou veículo não encontrados para esta OS.')
      return
    }

    setExportandoPdf(true)
    try {
      await exportarOsPdf(
        os!,
        cliente,
        moto,
        configuracao,
        lancamentos,
        modelosSeguros,
        officeId
      )
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : 'Não foi possível gerar o PDF da ordem de serviço.'
      )
    } finally {
      setExportandoPdf(false)
    }
  }

  function imprimir() {
    document.body.classList.add('os-imprimindo-documento')
    window.print()
    window.addEventListener(
      'afterprint',
      () => {
        document.body.classList.remove('os-imprimindo-documento')
      },
      { once: true }
    )
  }

  async function converterOrcamentoParaOS(ordem: OrdemServico) {
    const convertida = converterOrcamentoEmOS(ordem)
    void executar({
      acao: async () => {
        atualizarOS(ordem.id, {
          modo_documento: 'os',
          status: convertida.status,
          status_orcamento: undefined,
          data_orcamento: undefined,
          observacoes_orcamento: undefined,
        })
      },
      sucesso: 'Orçamento convertido em Ordem de Serviço.',
      onSuccess: () => {
        navigate(`/ordens-servico/${ordem.id}/visualizar`, { replace: true })
      },
    })
  }

  return (
    <div className="os-visualizacao-print-root -mx-4 -mb-24 -mt-4 flex min-h-[calc(100dvh-4rem)] flex-col sm:-mx-6 sm:-mt-6 lg:-mb-6">
      <div className="os-visualizacao-barra sticky top-0 z-20 shrink-0 border-b border-border bg-background/95 px-3 py-3 backdrop-blur-sm sm:px-4">
        <div className="mx-auto flex max-w-[210mm] flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-lg font-semibold sm:text-xl">{dados.os.rotuloNumero}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={ehOrcamento ? 'secondary' : 'outline'}>
                  {dados.os.tituloDocumento}
                </Badge>
                <span className="text-sm text-muted-foreground">Status: {dados.os.status}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={voltarLista}>
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
              <Button variant="outline" size="sm" onClick={abrirEditar}>
                <Pencil className="h-4 w-4" />
                Editar OS
              </Button>
              {ehOrcamento && (
                <Button variant="default" size="sm" onClick={() => void converterOrcamentoParaOS(os)}>
                  Converter em OS
                </Button>
              )}
              {podeExportarPdf && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => void exportarPdf()}
                  disabled={exportandoPdf}
                >
                  {exportandoPdf ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4" />
                  )}
                  {exportandoPdf
                    ? 'Gerando PDF...'
                    : ehOrcamento
                      ? 'Baixar orçamento'
                      : 'Baixar PDF'}
                </Button>
              )}
              {cliente && moto && (
                <BotaoEnviarWhatsAppOs
                  os={os}
                  cliente={cliente}
                  moto={moto}
                  variant="default"
                  exibirValores={podeVerFinanceiro}
                />
              )}
              <Button variant="outline" size="sm" onClick={imprimir}>
                <Printer className="h-4 w-4" />
                Imprimir
              </Button>
              <Button variant="ghost" size="sm" onClick={voltarLista}>
                <X className="h-4 w-4" />
                Fechar
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-800/95 py-4 sm:py-8">
        <div className="mx-auto w-full max-w-[210mm] px-2 sm:px-4">
          <div className="os-visualizacao-documento overflow-x-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-xl sm:p-8">
            <OsDocumentoConteudo dados={dados} exibirFinanceiro={podeVerFinanceiro} />
          </div>
        </div>
      </div>
    </div>
  )
}
