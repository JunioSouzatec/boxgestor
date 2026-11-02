/* Helpers de consulta exportados neste arquivo — extração em etapa futura. */
/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState, type ComponentProps } from 'react'
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
import { supabaseUrl } from '@/lib/supabase-env'
import {
  consultarPlacaVeiculo,
  type CamposVeiculoParaConsulta,
  type ConsultaPlacaResultado,
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

export const AVISO_DADOS_SIMULADOS =
  'DADOS SIMULADOS — ambiente de testes. Não representam consulta real.'

export interface BotaoConsultarPlacaProps {
  placa: string
  disabled?: boolean
  /** Reservado para etapa futura — não chamado nesta fase. */
  onDadosEncontrados?: (dados: DadosBasicosVeiculoConsulta) => void
  /** Reservado para etapa futura — aviso de sobrescrita. */
  camposAtuais?: CamposVeiculoParaConsulta
  variant?: ComponentProps<typeof Button>['variant']
  size?: ComponentProps<typeof Button>['size']
  className?: string
  /** Só para testes locais. Formulários não passam. */
  consultar?: (placa: string, idempotencyKey: string) => Promise<ConsultaPlacaResultado>
  /** Só para testes locais. Produção usa AuthContext + VITE_SUPABASE_URL. */
  obterIdentidade?: () => IdentidadeConsultaPlaca | null
  /** Só para testes locais. */
  storeDeps?: PlateLookupIdempotencyDeps
}

export function mensagemUsuarioConsultaPlaca(code: string, fallback?: string): string {
  switch (code) {
    case 'PLATE_LOOKUP_SIMULATED_NOT_FOUND':
      return 'Nenhum veículo encontrado para esta placa.'
    case 'PLATE_LOOKUP_SIMULATED_TIMEOUT':
      return 'Tempo de resposta excedido na consulta simulada.'
    case 'PLATE_LOOKUP_SIMULATED_ERROR':
      return 'Falha simulada na consulta do fornecedor.'
    case 'PLATE_LOOKUP_FINALIZE_PENDING':
      return 'Não foi possível confirmar a finalização da consulta. Não inicie outra tentativa.'
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
    return resultado.simulacao === true || resultado.dados.fonte === 'simulacao_homolog'
  }
  return resultado.simulacao === true
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
    return (
      resultado.code === 'PLATE_LOOKUP_SIMULATED_OK' &&
      Boolean(resultado.dados?.placa) &&
      resultado.dados.fonte === 'simulacao_homolog'
    )
  }
  return (
    resultado.code === 'PLATE_LOOKUP_SIMULATED_NOT_FOUND' ||
    resultado.code === 'PLATE_LOOKUP_SIMULATED_TIMEOUT' ||
    resultado.code === 'PLATE_LOOKUP_SIMULATED_ERROR'
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
export function BotaoConsultarPlaca({
  placa,
  disabled = false,
  variant = 'outline',
  size = 'sm',
  className,
  consultar,
  obterIdentidade,
  storeDeps,
}: BotaoConsultarPlacaProps) {
  const { session } = useAuth()
  const placaValida = ehPlacaBrasileiraValida(placa)
  const placaNorm = normalizarPlaca(placa)

  const [aberto, setAberto] = useState(false)
  const [consultando, setConsultando] = useState(false)
  const [resultado, setResultado] = useState<ConsultaPlacaResultado | null>(null)

  const seqRef = useRef(0)
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
  }

  function identidadeAtual(): IdentidadeConsultaPlaca | null {
    if (obterIdentidade) return obterIdentidade()
    return identidadeConsultaDaSessao(session, supabaseUrl)
  }

  async function iniciarConsulta() {
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
      setResultado({
        ok: false,
        code,
        message: mensagemUsuarioConsultaPlaca(code),
      })
      return
    }

    consultandoRef.current = true
    seqRef.current += 1
    const seq = seqRef.current
    const placaDaTentativa = placaNorm
    let resposta: ConsultaPlacaResultado
    let chaveUsada: string | null = null

    try {
      const preparada = prepararTentativaConsultaPersistida(
        identidade,
        placaDaTentativa,
        storeDeps
      )
      abertoRef.current = true
      setAberto(true)
      setConsultando(true)
      setResultado(null)

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

    setResultado(resposta)
  }

  const preview =
    resultado?.ok === true ? camposPreviewConsulta(resultado.dados) : []
  const simulada = resultado ? ehConsultaSimulada(resultado) : false
  const mensagemErro =
    resultado && !resultado.ok
      ? mensagemUsuarioConsultaPlaca(resultado.code, resultado.message)
      : null

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
                ? 'Consultando os dados básicos do veículo. Aguarde.'
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
                Consultando…
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

            {!consultando && resultado?.ok === true ? (
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

            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              A consulta não altera o cadastro. Dados de proprietário, multas, débitos ou
              restrições não são consultados.
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={fecharDialog}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
