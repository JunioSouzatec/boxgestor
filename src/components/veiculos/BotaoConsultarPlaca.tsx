/* Helpers de consulta exportados neste arquivo — extração em etapa futura. */
/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ehPlacaBrasileiraValida,
  MSG_PLACA_INVALIDA_CONSULTA,
  normalizarPlaca,
} from '@/lib/placa-normalizar'
import { useAuth } from '@/context/AuthContext'
import { useCraft } from '@/context/CraftContext'
import { supabaseUrl } from '@/lib/supabase-env'
import {
  consultarPlacaVeiculo,
  dadosConsultaPlacaTemConteudoUtil,
  type CamposVeiculoParaConsulta,
  type ConsultaPlacaResultado,
  type ConsultaPlacaSucessoReal,
  type DadosBasicosVeiculoConsulta,
} from '@/services/veiculos/vehicle-plate-lookup.service'
import {
  criarTentativaConsultaPlaca,
  decisaoPersistenciaPorCodigo,
  ehIdentidadeConsultaPlacaValida,
  encerrarTentativaConsultaPlaca,
  HOMOLOG_SUPABASE_HOST,
  localizarTentativaConsultaPlaca,
  marcarTentativaConsultaIncerta,
  normalizarHostProjetoConsulta,
  type IdentidadeConsultaPlaca,
  type PlateLookupIdempotencyDeps,
} from '@/services/veiculos/plate-lookup-idempotency.store'
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import {
  detectarConflitosConsultaPlaca,
  formatarMensagemConfirmacaoConsultaPlaca,
  snapshotCamposConsultaPlaca,
  type MetadadosOrigemCamposVeiculo,
  type ModoFormularioVeiculo,
} from '@/lib/moto-form'
import {
  verificarPlacaCadastradaNaOficina,
  type ResultadoVerificacaoPlacaOficina,
  type VeiculoOficinaPorPlaca,
} from '@/services/veiculos/veiculo-verificacao-placa-oficina.service'

export const AVISO_VEICULO_JA_CADASTRADO =
  'Veículo já cadastrado nesta oficina.'

export const AVISO_COMPLEMENTO_FRANQUIA =
  'A consulta ao fornecedor pode utilizar franquia do plano ou gerar excedente, conforme as regras já vigentes.'

export const AVISO_DADOS_SIMULADOS =
  'DADOS SIMULADOS — ambiente de testes. Não representam consulta real.'

export const AVISO_DADOS_REAIS = 'Dados retornados pela consulta de placa.'

export const MSG_DADOS_PREENCHIDOS_FORMULARIO =
  'Dados da consulta foram preenchidos no formulário. Confira os campos antes de salvar.'

export type AplicacaoDadosConsultaPlacaOpcoes = {
  sobrescreverConfirmado: boolean
}

export interface BotaoConsultarPlacaProps {
  placa: string
  disabled?: boolean
  /** Aplica dados ao formulário somente após "Usar estes dados" (e confirmação, se houver). */
  onDadosEncontrados?: (
    dados: DadosBasicosVeiculoConsulta,
    opcoes: AplicacaoDadosConsultaPlacaOpcoes
  ) => void
  /** Valores atuais do formulário para detectar conflitos. */
  camposAtuais?: CamposVeiculoParaConsulta
  /** Origem dos valores (manual vs consulta) — cadastro novo. */
  origemCampos?: MetadadosOrigemCamposVeiculo
  /** Cadastro novo ou edição — obrigatório quando há callback de aplicação. */
  modoFormulario?: ModoFormularioVeiculo
  /** Combustível só entra na aplicação quando o campo existe no formulário. */
  incluirCombustivel?: boolean
  variant?: ComponentProps<typeof Button>['variant']
  size?: ComponentProps<typeof Button>['size']
  className?: string
  /** Só para testes locais. Formulários não passam. */
  consultar?: (placa: string, idempotencyKey: string) => Promise<ConsultaPlacaResultado>
  /** Só para testes locais. Produção usa AuthContext + VITE_SUPABASE_URL. */
  obterIdentidade?: () => IdentidadeConsultaPlaca | null
  /** Só para testes locais. */
  storeDeps?: PlateLookupIdempotencyDeps
  /** Em edição, ignora o próprio veículo na verificação local. */
  excluirMotoId?: string
  /** Cliente selecionado no formulário — detecta placa de outro cliente. */
  clienteIdContexto?: string
  resolverNomeCliente?: (clienteId: string) => string | undefined
  /** Só para testes locais — substitui verificação no cadastro da oficina. */
  verificarPlacaOficina?: typeof verificarPlacaCadastradaNaOficina
}

export function mensagemUsuarioConsultaPlaca(code: string, fallback?: string): string {
  switch (code) {
    case 'PLATE_LOOKUP_SIMULATED_NOT_FOUND':
      return 'Nenhum veículo encontrado para esta placa.'
    case 'PLATE_LOOKUP_SIMULATED_TIMEOUT':
      return 'Tempo de resposta excedido na consulta simulada.'
    case 'PLATE_LOOKUP_SIMULATED_ERROR':
      return 'Falha simulada na consulta do fornecedor.'
    case 'PLATE_LOOKUP_RECONCILIATION_PENDING':
    case 'PLATE_LOOKUP_FINALIZE_PENDING':
      return 'Não foi possível confirmar a finalização da consulta. Não inicie outra tentativa.'
    case 'PLATE_NOT_FOUND':
      return 'Nenhum veículo encontrado para esta placa.'
    case 'TRIAL_QUOTA_EXCEEDED':
      return 'Você atingiu o limite de consultas do período de teste.'
    case 'PLATE_LOOKUP_UNAUTHENTICATED':
      return 'Sessão expirada. Faça login novamente.'
    case 'PLATE_LOOKUP_PROJECT_BLOCKED':
      return 'Consulta disponível somente no ambiente de homologação.'
    case 'IDEMPOTENCY_REPLAY_BLOCKED':
    case 'IDEMPOTENCY_PLATE_MISMATCH':
      return 'Não foi possível reutilizar esta tentativa. Verifique a consulta antes de tentar novamente.'
    case 'PLATE_LOOKUP_DISABLED':
    case 'PLATE_LOOKUP_REAL_MODE_BLOCKED':
      return 'Consulta por placa indisponível neste ambiente.'
    case 'PLATE_LOOKUP_NETWORK_ERROR':
      return 'Não foi possível comunicar com o serviço.'
    case 'PLATE_INVALID':
      return MSG_PLACA_INVALIDA_CONSULTA
    case 'RESERVATION_EXPIRED':
      return 'A tentativa anterior expirou e foi encerrada. Clique novamente em Consultar placa para iniciar uma nova consulta.'
    case 'PLATE_LOOKUP_STORE_FULL':
      return 'Há consultas em aberto demais nesta sessão. Conclua as tentativas pendentes antes de consultar outra placa.'
    default:
      return fallback?.trim() || 'Consulta por placa indisponível no momento.'
  }
}

export function ehConsultaSimulada(resultado: ConsultaPlacaResultado): boolean {
  if (resultado.ok) {
    return resultado.code === 'PLATE_LOOKUP_SIMULATED_OK'
  }
  return resultado.simulacao === true
}

export function ehConsultaReal(resultado: ConsultaPlacaResultado): boolean {
  return resultado.ok === true && resultado.code === 'PLATE_LOOKUP_OK'
}

export type CampoPreviewConsulta = {
  rotulo: string
  valor: string
}

export function camposPreviewConsulta(
  dados: DadosBasicosVeiculoConsulta
): CampoPreviewConsulta[] {
  const linhas: CampoPreviewConsulta[] = [{ rotulo: 'Placa', valor: dados.placa }]
  if (dados.marca) linhas.push({ rotulo: 'Marca', valor: dados.marca })
  if (dados.modelo) linhas.push({ rotulo: 'Modelo', valor: dados.modelo })
  if (dados.ano !== undefined) linhas.push({ rotulo: 'Ano', valor: String(dados.ano) })
  if (dados.cor) linhas.push({ rotulo: 'Cor', valor: dados.cor })
  if (dados.municipio) linhas.push({ rotulo: 'Município', valor: dados.municipio })
  if (dados.uf) linhas.push({ rotulo: 'UF', valor: dados.uf })
  if (dados.combustivel) linhas.push({ rotulo: 'Combustível', valor: dados.combustivel })
  return linhas
}

export type TentativaConsultaBotao = {
  placaNorm: string
  chave: string
}

type SessaoConsultaPlaca = {
  user?: { id?: string; office_id?: string }
} | null

export function motivoIdentidadeConsultaInvalida(
  session: SessaoConsultaPlaca | undefined,
  projectUrlOuHost?: string | null
): 'PLATE_LOOKUP_UNAUTHENTICATED' | 'PLATE_LOOKUP_PROJECT_BLOCKED' | null {
  const host = normalizarHostProjetoConsulta(projectUrlOuHost ?? '')
  const userId = session?.user?.id?.trim() ?? ''
  const officeId = session?.user?.office_id?.trim() ?? ''
  if (host && host !== HOMOLOG_SUPABASE_HOST) return 'PLATE_LOOKUP_PROJECT_BLOCKED'
  if (!userId || !officeId) return 'PLATE_LOOKUP_UNAUTHENTICATED'
  if (!host) return 'PLATE_LOOKUP_PROJECT_BLOCKED'
  const identidade = { projectHost: host, userId, officeId }
  return ehIdentidadeConsultaPlacaValida(identidade) ? null : 'PLATE_LOOKUP_UNAUTHENTICATED'
}

export function identidadeConsultaDaSessao(
  session: SessaoConsultaPlaca | undefined,
  projectUrlOuHost?: string | null
): IdentidadeConsultaPlaca | null {
  if (motivoIdentidadeConsultaInvalida(session, projectUrlOuHost)) return null
  return {
    projectHost: HOMOLOG_SUPABASE_HOST,
    userId: session!.user!.id!.trim(),
    officeId: session!.user!.office_id!.trim(),
  }
}

export function prepararTentativaConsultaPersistida(
  identidade: IdentidadeConsultaPlaca,
  placa: string,
  deps?: PlateLookupIdempotencyDeps
):
  | { ok: true; criada: boolean; chave: string }
  | { ok: false; code: 'PLATE_LOOKUP_STORE_FULL' | 'PLATE_INVALID' } {
  if (!ehPlacaBrasileiraValida(placa)) {
    return { ok: false, code: 'PLATE_INVALID' }
  }
  const existente = localizarTentativaConsultaPlaca(identidade, placa, deps)
  if (existente) {
    return { ok: true, criada: false, chave: existente.idempotencyKey }
  }
  const criada = criarTentativaConsultaPlaca(identidade, placa, deps)
  if (!criada) return { ok: false, code: 'PLATE_LOOKUP_STORE_FULL' }
  return { ok: true, criada: criada.criada, chave: criada.registro.idempotencyKey }
}

export function resultadoTerminalConsultaConfirmado(
  resultado: ConsultaPlacaResultado
): boolean {
  if (resultado.ok) {
    if (
      resultado.code === 'PLATE_LOOKUP_SIMULATED_OK' &&
      Boolean(resultado.dados?.placa) &&
      resultado.dados.fonte === 'simulacao_homolog'
    ) {
      return true
    }
    return (
      resultado.code === 'PLATE_LOOKUP_OK' &&
      resultado.status === 'finalized' &&
      resultado.dados.fonte === 'api_placas'
    )
  }
  return (
    resultado.code === 'PLATE_LOOKUP_SIMULATED_NOT_FOUND' ||
    resultado.code === 'PLATE_LOOKUP_SIMULATED_TIMEOUT' ||
    resultado.code === 'PLATE_LOOKUP_SIMULATED_ERROR' ||
    resultado.code === 'PLATE_NOT_FOUND'
  )
}

export function persistirResultadoTentativaConsulta(opts: {
  identidade: IdentidadeConsultaPlaca
  placa: string
  chave: string
  resultado: ConsultaPlacaResultado
  seqResposta: number
  seqAtual: number
  deps?: PlateLookupIdempotencyDeps
}): 'encerrou' | 'marcou_incerta' | 'preservou_stale' | 'preservou_bloqueio' {
  if (opts.seqResposta !== opts.seqAtual) return 'preservou_stale'

  const atual = localizarTentativaConsultaPlaca(opts.identidade, opts.placa, opts.deps)
  if (!atual || atual.idempotencyKey !== opts.chave) return 'preservou_stale'

  const chaveResposta = opts.resultado.idempotency_key
  if (chaveResposta && chaveResposta !== opts.chave) return 'preservou_stale'

  if (resultadoTerminalConsultaConfirmado(opts.resultado)) {
    encerrarTentativaConsultaPlaca(opts.identidade, opts.placa, opts.deps)
    return 'encerrou'
  }

  const code = opts.resultado.code
  if (code === 'IDEMPOTENCY_REPLAY_BLOCKED' || code === 'IDEMPOTENCY_PLATE_MISMATCH') {
    marcarTentativaConsultaIncerta(opts.identidade, opts.placa, opts.deps)
    return 'preservou_bloqueio'
  }

  if (code === 'RESERVATION_EXPIRED') {
    encerrarTentativaConsultaPlaca(opts.identidade, opts.placa, opts.deps)
    return 'encerrou'
  }

  const decisao = decisaoPersistenciaPorCodigo(code)
  if (decisao === 'encerrar') {
    if (
      code === 'TRIAL_QUOTA_EXCEEDED' ||
      code === 'PLATE_LOOKUP_UNAUTHENTICATED' ||
      code === 'PLATE_LOOKUP_PROJECT_BLOCKED' ||
      code === 'PLATE_LOOKUP_DISABLED' ||
      code === 'PLATE_LOOKUP_REAL_MODE_BLOCKED' ||
      code === 'PLATE_INVALID' ||
      code === 'IDEMPOTENCY_INVALID'
    ) {
      encerrarTentativaConsultaPlaca(opts.identidade, opts.placa, opts.deps)
      return 'encerrou'
    }
    marcarTentativaConsultaIncerta(opts.identidade, opts.placa, opts.deps)
    return 'preservou_bloqueio'
  }

  marcarTentativaConsultaIncerta(opts.identidade, opts.placa, opts.deps)
  return 'marcou_incerta'
}

export function deveAplicarResultadoConsulta(opts: {
  seqResposta: number
  seqAtual: number
  montado: boolean
  dialogAberto: boolean
  placaResposta?: string
  placaAtual?: string
}): boolean {
  if (opts.placaResposta && opts.placaAtual && opts.placaResposta !== opts.placaAtual) {
    return false
  }
  return (
    opts.montado &&
    opts.dialogAberto &&
    opts.seqResposta === opts.seqAtual
  )
}

/** Finally só libera o loading da própria sequência, e só se o componente segue montado. */
export function deveLiberarLoadingConsulta(opts: {
  seqResposta: number
  seqAtual: number
  montado: boolean
}): boolean {
  return opts.montado && opts.seqResposta === opts.seqAtual
}

export function resultadoDeExcecaoConsulta(): ConsultaPlacaResultado {
  return {
    ok: false,
    code: 'PLATE_LOOKUP_UNKNOWN',
    message: mensagemUsuarioConsultaPlaca('PLATE_LOOKUP_UNKNOWN'),
  }
}

/**
 * Consulta por clique. Não preenche formulário e não salva veículo.
 */
export function resultadoConsultaPlacaAplicavel(
  resultado: ConsultaPlacaResultado | null
): resultado is
  | (ConsultaPlacaResultado & {
      ok: true
      code: 'PLATE_LOOKUP_SIMULATED_OK'
      dados: DadosBasicosVeiculoConsulta
    })
  | ConsultaPlacaSucessoReal {
  if (!resultado?.ok || !resultado.dados?.placa) return false
  if (resultado.code === 'PLATE_LOOKUP_SIMULATED_OK') {
    return resultado.dados.fonte === 'simulacao_homolog'
  }
  if (resultado.code === 'PLATE_LOOKUP_OK') {
    return (
      resultado.simulacao === false &&
      resultado.status === 'finalized' &&
      resultado.dados.fonte === 'api_placas' &&
      dadosConsultaPlacaTemConteudoUtil(resultado.dados)
    )
  }
  return false
}

export function BotaoConsultarPlaca({
  placa,
  disabled = false,
  variant = 'outline',
  size = 'sm',
  className,
  onDadosEncontrados,
  camposAtuais,
  origemCampos,
  modoFormulario = 'novo',
  incluirCombustivel = false,
  consultar,
  obterIdentidade,
  storeDeps,
  excluirMotoId,
  clienteIdContexto,
  resolverNomeCliente,
  verificarPlacaOficina,
}: BotaoConsultarPlacaProps) {
  const { session } = useAuth()
  const { oficinaId } = useCraft()
  const { confirmar } = useConfirmacao()
  const placaValida = ehPlacaBrasileiraValida(placa)
  const placaNorm = normalizarPlaca(placa)

  const [aberto, setAberto] = useState(false)
  const [consultando, setConsultando] = useState(false)
  const [resultado, setResultado] = useState<ConsultaPlacaResultado | null>(null)
  const [erroAplicacao, setErroAplicacao] = useState<string | null>(null)
  const [aplicandoDados, setAplicandoDados] = useState(false)
  const [avisoAplicacaoAutomatica, setAvisoAplicacaoAutomatica] = useState<string | null>(
    null
  )
  const [verificacaoLocal, setVerificacaoLocal] =
    useState<ResultadoVerificacaoPlacaOficina | null>(null)
  const [veiculoLocal, setVeiculoLocal] = useState<VeiculoOficinaPorPlaca | null>(null)
  const [faseVerificacaoLocal, setFaseVerificacaoLocal] = useState(false)

  const seqRef = useRef(0)
  const resultadoRef = useRef<ConsultaPlacaResultado | null>(null)
  const consultandoRef = useRef(false)
  const abertoRef = useRef(false)
  const montadoRef = useRef(true)
  const placaNormRef = useRef(placaNorm)

  useEffect(() => {
    montadoRef.current = true
    return () => {
      montadoRef.current = false
    }
  }, [])

  useEffect(() => {
    placaNormRef.current = placaNorm
  }, [placaNorm])

  function fecharDialog() {
    abertoRef.current = false
    setAberto(false)
    setAvisoAplicacaoAutomatica(null)
    setVerificacaoLocal(null)
    setVeiculoLocal(null)
    setFaseVerificacaoLocal(false)
  }

  async function executarVerificacaoLocalPlaca(
    _seq: number,
    placaDaTentativa: string
  ): Promise<ResultadoVerificacaoPlacaOficina> {
    const verificar = verificarPlacaOficina ?? verificarPlacaCadastradaNaOficina
    return verificar({
      officeId: oficinaId,
      placa: placaDaTentativa,
      excluirMotoId,
      resolverNomeCliente,
    })
  }

  function aplicarEstadoVerificacaoLocal(
    verificacao: ResultadoVerificacaoPlacaOficina
  ): void {
    setVerificacaoLocal(verificacao)
    setVeiculoLocal(verificacao.status === 'encontrado' ? verificacao.veiculo : null)
  }

  const autoAplicacaoCadastroNovo =
    modoFormulario === 'novo' && Boolean(onDadosEncontrados)

  function identidadeAtual(): IdentidadeConsultaPlaca | null {
    if (obterIdentidade) return obterIdentidade()
    return identidadeConsultaDaSessao(session, supabaseUrl)
  }

  async function executarConsultaExternaFornecedor(
    seq: number,
    placaDaTentativa: string,
    identidade: IdentidadeConsultaPlaca
  ): Promise<void> {
    let resposta: ConsultaPlacaResultado
    let chaveUsada: string | null = null

    try {
      const preparada = prepararTentativaConsultaPersistida(
        identidade,
        placaDaTentativa,
        storeDeps
      )
      setVerificacaoLocal(null)
      setVeiculoLocal(null)
      resultadoRef.current = null
      setResultado(null)
      setAvisoAplicacaoAutomatica(null)

      if (!preparada.ok) {
        resposta = {
          ok: false,
          code: preparada.code,
          message: mensagemUsuarioConsultaPlaca(preparada.code),
        }
      } else {
        chaveUsada = preparada.chave
        const executar = consultar ?? consultarPlacaVeiculo
        resposta = await executar(placaDaTentativa, preparada.chave)
      }
    } catch {
      resposta = resultadoDeExcecaoConsulta()
    } finally {
      if (
        deveLiberarLoadingConsulta({
          seqResposta: seq,
          seqAtual: seqRef.current,
          montado: montadoRef.current,
        })
      ) {
        consultandoRef.current = false
        setConsultando(false)
        setFaseVerificacaoLocal(false)
      }
    }

    if (chaveUsada) {
      persistirResultadoTentativaConsulta({
        identidade,
        placa: placaDaTentativa,
        chave: chaveUsada,
        resultado: resposta,
        seqResposta: seq,
        seqAtual: seqRef.current,
        deps: storeDeps,
      })
    }

    if (
      !deveAplicarResultadoConsulta({
        seqResposta: seq,
        seqAtual: seqRef.current,
        montado: montadoRef.current,
        dialogAberto: abertoRef.current,
        placaResposta: placaDaTentativa,
        placaAtual: placaNormRef.current,
      })
    ) {
      return
    }

    resultadoRef.current = resposta
    setResultado(resposta)
    setErroAplicacao(null)

    if (
      autoAplicacaoCadastroNovo &&
      resultadoConsultaPlacaAplicavel(resposta) &&
      normalizarPlaca(resposta.dados.placa) === placaDaTentativa
    ) {
      await aplicarDadosConsultaAoFormulario({
        dados: resposta.dados,
        seqAplicacao: seq,
        placaAtual: placaDaTentativa,
        fecharAoConcluir: false,
      })
    }
  }

  async function iniciarConsulta(opcoes?: { somenteFornecedor?: boolean }) {
    if (disabled || consultandoRef.current || !placaValida) return

    const identidade = identidadeAtual()
    if (!identidade) {
      const code = obterIdentidade
        ? 'PLATE_LOOKUP_UNAUTHENTICATED'
        : (motivoIdentidadeConsultaInvalida(session, supabaseUrl) ??
          'PLATE_LOOKUP_UNAUTHENTICATED')
      abertoRef.current = true
      setAberto(true)
      setConsultando(false)
      const falha = {
        ok: false as const,
        code,
        message: mensagemUsuarioConsultaPlaca(code),
      }
      resultadoRef.current = falha
      setResultado(falha)
      return
    }

    consultandoRef.current = true
    seqRef.current += 1
    const seq = seqRef.current
    const placaDaTentativa = placaNorm

    abertoRef.current = true
    setAberto(true)
    setConsultando(true)
    setErroAplicacao(null)
    setAvisoAplicacaoAutomatica(null)

    if (!opcoes?.somenteFornecedor) {
      setFaseVerificacaoLocal(true)
      setVerificacaoLocal(null)
      setVeiculoLocal(null)
      resultadoRef.current = null
      setResultado(null)

      const verificacao = await executarVerificacaoLocalPlaca(seq, placaDaTentativa)

      if (
        !deveAplicarResultadoConsulta({
          seqResposta: seq,
          seqAtual: seqRef.current,
          montado: montadoRef.current,
          dialogAberto: abertoRef.current,
          placaResposta: placaDaTentativa,
          placaAtual: placaNormRef.current,
        })
      ) {
        consultandoRef.current = false
        setConsultando(false)
        setFaseVerificacaoLocal(false)
        return
      }

      if (identidade.officeId !== identidadeAtual()?.officeId) {
        consultandoRef.current = false
        setConsultando(false)
        setFaseVerificacaoLocal(false)
        return
      }

      aplicarEstadoVerificacaoLocal(verificacao)

      if (verificacao.status === 'encontrado') {
        consultandoRef.current = false
        setConsultando(false)
        setFaseVerificacaoLocal(false)
        return
      }

      if (verificacao.status === 'erro') {
        consultandoRef.current = false
        setConsultando(false)
        setFaseVerificacaoLocal(false)
        return
      }
    }

    setFaseVerificacaoLocal(false)
    await executarConsultaExternaFornecedor(seq, placaDaTentativa, identidade)
  }

  async function repetirVerificacaoLocal() {
    if (consultandoRef.current || !placaValida) return
    consultandoRef.current = true
    seqRef.current += 1
    const seq = seqRef.current
    const placaDaTentativa = placaNorm
    abertoRef.current = true
    setAberto(true)
    setConsultando(true)
    setFaseVerificacaoLocal(true)
    setResultado(null)
    resultadoRef.current = null

    const verificacao = await executarVerificacaoLocalPlaca(seq, placaDaTentativa)
    aplicarEstadoVerificacaoLocal(verificacao)
    consultandoRef.current = false
    setConsultando(false)
    setFaseVerificacaoLocal(false)
  }

  async function consultarFornecedorExplicito() {
    if (consultandoRef.current || !placaValida) return
    const identidade = identidadeAtual()
    if (!identidade) return

    consultandoRef.current = true
    seqRef.current += 1
    const seq = seqRef.current
    const placaDaTentativa = placaNorm
    setConsultando(true)
    setFaseVerificacaoLocal(true)

    const verificacao = await executarVerificacaoLocalPlaca(seq, placaDaTentativa)

    if (
      !deveAplicarResultadoConsulta({
        seqResposta: seq,
        seqAtual: seqRef.current,
        montado: montadoRef.current,
        dialogAberto: abertoRef.current,
        placaResposta: placaDaTentativa,
        placaAtual: placaNormRef.current,
      })
    ) {
      consultandoRef.current = false
      setConsultando(false)
      setFaseVerificacaoLocal(false)
      return
    }

    aplicarEstadoVerificacaoLocal(verificacao)

    if (verificacao.status === 'encontrado') {
      consultandoRef.current = false
      setConsultando(false)
      setFaseVerificacaoLocal(false)
      return
    }

    if (verificacao.status === 'erro') {
      consultandoRef.current = false
      setConsultando(false)
      setFaseVerificacaoLocal(false)
      return
    }

    await executarConsultaExternaFornecedor(seq, placaDaTentativa, identidade)
  }

  async function aplicarDadosConsultaAoFormulario(opts: {
    dados: DadosBasicosVeiculoConsulta
    seqAplicacao: number
    placaAtual: string
    fecharAoConcluir: boolean
  }): Promise<boolean> {
    if (!onDadosEncontrados) return false

    setErroAplicacao(null)
    setAplicandoDados(true)
    const placaConsulta = normalizarPlaca(opts.dados.placa)
    const snapshotInicial = snapshotCamposConsultaPlaca(camposAtuais ?? {})

    try {
      if (!montadoRef.current) return false
      if (placaConsulta !== opts.placaAtual || placaNormRef.current !== opts.placaAtual) {
        setErroAplicacao(
          'A placa do formulário mudou desde a consulta. Consulte novamente antes de aplicar.'
        )
        return false
      }

      const resultadoAtual = resultadoRef.current
      if (
        !resultadoConsultaPlacaAplicavel(resultadoAtual) ||
        normalizarPlaca(resultadoAtual.dados.placa) !== opts.placaAtual
      ) {
        setErroAplicacao('O resultado da consulta não é mais válido. Consulte novamente.')
        return false
      }

      const conflitos = detectarConflitosConsultaPlaca({
        camposAtuais: camposAtuais ?? {},
        dados: opts.dados,
        modoFormulario,
        incluirCombustivel,
        origemCampos,
      })

      let sobrescreverConfirmado = false
      if (conflitos.length > 0) {
        const ok = await confirmar({
          titulo: 'Substituir dados do veículo?',
          mensagem: formatarMensagemConfirmacaoConsultaPlaca(
            conflitos,
            ehConsultaSimulada(resultadoAtual)
          ),
          confirmarTexto: 'Substituir',
          cancelarTexto: 'Cancelar',
        })
        if (!ok) return false
        sobrescreverConfirmado = true
      }

      if (!montadoRef.current) return false
      if (seqRef.current !== opts.seqAplicacao) {
        setErroAplicacao('Há uma consulta mais recente. Confira o resultado antes de aplicar.')
        return false
      }
      if (placaNormRef.current !== opts.placaAtual) {
        setErroAplicacao(
          'A placa do formulário mudou durante a confirmação. Consulte novamente.'
        )
        return false
      }
      const atual = resultadoRef.current
      if (
        !resultadoConsultaPlacaAplicavel(atual) ||
        normalizarPlaca(atual.dados.placa) !== opts.placaAtual
      ) {
        setErroAplicacao('O resultado da consulta não é mais válido. Consulte novamente.')
        return false
      }
      if (snapshotCamposConsultaPlaca(camposAtuais ?? {}) !== snapshotInicial) {
        setErroAplicacao(
          'O formulário foi alterado durante a confirmação. Revise os campos e tente novamente.'
        )
        return false
      }

      onDadosEncontrados(atual.dados, { sobrescreverConfirmado })
      if (autoAplicacaoCadastroNovo) {
        setAvisoAplicacaoAutomatica(MSG_DADOS_PREENCHIDOS_FORMULARIO)
      }
      if (opts.fecharAoConcluir) {
        fecharDialog()
      }
      return true
    } finally {
      if (montadoRef.current) setAplicandoDados(false)
    }
  }

  async function usarEstesDados() {
    if (!resultadoConsultaPlacaAplicavel(resultado)) return
    await aplicarDadosConsultaAoFormulario({
      dados: resultado.dados,
      seqAplicacao: seqRef.current,
      placaAtual: placaNormRef.current,
      fecharAoConcluir: true,
    })
  }

  const preview =
    resultado?.ok === true ? camposPreviewConsulta(resultado.dados) : []
  const simulada = resultado ? ehConsultaSimulada(resultado) : false
  const consultaReal = resultado ? ehConsultaReal(resultado) : false
  const podeUsarDados =
    !autoAplicacaoCadastroNovo &&
    Boolean(onDadosEncontrados) &&
    resultadoConsultaPlacaAplicavel(resultado)
  const mensagemErro =
    resultado && !resultado.ok
      ? mensagemUsuarioConsultaPlaca(resultado.code, resultado.message)
      : null

  const outroCliente =
    veiculoLocal &&
    clienteIdContexto &&
    veiculoLocal.clienteId !== clienteIdContexto

  const podeComplementarFornecedor =
    Boolean(veiculoLocal) && !veiculoLocal!.dadosCompletos && Boolean(onDadosEncontrados)

  const textoCarregando = faseVerificacaoLocal
    ? 'Verificando cadastro da oficina…'
    : 'Consultando os dados básicos do veículo. Aguarde.'

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled || !placaValida || consultando}
        title={
          placaValida
            ? 'Consultar dados básicos do veículo pela placa'
            : MSG_PLACA_INVALIDA_CONSULTA
        }
        className={className ?? 'shrink-0 whitespace-nowrap'}
        onClick={() => {
          void iniciarConsulta()
        }}
      >
        {consultando ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Search className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        )}
        {consultando ? 'Consultando…' : 'Consultar placa'}
      </Button>

      <Dialog
        open={aberto}
        onOpenChange={(next) => {
          if (!next) fecharDialog()
        }}
      >
        <DialogContent prioridadeAlta className="max-w-md">
          <DialogHeader>
            <DialogTitle>Consultar placa</DialogTitle>
            <DialogDescription>
              {consultando
                ? textoCarregando
                : veiculoLocal
                  ? 'Cadastro existente na oficina. Nenhuma consulta externa foi realizada.'
                  : autoAplicacaoCadastroNovo
                    ? 'Resultado da consulta. No cadastro novo, os campos compatíveis são preenchidos automaticamente quando não há conflito.'
                    : 'Resultado da consulta. Nenhum campo do cadastro foi alterado.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            {placaNorm ? (
              <p className="text-muted-foreground">
                Placa informada:{' '}
                <span className="font-medium text-foreground">{placaNorm}</span>
              </p>
            ) : null}

            {consultando ? (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {faseVerificacaoLocal ? 'Verificando…' : 'Consultando…'}
              </p>
            ) : null}

            {!consultando && veiculoLocal ? (
              <>
                <p
                  role="status"
                  className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-100"
                >
                  {AVISO_VEICULO_JA_CADASTRADO}
                </p>
                <dl className="grid gap-1.5">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Placa</dt>
                    <dd className="font-medium text-foreground">{veiculoLocal.placa}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Marca</dt>
                    <dd className="font-medium text-foreground">{veiculoLocal.marca}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Modelo</dt>
                    <dd className="font-medium text-foreground">{veiculoLocal.modelo}</dd>
                  </div>
                  {veiculoLocal.ano ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Ano</dt>
                      <dd className="font-medium text-foreground">{veiculoLocal.ano}</dd>
                    </div>
                  ) : null}
                  {veiculoLocal.cor ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Cor</dt>
                      <dd className="font-medium text-foreground">{veiculoLocal.cor}</dd>
                    </div>
                  ) : null}
                  {veiculoLocal.clienteNome ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Cliente</dt>
                      <dd className="font-medium text-foreground">{veiculoLocal.clienteNome}</dd>
                    </div>
                  ) : null}
                </dl>
                {outroCliente ? (
                  <p className="text-xs text-amber-200/90">
                    Esta placa está vinculada a outro cliente. O vínculo não será alterado
                    automaticamente.
                  </p>
                ) : null}
                {!veiculoLocal.dadosCompletos ? (
                  <p className="text-xs text-muted-foreground">
                    Alguns dados do cadastro local estão incompletos. Você pode consultar o
                    fornecedor para complementar o formulário — sem alterar o veículo já salvo.
                  </p>
                ) : null}
              </>
            ) : null}

            {!consultando && verificacaoLocal?.status === 'erro' ? (
              <p role="alert" className="text-destructive">
                {verificacaoLocal.mensagem}
              </p>
            ) : null}

            {!consultando && simulada ? (
              <p
                role="status"
                className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-100"
              >
                {AVISO_DADOS_SIMULADOS}
              </p>
            ) : null}

            {!consultando && consultaReal ? (
              <p
                role="status"
                className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs font-medium text-foreground"
              >
                {AVISO_DADOS_REAIS}
              </p>
            ) : null}

            {!consultando && !veiculoLocal && resultado?.ok === true ? (
              <dl className="grid gap-1.5">
                {preview.map((linha) => (
                  <div key={linha.rotulo} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{linha.rotulo}</dt>
                    <dd className="font-medium text-foreground">{linha.valor}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {!consultando && mensagemErro ? (
              <p role="alert" className="text-destructive">
                {mensagemErro}
              </p>
            ) : null}

            {erroAplicacao ? (
              <p role="alert" className="text-destructive">
                {erroAplicacao}
              </p>
            ) : null}

            {avisoAplicacaoAutomatica ? (
              <p
                role="status"
                className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100"
              >
                {avisoAplicacaoAutomatica}
              </p>
            ) : null}

            {!veiculoLocal ? (
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {autoAplicacaoCadastroNovo
                  ? 'A consulta preenche o formulário, mas não salva o veículo. Proprietário, multas, débitos e restrições não são consultados.'
                  : 'A consulta não altera o cadastro. Dados de proprietário, multas, débitos ou restrições não são consultados.'}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={fecharDialog} disabled={aplicandoDados}>
              Fechar
            </Button>
            {verificacaoLocal?.status === 'erro' ? (
              <Button
                type="button"
                variant="secondary"
                disabled={consultando}
                onClick={() => {
                  void repetirVerificacaoLocal()
                }}
              >
                Tentar verificação novamente
              </Button>
            ) : null}
            {veiculoLocal?.clienteId ? (
              <Button type="button" variant="secondary" asChild>
                <Link to={`/clientes/${veiculoLocal.clienteId}`}>Ver cadastro do cliente</Link>
              </Button>
            ) : null}
            {podeComplementarFornecedor ? (
              <Button
                type="button"
                disabled={consultando || aplicandoDados}
                onClick={() => {
                  void consultarFornecedorExplicito()
                }}
              >
                Consultar fornecedor para complementar
              </Button>
            ) : null}
            {podeComplementarFornecedor ? (
              <p className="w-full text-right text-[11px] text-muted-foreground">
                {AVISO_COMPLEMENTO_FRANQUIA}
              </p>
            ) : null}
            {podeUsarDados ? (
              <Button
                type="button"
                disabled={consultando || aplicandoDados}
                onClick={() => {
                  void usarEstesDados()
                }}
              >
                {aplicandoDados ? 'Aplicando…' : 'Usar estes dados'}
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function assertTesteBotao(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

/** Runner local (mock) — invocar via `npx tsx` nos testes da etapa 5E.3. */
export function executarTestesLocaisBotaoConsultarPlaca(): void {
  const placa = 'ABC1D23'
  const dadosReal = {
    placa,
    marca: 'FIAT',
    modelo: 'UNO',
    fonte: 'api_placas' as const,
  }

  assertTesteBotao(
    resultadoConsultaPlacaAplicavel({
      ok: true,
      code: 'PLATE_LOOKUP_OK',
      simulacao: false,
      status: 'finalized',
      fonte: 'api_placas',
      idempotency_key: 'k1',
      dados: dadosReal,
    }),
    'PLATE_LOOKUP_OK aplicável'
  )

  assertTesteBotao(
    !resultadoConsultaPlacaAplicavel({
      ok: true,
      code: 'PLATE_LOOKUP_OK',
      simulacao: false,
      status: 'reserved',
      fonte: 'api_placas',
      idempotency_key: 'k1',
      dados: dadosReal,
    } as unknown as ConsultaPlacaResultado),
    'status reserved bloqueado'
  )

  assertTesteBotao(
    !resultadoConsultaPlacaAplicavel({
      ok: true,
      code: 'PLATE_LOOKUP_OK',
      simulacao: false,
      status: 'finalized',
      fonte: 'api_placas',
      idempotency_key: 'k1',
      dados: { placa, fonte: 'api_placas' },
    }),
    'sem conteúdo útil bloqueado'
  )

  assertTesteBotao(
    !resultadoConsultaPlacaAplicavel({
      ok: true,
      code: 'PLATE_LOOKUP_OK',
      simulacao: false,
      status: 'finalized',
      fonte: 'api_placas',
      idempotency_key: 'k1',
      dados: { placa, marca: 'X', fonte: 'simulacao_homolog' },
    }),
    'fonte simulacao bloqueada'
  )

  assertTesteBotao(
    resultadoConsultaPlacaAplicavel({
      ok: true,
      code: 'PLATE_LOOKUP_SIMULATED_OK',
      simulacao: true,
      idempotency_key: 'k2',
      dados: {
        placa: 'ZZZ9Z99',
        marca: 'SIM',
        fonte: 'simulacao_homolog',
      },
    }),
    'simulado ainda aplicável'
  )

  assertTesteBotao(
    !resultadoConsultaPlacaAplicavel({
      ok: false,
      code: 'PLATE_LOOKUP_FINALIZE_PENDING',
      message: 'x',
    }),
    'finalize pending não aplicável'
  )

  assertTesteBotao(
    !resultadoConsultaPlacaAplicavel({
      ok: false,
      code: 'PLATE_LOOKUP_SIMULATED_NOT_FOUND',
      message: 'x',
    }),
    'not found não aplicável'
  )

  assertTesteBotao(
    resultadoTerminalConsultaConfirmado({
      ok: true,
      code: 'PLATE_LOOKUP_OK',
      simulacao: false,
      status: 'finalized',
      fonte: 'api_placas',
      idempotency_key: 'k1',
      dados: dadosReal,
    }),
    'terminal real encerra tentativa'
  )

  assertTesteBotao(ehConsultaReal({
    ok: true,
    code: 'PLATE_LOOKUP_OK',
    simulacao: false,
    status: 'finalized',
    fonte: 'api_placas',
    idempotency_key: 'k1',
    dados: dadosReal,
  }), 'ehConsultaReal')

  assertTesteBotao(!ehConsultaSimulada({
    ok: true,
    code: 'PLATE_LOOKUP_OK',
    simulacao: false,
    status: 'finalized',
    fonte: 'api_placas',
    idempotency_key: 'k1',
    dados: dadosReal,
  }), 'real não é simulada')

  assertTesteBotao(MSG_DADOS_PREENCHIDOS_FORMULARIO.includes('Confira'), 'msg auto aplicacao')
}
