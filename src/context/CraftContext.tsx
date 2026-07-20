import { useAuth } from '@/context/AuthContext'
import { AuthFallbackScreen } from '@/components/auth/AuthFallbackScreen'
import { logBootstrap, logBootstrapReset } from '@/lib/bootstrap-debug'
import { obterOfficeIdDaSessao, sessaoLocalValida } from '@/lib/session-safe'
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Outlet } from 'react-router-dom'
import { ComunicacaoProvider } from '@/context/ComunicacaoContext'
import { AutorizacaoValoresProvider } from '@/context/AutorizacaoValoresContext'
import { LembretesProvider } from '@/context/LembretesContext'
import { BancoStatusProvider } from '@/context/BancoStatusContext'
import { AssinaturaProvider } from '@/context/AssinaturaContext'
import { OficinaTemaProvider } from '@/components/oficina/OficinaTemaProvider'
import { CraftDataService } from '@/services/craft-data.service'
import { getCraftPersistenceMode } from '@/lib/supabase'
import { sincronizarProximoNumeroOsNoDatabase } from '@/services/os-numbering.service'
import { emitirDiagnosticoPendenciasAtualizado } from '@/services/persistence-status.events'
import { carregarComSupabase } from '@/services/repository/hybrid.repository'
import { localCraftRepository } from '@/services/repository/local.repository'
import {
  agendarPullMultiDevice,
  iniciarRealtimeOffice,
  pararRealtimeOffice,
  registrarHandlerPullMultiDevice,
  type MotivoPull,
} from '@/services/sync/multi-device-sync.service'
import { logSyncDiag, registrarUltimoPullModulo } from '@/services/sync/sync-diagnostico'
import { aguardarSessaoAuthSupabase } from '@/lib/supabase-session-ready'
import {
  createCraftRepository,
  isModoSupabaseExperimentalAtivo,
} from '@/services/repository/repository.factory'
import { filtrarPorOffice } from '@/services/analytics.service'
import { filtrarEntidadesAtivas } from '@/lib/entidade-ativa'
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
import {
  agendarSincronizacaoEstoque,
  ESTOQUE_EVENTO_ATUALIZADO,
  publicarPecaAtualizada,
  publicarPecaCriada,
  publicarTombstonesEstoque,
  type ResultadoPublicacaoPeca,
} from '@/services/estoque/estoque-sync.service'
import { reconciliarEstoqueOsComSupabase } from '@/services/estoque/reconcile-os-stock.service'
import { SYNC_FORCADO_EVENTO } from '@/services/comunicacao/forcar-sincronizacao.service'
import { isDialogOsAberto } from '@/lib/ui-interaction'

interface CraftContextValue {
  dados: CraftDatabase
  oficinaId: string
  carregandoRemoto: boolean
  /** Sync remoto em andamento sem bloquear a UI */
  sincronizandoEmBackground: boolean
  dadosProntos: boolean
  erroCarregamento: string | null
  adicionarCliente: (cliente: ClienteInput) => Cliente
  adicionarClienteComMotoOpcional: (
    cliente: ClienteInput,
    moto: MotoInput | null
  ) => { cliente: Cliente; moto?: Moto }
  atualizarCliente: (
    id: string,
    cliente: Partial<Cliente>
  ) => Promise<{ ok: boolean; remoto: boolean; pendente: boolean; erro?: string } | void>
  excluirCliente: (id: string) => void
  adicionarMoto: (moto: MotoInput) => Moto
  atualizarMoto: (
    id: string,
    moto: Partial<Moto>
  ) => Promise<{ ok: boolean; remoto: boolean; pendente: boolean; erro?: string } | void>
  excluirMoto: (id: string) => void
  adicionarOS: (os: OrdemServicoInput, opcoes?: { numero?: number }) => Promise<OrdemServico>
  atualizarOS: (id: string, os: Partial<OrdemServico>) => Promise<OrdemServico | undefined>
  excluirOS: (id: string) => void
  adicionarPeca: (peca: PecaInput) => Peca
  atualizarPeca: (
    id: string,
    peca: Partial<Peca>
  ) => Promise<ResultadoPublicacaoPeca | void>
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
  registrarEntradaEstoque: (
    input: EntradaEstoqueInput
  ) => Promise<ResultadoPublicacaoPeca | void>
  registrarAjusteEstoque: (
    input: AjusteEstoqueInput
  ) => Promise<ResultadoPublicacaoPeca | void>
  resetarDados: () => void
  aplicarDatabase: (db: CraftDatabase) => void
  /** Limpa dados operacionais de teste (preserva login, oficina e configurações). */
  limparDadosTeste: (opcao: OpcaoLimpezaTeste) => Promise<ResultadoLimpezaTeste>
  /** Recarrega fase 1 (clientes, motos, OS) do Supabase para a lista */
  recarregarDadosSupabase: (opcoes?: { silencioso?: boolean }) => Promise<CraftDatabase>
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

  const temCacheLocal = useCallback(
    () => localCraftRepository.tenantExiste(officeId),
    [officeId]
  )

  const [dados, setDados] = useState<CraftDatabase>(() => carregarLocalSeguro())
  /** Só bloqueia a tela se não há cache local (primeira visita / limpeza). */
  const [bloqueioBootstrap, setBloqueioBootstrap] = useState(
    () =>
      isModoSupabaseExperimentalAtivo() && !localCraftRepository.tenantExiste(officeId)
  )
  const [carregandoRemoto, setCarregandoRemoto] = useState(
    () => isModoSupabaseExperimentalAtivo()
  )
  const [sincronizandoEmBackground, setSincronizandoEmBackground] = useState(false)
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null)

  const dadosProntos = useMemo(() => {
    if (!configuracaoPertenceOffice(dados.configuracao, officeId)) return false
    if (erroCarregamento) return false
    // Com cache local, abre imediatamente mesmo enquanto o remoto sincroniza
    if (bloqueioBootstrap) return false
    return true
  }, [dados.configuracao, officeId, erroCarregamento, bloqueioBootstrap])

  useEffect(() => {
    service.setUsuario(
      session?.user
        ? { id: session.user.id, nome: session.user.nome }
        : {}
    )
  }, [service, session?.user])

  useEffect(() => {
    setErroCarregamento(null)
    const local = carregarLocalSeguro()
    const cacheOk = temCacheLocal()

    logBootstrap('craft_office_trocada', {
      officeId,
      origem: cacheOk ? 'localStorage' : 'placeholder',
      clientes: local.clientes.length,
      nomeOficina: local.configuracao.nome,
      cacheOk,
    })

    setDados(local)

    if (getCraftPersistenceMode() === 'supabase' && isModoSupabaseExperimentalAtivo()) {
      // Local-first: nunca apaga dados locais com placeholder se já existir cache
      setBloqueioBootstrap(!cacheOk)
      setCarregandoRemoto(true)
      setSincronizandoEmBackground(cacheOk)
      return
    }

    setBloqueioBootstrap(false)
    setCarregandoRemoto(false)
    setSincronizandoEmBackground(false)
  }, [officeId, carregarLocalSeguro, temCacheLocal])

  useEffect(() => {
    if (getCraftPersistenceMode() !== 'supabase' || !isModoSupabaseExperimentalAtivo()) {
      return
    }

    let cancelado = false
    const cacheOk = temCacheLocal()
    setCarregandoRemoto(true)
    setSincronizandoEmBackground(cacheOk)
    setErroCarregamento(null)
    // Com cache: UI já liberada. Sem cache: libera no finally (ou timeout no hybrid).
    if (cacheOk) {
      setBloqueioBootstrap(false)
    }

    logBootstrap('craft_bootstrap_inicio', {
      officeId,
      userId: session?.user.id,
      profileOfficeId: session?.user.office_id,
      cacheOk,
      modo: 'local_first',
    })

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

        logBootstrap('craft_fase1_pronta', {
          officeId,
          officeIdCarregado: dbNormalizado.configuracao.office_id,
          origem: 'supabase',
          clientes: dbNormalizado.clientes.length,
          os: dbNormalizado.ordens_servico.length,
          nomeOficina: dbNormalizado.configuracao.nome,
          tipoOficina: dbNormalizado.configuracao.tipo_oficina,
        })

        // Não sobrescrever a UI se o usuário já editou (OS aberta)
        if (!isDialogOsAberto()) {
          startTransition(() => {
            setDados(dbNormalizado)
          })
        }

        // Comissões em background — não bloqueia unlock
        void inicializarComissoesSupabase(officeId).then(() => {
          if (cancelado || isDialogOsAberto()) return
          const dbPosSync = service.carregar()
          if (!databasePertenceOffice(dbPosSync, officeId)) return
          startTransition(() => {
            setDados((prev) => {
              if (!databasePertenceOffice(prev, officeId)) return prev
              return {
                ...prev,
                perfis_comissao: dbPosSync.perfis_comissao ?? prev.perfis_comissao,
              }
            })
          })
        })

        emitirDiagnosticoPendenciasAtualizado(officeId)
        logBootstrap('craft_bootstrap_completo', {
          officeId,
          origem: 'supabase+cache',
          clientes: dbNormalizado.clientes.length,
          os: dbNormalizado.ordens_servico.length,
        })
      })
      .catch((err) => {
        if (cancelado) return
        console.error('[Craft] Falha ao carregar dados da oficina', { officeId, err })
        logBootstrapReset('falha_carregar_supabase', { officeId, erro: String(err) })
        // Com cache: mantém dados locais e só avisa. Sem cache: erro bloqueante.
        if (!temCacheLocal()) {
          setErroCarregamento('Não foi possível carregar os dados. Tente novamente.')
          setDados(criarDatabasePlaceholderOficina(officeId))
        }
      })
      .finally(() => {
        if (cancelado) return
        setCarregandoRemoto(false)
        setSincronizandoEmBackground(false)
        setBloqueioBootstrap(false)
      })

    return () => {
      cancelado = true
    }
  }, [officeId, service, session?.user.id, session?.user.office_id, temCacheLocal])

  useEffect(() => {
    const handlerComissoes = () => {
      const db = service.carregar()
      if (!databasePertenceOffice(db, officeId)) return
      logBootstrap('craft_merge_comissoes', {
        officeId,
        origem: 'localStorage',
        perfis: db.perfis_comissao?.length ?? 0,
      })
      setDados((prev) => {
        if (!databasePertenceOffice(prev, officeId)) return prev
        return { ...prev, perfis_comissao: db.perfis_comissao ?? [] }
      })
    }

    const handlerEstoque = () => {
      const db = service.carregar()
      if (!databasePertenceOffice(db, officeId)) return
      // Evita re-render pesado enquanto edita OS (não sobrescreve qty local da UI)
      if (isDialogOsAberto()) return
      logBootstrap('craft_merge_estoque', {
        officeId,
        origem: 'localStorage',
        pecas: db.pecas?.length ?? 0,
      })
      startTransition(() => {
        setDados((prev) => {
          if (!databasePertenceOffice(prev, officeId)) return prev
          return {
            ...prev,
            pecas: db.pecas ?? [],
            fornecedores: db.fornecedores ?? [],
            movimentacoes_estoque: db.movimentacoes_estoque ?? [],
          }
        })
      })
    }

    window.addEventListener(COMISSOES_EVENTO_ATUALIZADO, handlerComissoes)
    window.addEventListener(ESTOQUE_EVENTO_ATUALIZADO, handlerEstoque)
    return () => {
      window.removeEventListener(COMISSOES_EVENTO_ATUALIZADO, handlerComissoes)
      window.removeEventListener(ESTOQUE_EVENTO_ATUALIZADO, handlerEstoque)
    }
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
    async (id: string, cliente: Partial<Cliente>) => {
      let anterior: Cliente | undefined
      let atualizado: Cliente | undefined
      commit((prev) => {
        anterior = prev.clientes.find((c) => c.id === id)
        const next = service.atualizarCliente(prev, id, cliente)
        atualizado = next.clientes.find((c) => c.id === id)
        return next
      })
      if (!atualizado) {
        return { ok: false, remoto: false, pendente: false, erro: 'Cliente não encontrado' }
      }
      const { publicarClienteAtualizado } = await import(
        '@/services/clientes/cliente-update-supabase.service'
      )
      return publicarClienteAtualizado(officeId, atualizado, {
        anterior,
        patch: cliente,
      })
    },
    [commit, service, officeId]
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
      void import('@/services/veiculos/veiculo-update-supabase.service').then((m) =>
        m.publicarVeiculoCriado(officeId, entity)
      )
      return entity
    },
    [commit, service, officeId]
  )

  const atualizarMoto = useCallback(
    async (id: string, moto: Partial<Moto>) => {
      let anterior: Moto | undefined
      let atualizada: Moto | undefined
      commit((prev) => {
        anterior = prev.motos.find((m) => m.id === id)
        const next = service.atualizarMoto(prev, id, moto)
        atualizada = next.motos.find((m) => m.id === id)
        return next
      })
      if (!atualizada) {
        return { ok: false, remoto: false, pendente: false, erro: 'Veículo não encontrado' }
      }
      const { publicarVeiculoAtualizado } = await import(
        '@/services/veiculos/veiculo-update-supabase.service'
      )
      return publicarVeiculoAtualizado(officeId, atualizada, {
        anterior,
        patch: moto,
      })
    },
    [commit, service, officeId]
  )

  const excluirMoto = useCallback(
    (id: string) => {
      commit((prev) => service.excluirMoto(prev, id))
    },
    [commit, service]
  )

  const adicionarOS = useCallback(
    async (os: OrdemServicoInput, opcoes?: { numero?: number }) => {
      let entity!: OrdemServico
      let mudouEstoque = false
      commit((prev) => {
        const fresh = localCraftRepository.carregar(officeId)
        const base = databasePertenceOffice(fresh, officeId)
          ? {
              ...prev,
              pecas: fresh.pecas ?? prev.pecas,
              fornecedores: fresh.fornecedores ?? prev.fornecedores,
              movimentacoes_estoque:
                fresh.movimentacoes_estoque ?? prev.movimentacoes_estoque,
            }
          : prev
        const qtdAntes = new Map(base.pecas.map((p) => [p.id, p.quantidade]))
        const movAntes = base.movimentacoes_estoque?.length ?? 0
        const result = service.adicionarOS(base, os, opcoes)
        entity = result.entity
        mudouEstoque =
          (result.db.movimentacoes_estoque?.length ?? 0) !== movAntes ||
          result.db.pecas.some((p) => qtdAntes.get(p.id) !== p.quantidade)
        return result.db
      })
      if (mudouEstoque) {
        const rec = await reconciliarEstoqueOsComSupabase(officeId, entity, session?.user)
        if (!rec.ok && rec.mensagem && rec.mensagem !== 'offline') {
          console.error('[Craft] Reconcile após criar OS falhou', rec)
        }
        agendarSincronizacaoEstoque(officeId)
      }
      return entity
    },
    [commit, service, officeId, session?.user]
  )

  const atualizarOS = useCallback(
    async (id: string, os: Partial<OrdemServico>) => {
      let mudouEstoque = false
      let osFinal: OrdemServico | undefined
      commit((prev) => {
        // Estoque pode ter sido atualizado no storage pelo sync sem setState (dialog aberto)
        const fresh = localCraftRepository.carregar(officeId)
        const base = databasePertenceOffice(fresh, officeId)
          ? {
              ...prev,
              pecas: fresh.pecas ?? prev.pecas,
              fornecedores: fresh.fornecedores ?? prev.fornecedores,
              movimentacoes_estoque:
                fresh.movimentacoes_estoque ?? prev.movimentacoes_estoque,
              ordens_servico: (prev.ordens_servico ?? []).map((o) => {
                if (o.id !== id) return o
                const rem = fresh.ordens_servico?.find((x) => x.id === id)
                if (!rem) return o
                return {
                  ...o,
                  estoque_baixado: Boolean(o.estoque_baixado || rem.estoque_baixado),
                  pecas_utilizadas: (o.pecas_utilizadas ?? []).map((pu) => {
                    const match =
                      rem.pecas_utilizadas?.find(
                        (r) =>
                          (r.linha_id && r.linha_id === pu.linha_id) ||
                          (r.peca_id && r.peca_id === pu.peca_id && !r.manual)
                      ) ?? rem.pecas_utilizadas?.find((r) => r.peca_id === pu.peca_id)
                    const qBaix =
                      Math.max(
                        typeof pu.quantidade_baixada === 'number' ? pu.quantidade_baixada : 0,
                        typeof match?.quantidade_baixada === 'number'
                          ? match.quantidade_baixada
                          : 0
                      ) || pu.quantidade_baixada
                    return qBaix !== undefined ? { ...pu, quantidade_baixada: qBaix } : pu
                  }),
                }
              }),
            }
          : prev
        const qtdAntes = new Map(base.pecas.map((p) => [p.id, p.quantidade]))
        const movAntes = base.movimentacoes_estoque?.length ?? 0
        const next = service.atualizarOS(base, id, os)
        mudouEstoque =
          (next.movimentacoes_estoque?.length ?? 0) !== movAntes ||
          next.pecas.some((p) => qtdAntes.get(p.id) !== p.quantidade)
        osFinal = next.ordens_servico.find((o) => o.id === id)
        return next
      })

      // Cancelamento SEMPRE reconcilia (demanda vazia), mesmo se mudouEstoque local falhou
      const forcarCancelamento = osFinal?.status === 'cancelada' || os.status === 'cancelada'
      if (osFinal && (mudouEstoque || forcarCancelamento)) {
        const rec = await reconciliarEstoqueOsComSupabase(officeId, osFinal, session?.user)
        if (!rec.ok && rec.mensagem && rec.mensagem !== 'offline') {
          // Propaga para quem aguarda (cancelamento na lista / save)
          throw new Error(
            `Não foi possível atualizar o estoque no servidor: ${rec.mensagem}`
          )
        }
        agendarSincronizacaoEstoque(officeId)
      }
      return osFinal
    },
    [commit, service, officeId, session?.user]
  )

  const excluirOS = useCallback(
    (id: string) => {
      let mudouEstoque = false
      commit((prev) => {
        const qtdAntes = new Map(prev.pecas.map((p) => [p.id, p.quantidade]))
        const movAntes = prev.movimentacoes_estoque?.length ?? 0
        const next = service.excluirOS(prev, id)
        mudouEstoque =
          (next.movimentacoes_estoque?.length ?? 0) !== movAntes ||
          next.pecas.some((p) => qtdAntes.get(p.id) !== p.quantidade)
        return next
      })
      if (mudouEstoque) agendarSincronizacaoEstoque(officeId)
    },
    [commit, service, officeId]
  )

  const adicionarPeca = useCallback(
    (peca: PecaInput) => {
      let entity!: Peca
      commit((prev) => {
        const result = service.adicionarPeca(prev, peca)
        entity = result.entity
        return result.db
      })
      // Persistência imediata em inventory_items (não depender só do debounce 1.2s)
      void publicarPecaCriada(officeId, entity)
      agendarSincronizacaoEstoque(officeId)
      return entity
    },
    [commit, service, officeId]
  )

  const atualizarPeca = useCallback(
    async (id: string, peca: Partial<Peca>) => {
      let anterior: Peca | undefined
      let atualizada: Peca | undefined
      commit((prev) => {
        anterior = prev.pecas.find((p) => p.id === id)
        const next = service.atualizarPeca(prev, id, peca)
        atualizada = next.pecas.find((p) => p.id === id)
        return next
      })
      if (!atualizada) return { ok: false, remoto: false, pendente: false, erro: 'Peça não encontrada' }

      const qtyNoPatch = peca.quantidade !== undefined
      const qtyMudou = qtyNoPatch && peca.quantidade !== anterior?.quantidade
      const resultado = await publicarPecaAtualizada(officeId, atualizada, {
        quantidadeAnterior: anterior?.quantidade,
        incluirQuantidade: qtyMudou || qtyNoPatch,
      })
      agendarSincronizacaoEstoque(officeId)
      return resultado
    },
    [commit, service, officeId]
  )

  const excluirPeca = useCallback(
    (id: string) => {
      commit((prev) => service.excluirPeca(prev, id))
      // Publica tombstone na hora — F5/outro device não pode restaurar antes do sync agendado
      void publicarTombstonesEstoque(officeId)
      agendarSincronizacaoEstoque(officeId)
    },
    [commit, service, officeId]
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

  const recarregarDadosSupabase = useCallback(async (opcoes?: { silencioso?: boolean }) => {
    setErroCarregamento(null)
    if (getCraftPersistenceMode() !== 'supabase' || !isModoSupabaseExperimentalAtivo()) {
      const local = carregarLocalSeguro()
      setDados(local)
      return local
    }
    const silencioso = opcoes?.silencioso === true || temCacheLocal()
    if (!silencioso) {
      setCarregandoRemoto(true)
      setBloqueioBootstrap(!temCacheLocal())
    } else {
      setSincronizandoEmBackground(true)
    }
    try {
      const db = await carregarComSupabase(officeId)
      if (!databasePertenceOffice(db, officeId)) {
        throw new Error('Dados recebidos não correspondem à oficina ativa.')
      }
      if (!isDialogOsAberto()) {
        startTransition(() => setDados(db))
      }
      emitirDiagnosticoPendenciasAtualizado(officeId)
      return db
    } catch (err) {
      console.error('[Craft] Falha ao recarregar dados da oficina', { officeId, err })
      if (!silencioso && !temCacheLocal()) {
        setErroCarregamento('Não foi possível carregar os dados. Tente novamente.')
        const placeholder = criarDatabasePlaceholderOficina(officeId)
        setDados(placeholder)
        return placeholder
      }
      return carregarLocalSeguro()
    } finally {
      setCarregandoRemoto(false)
      setSincronizandoEmBackground(false)
      setBloqueioBootstrap(false)
    }
  }, [carregarLocalSeguro, officeId, temCacheLocal])

  useEffect(() => {
    if (!isModoSupabaseExperimentalAtivo()) return
    if (typeof window === 'undefined') return

    let cancelado = false
    let intervalId: ReturnType<typeof setInterval> | undefined
    const INTERVALO_PULL_MS = 60_000

    const aplicarPullCompleto = async (motivo: MotivoPull) => {
      if (cancelado) return
      if (document.visibilityState === 'hidden' && motivo !== 'realtime' && motivo !== 'manual') return
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
      if (isDialogOsAberto()) return

      // Não puxar sem JWT — evita “Sem sessão Auth” e push/pull cego
      const sessao = await aguardarSessaoAuthSupabase({ tentativas: 6, intervaloMs: 200 })
      if (!sessao || cancelado) return

      logSyncDiag(`craft_pull_${motivo}`, officeId)
      const db = await carregarComSupabase(officeId, {
        silencioso: true,
        processarFilaAposPull: motivo !== 'realtime',
      })
      if (cancelado || isDialogOsAberto()) return
      if (!databasePertenceOffice(db, officeId)) return

      registrarUltimoPullModulo(officeId, 'geral')
      registrarUltimoPullModulo(officeId, 'fase1')
      startTransition(() => setDados(db))
      emitirDiagnosticoPendenciasAtualizado(officeId)
    }

    registrarHandlerPullMultiDevice(officeId, async (motivo) => {
      await aplicarPullCompleto(motivo)
    })

    void (async () => {
      const sessao = await aguardarSessaoAuthSupabase({ tentativas: 10, intervaloMs: 300 })
      if (!sessao || cancelado) return

      await iniciarRealtimeOffice(officeId, async (motivo) => {
        await aplicarPullCompleto(motivo)
      })

      if (!cancelado) {
        agendarPullMultiDevice(officeId, 'visibility', { delayMs: 1500 })
      }
    })()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        agendarPullMultiDevice(officeId, 'visibility', { delayMs: 1200 })
      }
    }

    const onOnline = () => {
      // Flush creates pendentes + pull (pull sozinho não publica peça nova)
      agendarSincronizacaoEstoque(officeId)
      void import('@/services/clientes/cliente-update-supabase.service').then((m) =>
        m.processarFilaClientesPendente(officeId)
      )
      void import('@/services/veiculos/veiculo-update-supabase.service').then((m) =>
        m.processarFilaVeiculosPendente(officeId)
      )
      agendarPullMultiDevice(officeId, 'online', { delayMs: 800, forcar: true })
    }

    const onSyncForcado = () => {
      void recarregarDadosSupabase({ silencioso: true })
    }

    intervalId = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (isDialogOsAberto()) return
      agendarPullMultiDevice(officeId, 'interval')
    }, INTERVALO_PULL_MS)

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    window.addEventListener(SYNC_FORCADO_EVENTO, onSyncForcado)

    return () => {
      cancelado = true
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
      window.removeEventListener(SYNC_FORCADO_EVENTO, onSyncForcado)
      void pararRealtimeOffice(officeId)
    }
  }, [officeId, recarregarDadosSupabase])

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
      agendarSincronizacaoEstoque(officeId)
      return entity
    },
    [commit, service, officeId]
  )

  const atualizarFornecedor = useCallback(
    (id: string, fornecedor: Partial<Fornecedor>) => {
      commit((prev) => service.atualizarFornecedor(prev, id, fornecedor))
      agendarSincronizacaoEstoque(officeId)
    },
    [commit, service, officeId]
  )

  const excluirFornecedor = useCallback(
    (id: string) => {
      commit((prev) => service.excluirFornecedor(prev, id))
      agendarSincronizacaoEstoque(officeId)
    },
    [commit, service, officeId]
  )

  const registrarEntradaEstoque = useCallback(
    async (input: EntradaEstoqueInput) => {
      let anterior: Peca | undefined
      let atualizada: Peca | undefined
      commit((prev) => {
        anterior = prev.pecas.find((p) => p.id === input.peca_id)
        const next = service.registrarEntradaEstoque(prev, input)
        atualizada = next.pecas.find((p) => p.id === input.peca_id)
        return next
      })
      if (!atualizada) return { ok: false, remoto: false, pendente: false, erro: 'Peça não encontrada' }
      const resultado = await publicarPecaAtualizada(officeId, atualizada, {
        quantidadeAnterior: anterior?.quantidade,
        incluirQuantidade: true,
      })
      agendarSincronizacaoEstoque(officeId)
      return resultado
    },
    [commit, service, officeId]
  )

  const registrarAjusteEstoque = useCallback(
    async (input: AjusteEstoqueInput) => {
      let anterior: Peca | undefined
      let atualizada: Peca | undefined
      commit((prev) => {
        anterior = prev.pecas.find((p) => p.id === input.peca_id)
        const next = service.registrarAjusteEstoque(prev, input)
        atualizada = next.pecas.find((p) => p.id === input.peca_id)
        return next
      })
      if (!atualizada) return { ok: false, remoto: false, pendente: false, erro: 'Peça não encontrada' }
      const resultado = await publicarPecaAtualizada(officeId, atualizada, {
        quantidadeAnterior: anterior?.quantidade,
        incluirQuantidade: true,
      })
      agendarSincronizacaoEstoque(officeId)
      return resultado
    },
    [commit, service, officeId]
  )

  const value = useMemo(
    () => ({
      dados,
      oficinaId: officeId,
      carregandoRemoto,
      sincronizandoEmBackground,
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
      sincronizandoEmBackground,
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
        <p className="text-sm text-muted-foreground">Preparando dados da oficina...</p>
        <p className="mt-2 text-xs text-muted-foreground/80">
          Se demorar, o app abre com os dados locais automaticamente.
        </p>
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
        <p className="text-sm text-muted-foreground">Verificando sessão...</p>
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
        <AutorizacaoValoresProvider>
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
        </AutorizacaoValoresProvider>
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
      clientes: filtrarEntidadesAtivas(filtrarPorOffice(fonte.clientes, oficinaId)),
      motos: filtrarEntidadesAtivas(filtrarPorOffice(fonte.motos, oficinaId)),
      ordens: filtrarPorOffice(fonte.ordens_servico, oficinaId),
      pecas: filtrarEntidadesAtivas(filtrarPorOffice(fonte.pecas, oficinaId)),
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
