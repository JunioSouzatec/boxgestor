import { useAuth } from '@/context/AuthContext'
import { AuthFallbackScreen } from '@/components/auth/AuthFallbackScreen'
import { obterOfficeIdDaSessao, sessaoLocalValida } from '@/lib/session-safe'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Outlet } from 'react-router-dom'
import { ComunicacaoProvider } from '@/context/ComunicacaoContext'
import { LembretesProvider } from '@/context/LembretesContext'
import { BancoStatusProvider } from '@/context/BancoStatusContext'
import { AssinaturaProvider } from '@/context/AssinaturaContext'
import { OficinaTemaProvider } from '@/components/oficina/OficinaTemaProvider'
import { CraftDataService } from '@/services/craft-data.service'
import { getCraftPersistenceMode } from '@/lib/supabase'
import { sincronizarProximoNumeroOsNoDatabase } from '@/services/os-numbering.service'
import { emitirDiagnosticoPendenciasAtualizado } from '@/services/persistence-status.events'
import { carregarComSupabase } from '@/services/repository/hybrid.repository'
import {
  createCraftRepository,
  isModoSupabaseExperimentalAtivo,
} from '@/services/repository/repository.factory'
import { filtrarPorOffice } from '@/services/analytics.service'
import { extrairOficinaAtual, type OficinaAtual } from '@/lib/oficina-atual'
import {
  configuracaoPertenceOffice,
  criarDatabasePlaceholderOficina,
  databasePertenceOffice,
} from '@/lib/office-isolation'
import {
  limparDadosTesteOficina,
  type OpcaoLimpezaTeste,
  type ResultadoLimpezaTeste,
} from '@/services/backup/office-reset.service'
import type {
  Agendamento,
  AgendamentoInput,
  Cliente,
  ClienteInput,
  ConfiguracaoOficina,
  CraftDatabase,
  LancamentoFinanceiro,
  LancamentoFinanceiroInput,
  ModeloChecklist,
  ModeloChecklistInput,
  Moto,
  MotoInput,
  OrdemServico,
  OrdemServicoInput,
  Peca,
  PecaInput,
  ServicoCatalogo,
  ServicoCatalogoInput,
  Fornecedor,
  FornecedorInput,
} from '@/types'
import type {
  PerfilComissaoFuncionario,
  PerfilComissaoFuncionarioInput,
  ComissoesConfigOficina,
} from '@/types/comissoes'
import type { AjusteEstoqueInput, EntradaEstoqueInput } from '@/types/movimentacao-estoque'
import {
  agendarSincronizacaoComissoes,
  COMISSOES_EVENTO_ATUALIZADO,
  inicializarComissoesSupabase,
} from '@/services/comissoes/comissoes-sync.service'

interface CraftContextValue {
  dados: CraftDatabase
  oficinaId: string
  carregandoRemoto: boolean
  dadosProntos: boolean
  erroCarregamento: string | null
  adicionarCliente: (cliente: ClienteInput) => Cliente
  adicionarClienteComMotoOpcional: (
    cliente: ClienteInput,
    moto: MotoInput | null
  ) => { cliente: Cliente; moto?: Moto }
  atualizarCliente: (id: string, cliente: Partial<Cliente>) => void
  excluirCliente: (id: string) => void
  adicionarMoto: (moto: MotoInput) => Moto
  atualizarMoto: (id: string, moto: Partial<Moto>) => void
  excluirMoto: (id: string) => void
  adicionarOS: (os: OrdemServicoInput, opcoes?: { numero?: number }) => OrdemServico
  atualizarOS: (id: string, os: Partial<OrdemServico>) => void
  excluirOS: (id: string) => void
  adicionarPeca: (peca: PecaInput) => Peca
  atualizarPeca: (id: string, peca: Partial<Peca>) => void
  excluirPeca: (id: string) => void
  adicionarLancamento: (lancamento: LancamentoFinanceiroInput) => LancamentoFinanceiro
  atualizarLancamento: (id: string, lancamento: Partial<LancamentoFinanceiro>) => void
  excluirLancamento: (id: string) => void
  adicionarAgendamento: (agendamento: AgendamentoInput) => Agendamento
  atualizarAgendamento: (id: string, agendamento: Partial<Agendamento>) => void
  excluirAgendamento: (id: string) => void
  atualizarConfiguracao: (config: Partial<ConfiguracaoOficina>) => void
  salvarPerfilComissao: (
    input: PerfilComissaoFuncionarioInput & { id?: string }
  ) => PerfilComissaoFuncionario
  excluirPerfilComissao: (id: string) => void
  atualizarComissoesConfig: (patch: Partial<ComissoesConfigOficina>) => void
  atualizarPermissoesEquipe: (
    permissions: import('@/types/permissoes-equipe').PermissoesEquipeConfig
  ) => void
  adicionarModeloChecklist: (modelo: ModeloChecklistInput) => ModeloChecklist
  atualizarModeloChecklist: (id: string, modelo: Partial<ModeloChecklist>) => void
  excluirModeloChecklist: (id: string) => void
  definirModeloPadraoChecklist: (id: string) => void
  adicionarServicoCatalogo: (servico: ServicoCatalogoInput) => ServicoCatalogo
  atualizarServicoCatalogo: (id: string, servico: Partial<ServicoCatalogo>) => void
  excluirServicoCatalogo: (id: string) => void
  adicionarFornecedor: (fornecedor: FornecedorInput) => Fornecedor
  atualizarFornecedor: (id: string, fornecedor: Partial<Fornecedor>) => void
  excluirFornecedor: (id: string) => void
  registrarEntradaEstoque: (input: EntradaEstoqueInput) => void
  registrarAjusteEstoque: (input: AjusteEstoqueInput) => void
  resetarDados: () => void
  aplicarDatabase: (db: CraftDatabase) => void
  /** Limpa dados operacionais de teste (preserva login, oficina e configurações). */
  limparDadosTeste: (opcao: OpcaoLimpezaTeste) => Promise<ResultadoLimpezaTeste>
  /** Recarrega fase 1 (clientes, motos, OS) do Supabase para a lista */
  recarregarDadosSupabase: () => Promise<CraftDatabase>
}

const CraftContext = createContext<CraftContextValue | null>(null)

interface CraftProviderProps {
  children: ReactNode
  officeId: string
}

export function CraftProvider({ children, officeId }: CraftProviderProps) {
  const { session } = useAuth()
  const service = useMemo(
    () => new CraftDataService(createCraftRepository(), officeId),
    [officeId]
  )

  const carregarLocalSeguro = useCallback((): CraftDatabase => {
    const local = service.carregar()
    return databasePertenceOffice(local, officeId)
      ? local
      : criarDatabasePlaceholderOficina(officeId)
  }, [officeId, service])

  const [dados, setDados] = useState<CraftDatabase>(() => carregarLocalSeguro())
  const [carregandoRemoto, setCarregandoRemoto] = useState(
    () => isModoSupabaseExperimentalAtivo()
  )
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null)

  const dadosProntos = useMemo(() => {
    if (!configuracaoPertenceOffice(dados.configuracao, officeId)) return false
    if (erroCarregamento) return false
    if (isModoSupabaseExperimentalAtivo() && carregandoRemoto) return false
    return true
  }, [dados.configuracao, officeId, erroCarregamento, carregandoRemoto])

  useEffect(() => {
    service.setUsuario(
      session?.user
        ? { id: session.user.id, nome: session.user.nome }
        : {}
    )
  }, [service, session?.user])

  useEffect(() => {
    setErroCarregamento(null)
    const local = service.carregar()
    if (databasePertenceOffice(local, officeId)) {
      setDados(local)
    } else {
      setDados(criarDatabasePlaceholderOficina(officeId))
    }
    setCarregandoRemoto(isModoSupabaseExperimentalAtivo())
  }, [officeId, service])

  useEffect(() => {
    if (getCraftPersistenceMode() !== 'supabase' || !isModoSupabaseExperimentalAtivo()) {
      setCarregandoRemoto(false)
      return
    }

    let cancelado = false
    setCarregandoRemoto(true)
    setErroCarregamento(null)

    void carregarComSupabase(officeId)
      .then((db) => {
        if (cancelado) return
        if (!databasePertenceOffice(db, officeId)) {
          throw new Error('Dados recebidos não correspondem à oficina ativa.')
        }
        const dbNormalizado = sincronizarProximoNumeroOsNoDatabase(db)
        if (dbNormalizado.proximo_numero_os !== db.proximo_numero_os) {
          service.salvar(dbNormalizado)
        }
        setDados(dbNormalizado)
        emitirDiagnosticoPendenciasAtualizado(officeId)
      })
      .catch((err) => {
        if (cancelado) return
        console.error('[Craft] Falha ao carregar dados da oficina', { officeId, err })
        setErroCarregamento('Não foi possível carregar os dados. Tente novamente.')
        setDados(criarDatabasePlaceholderOficina(officeId))
      })
      .finally(() => {
        if (!cancelado) setCarregandoRemoto(false)
      })

    return () => {
      cancelado = true
    }
  }, [officeId])

  useEffect(() => {
    if (getCraftPersistenceMode() !== 'supabase') return
    void inicializarComissoesSupabase(officeId)
  }, [officeId])

  useEffect(() => {
    const handler = () => {
      const db = service.carregar()
      if (databasePertenceOffice(db, officeId)) {
        setDados(db)
      }
    }
    window.addEventListener(COMISSOES_EVENTO_ATUALIZADO, handler)
    return () => window.removeEventListener(COMISSOES_EVENTO_ATUALIZADO, handler)
  }, [officeId, service])

  const commit = useCallback(
    (updater: (prev: CraftDatabase) => CraftDatabase) => {
      setDados((prev) => {
        const next = updater(prev)
        service.salvar(next)
        return next
      })
    },
    [service]
  )

  const adicionarCliente = useCallback(
    (cliente: ClienteInput) => {
      let entity!: Cliente
      commit((prev) => {
        const result = service.adicionarCliente(prev, cliente)
        entity = result.entity
        return result.db
      })
      return entity
    },
    [commit, service]
  )

  const adicionarClienteComMotoOpcional = useCallback(
    (cliente: ClienteInput, moto: MotoInput | null) => {
      let clienteCriado!: Cliente
      let motoCriada: Moto | undefined
      commit((prev) => {
        const result = service.adicionarClienteComMotoOpcional(prev, cliente, moto)
        clienteCriado = result.cliente
        motoCriada = result.moto
        return result.db
      })
      return { cliente: clienteCriado, moto: motoCriada }
    },
    [commit, service]
  )

  const atualizarCliente = useCallback(
    (id: string, cliente: Partial<Cliente>) => {
      commit((prev) => service.atualizarCliente(prev, id, cliente))
    },
    [commit, service]
  )

  const excluirCliente = useCallback(
    (id: string) => {
      commit((prev) => service.excluirCliente(prev, id))
    },
    [commit, service]
  )

  const adicionarMoto = useCallback(
    (moto: MotoInput) => {
      let entity!: Moto
      commit((prev) => {
        const result = service.adicionarMoto(prev, moto)
        entity = result.entity
        return result.db
      })
      return entity
    },
    [commit, service]
  )

  const atualizarMoto = useCallback(
    (id: string, moto: Partial<Moto>) => {
      commit((prev) => service.atualizarMoto(prev, id, moto))
    },
    [commit, service]
  )

  const excluirMoto = useCallback(
    (id: string) => {
      commit((prev) => service.excluirMoto(prev, id))
    },
    [commit, service]
  )

  const adicionarOS = useCallback(
    (os: OrdemServicoInput, opcoes?: { numero?: number }) => {
      let entity!: OrdemServico
      commit((prev) => {
        const result = service.adicionarOS(prev, os, opcoes)
        entity = result.entity
        return result.db
      })
      return entity
    },
    [commit, service]
  )

  const atualizarOS = useCallback(
    (id: string, os: Partial<OrdemServico>) => {
      commit((prev) => service.atualizarOS(prev, id, os))
    },
    [commit, service]
  )

  const excluirOS = useCallback(
    (id: string) => {
      commit((prev) => service.excluirOS(prev, id))
    },
    [commit, service]
  )

  const adicionarPeca = useCallback(
    (peca: PecaInput) => {
      let entity!: Peca
      commit((prev) => {
        const result = service.adicionarPeca(prev, peca)
        entity = result.entity
        return result.db
      })
      return entity
    },
    [commit, service]
  )

  const atualizarPeca = useCallback(
    (id: string, peca: Partial<Peca>) => {
      commit((prev) => service.atualizarPeca(prev, id, peca))
    },
    [commit, service]
  )

  const excluirPeca = useCallback(
    (id: string) => {
      commit((prev) => service.excluirPeca(prev, id))
    },
    [commit, service]
  )

  const adicionarLancamento = useCallback(
    (lancamento: LancamentoFinanceiroInput) => {
      let entity!: LancamentoFinanceiro
      commit((prev) => {
        const result = service.adicionarLancamento(prev, lancamento)
        entity = result.entity
        return result.db
      })
      return entity
    },
    [commit, service]
  )

  const atualizarLancamento = useCallback(
    (id: string, lancamento: Partial<LancamentoFinanceiro>) => {
      commit((prev) => service.atualizarLancamento(prev, id, lancamento))
    },
    [commit, service]
  )

  const excluirLancamento = useCallback(
    (id: string) => {
      commit((prev) => service.excluirLancamento(prev, id))
    },
    [commit, service]
  )

  const adicionarAgendamento = useCallback(
    (agendamento: AgendamentoInput) => {
      let entity!: Agendamento
      commit((prev) => {
        const result = service.adicionarAgendamento(prev, agendamento)
        entity = result.entity
        return result.db
      })
      return entity
    },
    [commit, service]
  )

  const atualizarAgendamento = useCallback(
    (id: string, agendamento: Partial<Agendamento>) => {
      commit((prev) => service.atualizarAgendamento(prev, id, agendamento))
    },
    [commit, service]
  )

  const excluirAgendamento = useCallback(
    (id: string) => {
      commit((prev) => service.excluirAgendamento(prev, id))
    },
    [commit, service]
  )

  const atualizarConfiguracao = useCallback(
    (config: Partial<ConfiguracaoOficina>) => {
      commit((prev) => service.atualizarConfiguracao(prev, config))
    },
    [commit, service]
  )

  const salvarPerfilComissao = useCallback(
    (input: PerfilComissaoFuncionarioInput & { id?: string }) => {
      let entity!: PerfilComissaoFuncionario
      commit((prev) => {
        const result = service.salvarPerfilComissao(prev, input)
        entity = result.entity
        return result.db
      })
      agendarSincronizacaoComissoes(officeId)
      return entity
    },
    [commit, service, officeId]
  )

  const excluirPerfilComissao = useCallback(
    (id: string) => {
      commit((prev) => service.excluirPerfilComissao(prev, id))
      agendarSincronizacaoComissoes(officeId)
    },
    [commit, service, officeId]
  )

  const atualizarComissoesConfig = useCallback(
    (patch: Partial<ComissoesConfigOficina>) => {
      commit((prev) => service.atualizarComissoesConfig(prev, patch))
      agendarSincronizacaoComissoes(officeId)
    },
    [commit, service, officeId]
  )

  const atualizarPermissoesEquipe = useCallback(
    (permissions: import('@/types/permissoes-equipe').PermissoesEquipeConfig) => {
      commit((prev) => service.atualizarPermissoesEquipe(prev, permissions))
      agendarSincronizacaoComissoes(officeId)
    },
    [commit, service, officeId]
  )

  const resetarDados = useCallback(() => {
    const fresh = service.resetar()
    setDados(fresh)
  }, [service])

  const limparDadosTeste = useCallback(
    async (opcao: OpcaoLimpezaTeste): Promise<ResultadoLimpezaTeste> => {
      const resultado = await limparDadosTesteOficina({
        officeLocalId: officeId,
        dadosAtuais: dados,
        opcao,
      })
      if (resultado.ok) {
        const db = service.carregar()
        setDados(db)
      }
      return resultado
    },
    [dados, officeId, service]
  )

  const aplicarDatabase = useCallback(
    (db: CraftDatabase) => {
      setDados(db)
      service.salvar(db)
    },
    [service]
  )

  const recarregarDadosSupabase = useCallback(async () => {
    setErroCarregamento(null)
    if (getCraftPersistenceMode() !== 'supabase' || !isModoSupabaseExperimentalAtivo()) {
      const local = carregarLocalSeguro()
      setDados(local)
      return local
    }
    setCarregandoRemoto(true)
    try {
      const db = await carregarComSupabase(officeId)
      if (!databasePertenceOffice(db, officeId)) {
        throw new Error('Dados recebidos não correspondem à oficina ativa.')
      }
      setDados(db)
      emitirDiagnosticoPendenciasAtualizado(officeId)
      return db
    } catch (err) {
      console.error('[Craft] Falha ao recarregar dados da oficina', { officeId, err })
      setErroCarregamento('Não foi possível carregar os dados. Tente novamente.')
      const placeholder = criarDatabasePlaceholderOficina(officeId)
      setDados(placeholder)
      return placeholder
    } finally {
      setCarregandoRemoto(false)
    }
  }, [carregarLocalSeguro, officeId])

  const adicionarModeloChecklist = useCallback(
    (modelo: ModeloChecklistInput) => {
      let entity!: ModeloChecklist
      commit((prev) => {
        const result = service.adicionarModeloChecklist(prev, modelo)
        entity = result.entity
        return result.db
      })
      return entity
    },
    [commit, service]
  )

  const atualizarModeloChecklist = useCallback(
    (id: string, modelo: Partial<ModeloChecklist>) => {
      commit((prev) => service.atualizarModeloChecklist(prev, id, modelo))
    },
    [commit, service]
  )

  const excluirModeloChecklist = useCallback(
    (id: string) => {
      commit((prev) => service.excluirModeloChecklist(prev, id))
    },
    [commit, service]
  )

  const definirModeloPadraoChecklist = useCallback(
    (id: string) => {
      commit((prev) => service.definirModeloPadraoChecklist(prev, id))
    },
    [commit, service]
  )

  const adicionarServicoCatalogo = useCallback(
    (servico: ServicoCatalogoInput) => {
      let entity!: ServicoCatalogo
      commit((prev) => {
        const result = service.adicionarServicoCatalogo(prev, servico)
        entity = result.entity
        return result.db
      })
      return entity
    },
    [commit, service]
  )

  const atualizarServicoCatalogo = useCallback(
    (id: string, servico: Partial<ServicoCatalogo>) => {
      commit((prev) => service.atualizarServicoCatalogo(prev, id, servico))
    },
    [commit, service]
  )

  const excluirServicoCatalogo = useCallback(
    (id: string) => {
      commit((prev) => service.excluirServicoCatalogo(prev, id))
    },
    [commit, service]
  )

  const adicionarFornecedor = useCallback(
    (fornecedor: FornecedorInput) => {
      let entity!: Fornecedor
      commit((prev) => {
        const result = service.adicionarFornecedor(prev, fornecedor)
        entity = result.entity
        return result.db
      })
      return entity
    },
    [commit, service]
  )

  const atualizarFornecedor = useCallback(
    (id: string, fornecedor: Partial<Fornecedor>) => {
      commit((prev) => service.atualizarFornecedor(prev, id, fornecedor))
    },
    [commit, service]
  )

  const excluirFornecedor = useCallback(
    (id: string) => {
      commit((prev) => service.excluirFornecedor(prev, id))
    },
    [commit, service]
  )

  const registrarEntradaEstoque = useCallback(
    (input: EntradaEstoqueInput) => {
      commit((prev) => service.registrarEntradaEstoque(prev, input))
    },
    [commit, service]
  )

  const registrarAjusteEstoque = useCallback(
    (input: AjusteEstoqueInput) => {
      commit((prev) => service.registrarAjusteEstoque(prev, input))
    },
    [commit, service]
  )

  const value = useMemo(
    () => ({
      dados,
      oficinaId: officeId,
      carregandoRemoto,
      dadosProntos,
      erroCarregamento,
      adicionarCliente,
      adicionarClienteComMotoOpcional,
      atualizarCliente,
      excluirCliente,
      adicionarMoto,
      atualizarMoto,
      excluirMoto,
      adicionarOS,
      atualizarOS,
      excluirOS,
      adicionarPeca,
      atualizarPeca,
      excluirPeca,
      adicionarLancamento,
      atualizarLancamento,
      excluirLancamento,
      adicionarAgendamento,
      atualizarAgendamento,
      excluirAgendamento,
      atualizarConfiguracao,
      salvarPerfilComissao,
      excluirPerfilComissao,
      atualizarComissoesConfig,
      atualizarPermissoesEquipe,
      adicionarModeloChecklist,
      atualizarModeloChecklist,
      excluirModeloChecklist,
      definirModeloPadraoChecklist,
      adicionarServicoCatalogo,
      atualizarServicoCatalogo,
      excluirServicoCatalogo,
      adicionarFornecedor,
      atualizarFornecedor,
      excluirFornecedor,
      registrarEntradaEstoque,
      registrarAjusteEstoque,
      resetarDados,
      aplicarDatabase,
      limparDadosTeste,
      recarregarDadosSupabase,
    }),
    [
      dados,
      officeId,
      carregandoRemoto,
      dadosProntos,
      erroCarregamento,
      adicionarCliente,
      adicionarClienteComMotoOpcional,
      atualizarCliente,
      excluirCliente,
      adicionarMoto,
      atualizarMoto,
      excluirMoto,
      adicionarOS,
      atualizarOS,
      excluirOS,
      adicionarPeca,
      atualizarPeca,
      excluirPeca,
      adicionarLancamento,
      atualizarLancamento,
      excluirLancamento,
      adicionarAgendamento,
      atualizarAgendamento,
      excluirAgendamento,
      atualizarConfiguracao,
      salvarPerfilComissao,
      excluirPerfilComissao,
      atualizarComissoesConfig,
      atualizarPermissoesEquipe,
      adicionarModeloChecklist,
      atualizarModeloChecklist,
      excluirModeloChecklist,
      definirModeloPadraoChecklist,
      adicionarServicoCatalogo,
      atualizarServicoCatalogo,
      excluirServicoCatalogo,
      adicionarFornecedor,
      atualizarFornecedor,
      excluirFornecedor,
      registrarEntradaEstoque,
      registrarAjusteEstoque,
      resetarDados,
      aplicarDatabase,
      limparDadosTeste,
      recarregarDadosSupabase,
    ]
  )

  return <CraftContext.Provider value={value}>{children}</CraftContext.Provider>
}

function CarregandoCraft() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Carregando dados da oficina...</p>
      </div>
    </div>
  )
}

function ErroCarregamentoOficina({
  mensagem,
  onTentarNovamente,
}: {
  mensagem: string
  onTentarNovamente: () => void
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">{mensagem}</p>
        <button
          type="button"
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          onClick={onTentarNovamente}
        >
          Tentar novamente
        </button>
      </div>
    </div>
  )
}

function OficinaDadosGate({ children }: { children: ReactNode }) {
  const { dadosProntos, erroCarregamento, recarregarDadosSupabase } = useCraft()

  if (erroCarregamento) {
    return (
      <ErroCarregamentoOficina
        mensagem={erroCarregamento}
        onTentarNovamente={() => void recarregarDadosSupabase()}
      />
    )
  }

  if (!dadosProntos) {
    return <CarregandoCraft />
  }

  return <>{children}</>
}

function CarregandoCraftAuth() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Carregando dados da oficina...</p>
      </div>
    </div>
  )
}

export function CraftProviderWrapper() {
  const { session, loading, estadoAuth, erroAuth, modoAuth } = useAuth()

  if (loading || estadoAuth === 'carregando') {
    return <CarregandoCraftAuth />
  }

  if (modoAuth === 'supabase' && estadoAuth === 'erro') {
    return (
      <AuthFallbackScreen
        titulo="Erro ao carregar dados da oficina"
        mensagem={erroAuth ?? undefined}
      />
    )
  }

  if (!sessaoLocalValida(session)) {
    return <CarregandoCraftAuth />
  }

  const officeId = obterOfficeIdDaSessao(session)
  const providerKey = `${session.user.id}:${officeId}`

  return (
    <BancoStatusProvider officeId={officeId} key={providerKey}>
      <CraftProvider officeId={officeId} key={providerKey}>
        <OficinaDadosGate>
          <OficinaTemaProvider>
            <AssinaturaProvider>
              <ComunicacaoProvider>
                <LembretesProvider>
                  <Outlet />
                </LembretesProvider>
              </ComunicacaoProvider>
            </AssinaturaProvider>
          </OficinaTemaProvider>
        </OficinaDadosGate>
      </CraftProvider>
    </BancoStatusProvider>
  )
}

export function useCraft() {
  const ctx = useContext(CraftContext)
  if (!ctx) throw new Error('useCraft deve ser usado dentro de CraftProvider')
  return ctx
}

export function useOficinaData() {
  const { dados, oficinaId, dadosProntos } = useCraft()
  const placeholder = useMemo(
    () => criarDatabasePlaceholderOficina(oficinaId),
    [oficinaId]
  )
  const fonte = dadosProntos && configuracaoPertenceOffice(dados.configuracao, oficinaId)
    ? dados
    : placeholder

  return useMemo(
    () => ({
      clientes: filtrarPorOffice(fonte.clientes, oficinaId),
      motos: filtrarPorOffice(fonte.motos, oficinaId),
      ordens: filtrarPorOffice(fonte.ordens_servico, oficinaId),
      pecas: filtrarPorOffice(fonte.pecas, oficinaId),
      lancamentos: filtrarPorOffice(fonte.lancamentos, oficinaId),
      agendamentos: filtrarPorOffice(fonte.agendamentos, oficinaId),
      modelosChecklist: filtrarPorOffice(fonte.modelos_checklist ?? [], oficinaId),
      servicosCatalogo: filtrarPorOffice(fonte.servicos_catalogo ?? [], oficinaId),
      fornecedores: filtrarPorOffice(fonte.fornecedores ?? [], oficinaId),
      perfisComissao: filtrarPorOffice(fonte.perfis_comissao ?? [], oficinaId),
      movimentacoesEstoque: filtrarPorOffice(fonte.movimentacoes_estoque ?? [], oficinaId),
      configuracao: fonte.configuracao,
      dadosProntos,
    }),
    [fonte, oficinaId, dadosProntos]
  )
}

/** Fonte única: nome e logo da oficina logada */
export function useOficinaAtual(): OficinaAtual {
  const { configuracao } = useOficinaData()
  return useMemo(() => extrairOficinaAtual(configuracao), [configuracao])
}
