import { useAuth } from '@/context/AuthContext'
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
import { AssinaturaProvider } from '@/context/AssinaturaContext'
import { CraftDataService } from '@/services/craft-data.service'
import { createCraftRepository } from '@/services/repository/repository.factory'
import { filtrarPorOffice } from '@/services/analytics.service'
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
} from '@/types'

interface CraftContextValue {
  dados: CraftDatabase
  oficinaId: string
  adicionarCliente: (cliente: ClienteInput) => Cliente
  atualizarCliente: (id: string, cliente: Partial<Cliente>) => void
  excluirCliente: (id: string) => void
  adicionarMoto: (moto: MotoInput) => Moto
  atualizarMoto: (id: string, moto: Partial<Moto>) => void
  excluirMoto: (id: string) => void
  adicionarOS: (os: OrdemServicoInput) => OrdemServico
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
  adicionarModeloChecklist: (modelo: ModeloChecklistInput) => ModeloChecklist
  atualizarModeloChecklist: (id: string, modelo: Partial<ModeloChecklist>) => void
  excluirModeloChecklist: (id: string) => void
  definirModeloPadraoChecklist: (id: string) => void
  adicionarServicoCatalogo: (servico: ServicoCatalogoInput) => ServicoCatalogo
  atualizarServicoCatalogo: (id: string, servico: Partial<ServicoCatalogo>) => void
  excluirServicoCatalogo: (id: string) => void
  resetarDados: () => void
}

const CraftContext = createContext<CraftContextValue | null>(null)

interface CraftProviderProps {
  children: ReactNode
  officeId: string
}

export function CraftProvider({ children, officeId }: CraftProviderProps) {
  const service = useMemo(
    () => new CraftDataService(createCraftRepository(), officeId),
    [officeId]
  )

  const [dados, setDados] = useState<CraftDatabase>(() => service.carregar())

  useEffect(() => {
    setDados(service.carregar())
  }, [service])

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
    (os: OrdemServicoInput) => {
      let entity!: OrdemServico
      commit((prev) => {
        const result = service.adicionarOS(prev, os)
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

  const resetarDados = useCallback(() => {
    const fresh = service.resetar()
    setDados(fresh)
  }, [service])

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

  const value = useMemo(
    () => ({
      dados,
      oficinaId: officeId,
      adicionarCliente,
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
      adicionarModeloChecklist,
      atualizarModeloChecklist,
      excluirModeloChecklist,
      definirModeloPadraoChecklist,
      adicionarServicoCatalogo,
      atualizarServicoCatalogo,
      excluirServicoCatalogo,
      resetarDados,
    }),
    [
      dados,
      officeId,
      adicionarCliente,
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
      adicionarModeloChecklist,
      atualizarModeloChecklist,
      excluirModeloChecklist,
      definirModeloPadraoChecklist,
      adicionarServicoCatalogo,
      atualizarServicoCatalogo,
      excluirServicoCatalogo,
      resetarDados,
    ]
  )

  return <CraftContext.Provider value={value}>{children}</CraftContext.Provider>
}

export function CraftProviderWrapper() {
  const { session } = useAuth()
  if (!session) return null
  return (
    <CraftProvider officeId={session.user.office_id}>
      <AssinaturaProvider>
        <ComunicacaoProvider>
          <LembretesProvider>
            <Outlet />
          </LembretesProvider>
        </ComunicacaoProvider>
      </AssinaturaProvider>
    </CraftProvider>
  )
}

export function useCraft() {
  const ctx = useContext(CraftContext)
  if (!ctx) throw new Error('useCraft deve ser usado dentro de CraftProvider')
  return ctx
}

export function useOficinaData() {
  const { dados, oficinaId } = useCraft()
  return useMemo(
    () => ({
      clientes: filtrarPorOffice(dados.clientes, oficinaId),
      motos: filtrarPorOffice(dados.motos, oficinaId),
      ordens: filtrarPorOffice(dados.ordens_servico, oficinaId),
      pecas: filtrarPorOffice(dados.pecas, oficinaId),
      lancamentos: filtrarPorOffice(dados.lancamentos, oficinaId),
      agendamentos: filtrarPorOffice(dados.agendamentos, oficinaId),
      modelosChecklist: filtrarPorOffice(dados.modelos_checklist ?? [], oficinaId),
      servicosCatalogo: filtrarPorOffice(dados.servicos_catalogo ?? [], oficinaId),
      configuracao: dados.configuracao,
    }),
    [dados, oficinaId]
  )
}
