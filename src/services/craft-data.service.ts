import type { Agendamento, AgendamentoInput } from '@/types/agendamento'
import type { ModeloChecklist, ModeloChecklistInput } from '@/types/checklist-modelo'
import type { Cliente, ClienteInput } from '@/types/cliente'
import { marcarPagamentoExcluido } from '@/services/pagamentos/payment-active.helpers'
import type { CraftDatabase } from '@/types/database'
import type { LancamentoFinanceiro, LancamentoFinanceiroInput } from '@/types/financeiro'
import type { Moto, MotoInput } from '@/types/moto'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { OrdemServico, OrdemServicoInput } from '@/types/ordem-servico'
import type { Peca, PecaInput } from '@/types/peca'
import type { ServicoCatalogo, ServicoCatalogoInput } from '@/types/servico-catalogo'
import { getDataLocalHoje } from '@/lib/data-local'
import {
  numeroOsJaExiste,
  resolverProximoNumeroOsDisponivel,
  sincronizarProximoNumeroOsNoDatabase,
} from '@/services/os-numbering.service'
import type { PerfilComissaoFuncionario, PerfilComissaoFuncionarioInput } from '@/types/comissoes'
import { normalizarComissoesConfig } from '@/types/comissoes'
import { gerarId } from '@/lib/utils'
import { OFFICE_ID } from '@/types/base'
import { stampCreate, stampUpdate } from '@/services/migration.service'
import {
  buildNovaOrdemServico,
  deveAtualizarKmMoto,
  mergeOrdemServico,
} from '@/services/ordem-servico.service'
import {
  buildNovoModeloChecklist,
  definirModeloPadraoLista,
  mergeModeloChecklist,
  podeExcluirModeloChecklist,
} from '@/services/checklist-modelo.service'
import {
  processarEstoqueAoSalvarOS,
  registrarAjusteEstoque,
  registrarDevolucaoOS,
  registrarEntradaEstoque,
  normalizarPeca,
} from '@/services/estoque.service'
import { normalizarServicoCatalogo } from '@/services/servico-catalogo.service'
import type { UsuarioMovimentacao } from '@/types/movimentacao-estoque'
import type { Fornecedor, FornecedorInput } from '@/types/fornecedor'
import type { AjusteEstoqueInput, EntradaEstoqueInput } from '@/types/movimentacao-estoque'
import { createCraftRepository } from '@/services/repository/repository.factory'
import type { ICraftRepository } from '@/services/repository/types'

export class CraftDataService {
  private repository: ICraftRepository
  private officeId: string
  private usuario: UsuarioMovimentacao = {}

  constructor(
    repository: ICraftRepository = createCraftRepository(),
    officeId: string = OFFICE_ID
  ) {
    this.repository = repository
    this.officeId = officeId
  }

  setUsuario(usuario: UsuarioMovimentacao) {
    this.usuario = usuario
  }

  carregar(): CraftDatabase {
    return this.repository.carregar(this.officeId)
  }

  salvar(dados: CraftDatabase): void {
    this.repository.salvar(this.officeId, dados)
  }

  resetar(): CraftDatabase {
    return this.repository.resetar(this.officeId)
  }

  adicionarCliente(
    db: CraftDatabase,
    input: ClienteInput
  ): { db: CraftDatabase; entity: Cliente } {
    const entity = stampCreate(
      {
        ...input,
        id: gerarId(),
        oficina_id: this.officeId,
        office_id: this.officeId,
        criado_em: getDataLocalHoje(),
      },
      this.officeId
    )
    return { db: { ...db, clientes: [...db.clientes, entity] }, entity }
  }

  adicionarClienteComMotoOpcional(
    db: CraftDatabase,
    clienteInput: ClienteInput,
    motoInput: MotoInput | null
  ): { db: CraftDatabase; cliente: Cliente; moto?: Moto } {
    const { db: comCliente, entity: cliente } = this.adicionarCliente(db, clienteInput)
    if (!motoInput) {
      return { db: comCliente, cliente }
    }
    const { db: comMoto, entity: moto } = this.adicionarMoto(comCliente, {
      ...motoInput,
      cliente_id: cliente.id,
    })
    return { db: comMoto, cliente, moto }
  }

  atualizarCliente(db: CraftDatabase, id: string, patch: Partial<Cliente>): CraftDatabase {
    return {
      ...db,
      clientes: db.clientes.map((c) =>
        c.id === id ? stampUpdate({ ...c, ...patch }) : c
      ),
    }
  }

  excluirCliente(db: CraftDatabase, id: string): CraftDatabase {
    return {
      ...db,
      clientes: db.clientes.filter((c) => c.id !== id),
      motos: db.motos.filter((m) => m.cliente_id !== id),
    }
  }

  adicionarMoto(db: CraftDatabase, input: MotoInput): { db: CraftDatabase; entity: Moto } {
    const entity = stampCreate(
      {
        ...input,
        id: gerarId(),
        oficina_id: this.officeId,
        office_id: this.officeId,
        criado_em: getDataLocalHoje(),
      },
      this.officeId
    )
    return { db: { ...db, motos: [...db.motos, entity] }, entity }
  }

  atualizarMoto(db: CraftDatabase, id: string, patch: Partial<Moto>): CraftDatabase {
    return {
      ...db,
      motos: db.motos.map((m) => (m.id === id ? stampUpdate({ ...m, ...patch }) : m)),
    }
  }

  excluirMoto(db: CraftDatabase, id: string): CraftDatabase {
    return { ...db, motos: db.motos.filter((m) => m.id !== id) }
  }

  adicionarOS(
    db: CraftDatabase,
    input: OrdemServicoInput,
    opcoes?: { numero?: number }
  ): { db: CraftDatabase; entity: OrdemServico } {
    const dbBase = sincronizarProximoNumeroOsNoDatabase(db)
    let numero = opcoes?.numero ?? resolverProximoNumeroOsDisponivel(dbBase)
    if (numeroOsJaExiste(dbBase.ordens_servico, numero)) {
      console.warn('[Craft OS] Número duplicado bloqueado antes de salvar — ajustando', { numero })
      numero = resolverProximoNumeroOsDisponivel(dbBase)
    }
    const entity = buildNovaOrdemServico(
      input,
      numero,
      dbBase.modelos_checklist,
      this.officeId
    )
    let motos = db.motos
    if (deveAtualizarKmMoto(entity)) {
      motos = motos.map((m) =>
        m.id === entity.moto_id ? { ...m, quilometragem: entity.quilometragem_saida! } : m
      )
    }
    let nextDb: CraftDatabase = {
      ...dbBase,
      ordens_servico: [...dbBase.ordens_servico, entity],
      motos,
      proximo_numero_os: Math.max(dbBase.proximo_numero_os, numero + 1),
    }
    nextDb = sincronizarProximoNumeroOsNoDatabase(nextDb)
    nextDb = processarEstoqueAoSalvarOS(nextDb, entity, undefined, this.usuario, this.officeId)
    const entityFinal = nextDb.ordens_servico.find((o) => o.id === entity.id) ?? entity
    return { db: nextDb, entity: entityFinal }
  }

  atualizarOS(db: CraftDatabase, id: string, patch: Partial<OrdemServico>): CraftDatabase {
    let motoIdAtualizar: string | null = null
    let novaKm: number | null = null
    const osAnterior = db.ordens_servico.find((o) => o.id === id)

    const ordens = db.ordens_servico.map((o) => {
      if (o.id !== id) return o
      const atualizada = mergeOrdemServico(o, patch, db.modelos_checklist)
      if (deveAtualizarKmMoto(atualizada)) {
        motoIdAtualizar = atualizada.moto_id
        novaKm = atualizada.quilometragem_saida!
      }
      return atualizada
    })

    const motos =
      motoIdAtualizar && novaKm !== null
        ? db.motos.map((m) => (m.id === motoIdAtualizar ? { ...m, quilometragem: novaKm! } : m))
        : db.motos

    let nextDb: CraftDatabase = { ...db, ordens_servico: ordens, motos }
    const osAtualizada = ordens.find((o) => o.id === id)
    if (osAtualizada) {
      nextDb = processarEstoqueAoSalvarOS(nextDb, osAtualizada, osAnterior, this.usuario, this.officeId)
    }
    return nextDb
  }

  excluirOS(db: CraftDatabase, id: string): CraftDatabase {
    const os = db.ordens_servico.find((o) => o.id === id)
    let nextDb = db
    if (os?.estoque_baixado) {
      nextDb = registrarDevolucaoOS(db, os, this.usuario, this.officeId)
    }
    return {
      ...nextDb,
      ordens_servico: nextDb.ordens_servico.filter((o) => o.id !== id),
    }
  }

  adicionarPeca(db: CraftDatabase, input: PecaInput): { db: CraftDatabase; entity: Peca } {
    const entity = stampCreate(
      normalizarPeca({
        ...input,
        id: gerarId(),
        oficina_id: this.officeId,
        office_id: this.officeId,
        ativo: input.ativo ?? true,
        categoria: input.categoria ?? 'outros',
      }),
      this.officeId
    )
    return { db: { ...db, pecas: [...db.pecas, entity] }, entity }
  }

  atualizarPeca(db: CraftDatabase, id: string, patch: Partial<Peca>): CraftDatabase {
    return {
      ...db,
      pecas: db.pecas.map((p) => (p.id === id ? stampUpdate({ ...p, ...patch }) : p)),
    }
  }

  excluirPeca(db: CraftDatabase, id: string): CraftDatabase {
    return { ...db, pecas: db.pecas.filter((p) => p.id !== id) }
  }

  adicionarLancamento(
    db: CraftDatabase,
    input: LancamentoFinanceiroInput
  ): { db: CraftDatabase; entity: LancamentoFinanceiro } {
    const id = gerarId()
    const entity = stampCreate(
      {
        ...input,
        id,
        client_payment_id: id,
        oficina_id: this.officeId,
        office_id: this.officeId,
        sync_pendente: input.sync_pendente ?? false,
      },
      this.officeId
    )
    return { db: { ...db, lancamentos: [...db.lancamentos, entity] }, entity }
  }

  atualizarLancamento(
    db: CraftDatabase,
    id: string,
    patch: Partial<LancamentoFinanceiro>
  ): CraftDatabase {
    return {
      ...db,
      lancamentos: db.lancamentos.map((l) =>
        l.id === id ? stampUpdate({ ...l, ...patch }) : l
      ),
    }
  }

  excluirLancamento(db: CraftDatabase, id: string): CraftDatabase {
    const lancamento = db.lancamentos.find((l) => l.id === id)
    if (lancamento?.ordem_servico_id) {
      return {
        ...db,
        lancamentos: db.lancamentos.map((l) =>
          l.id === id ? marcarPagamentoExcluido(l) : l
        ),
      }
    }
    return { ...db, lancamentos: db.lancamentos.filter((l) => l.id !== id) }
  }

  adicionarAgendamento(
    db: CraftDatabase,
    input: AgendamentoInput
  ): { db: CraftDatabase; entity: Agendamento } {
    const entity = stampCreate(
      { ...input, id: gerarId(), oficina_id: this.officeId, office_id: this.officeId },
      this.officeId
    )
    return { db: { ...db, agendamentos: [...db.agendamentos, entity] }, entity }
  }

  atualizarAgendamento(
    db: CraftDatabase,
    id: string,
    patch: Partial<Agendamento>
  ): CraftDatabase {
    return {
      ...db,
      agendamentos: db.agendamentos.map((a) =>
        a.id === id ? stampUpdate({ ...a, ...patch }) : a
      ),
    }
  }

  excluirAgendamento(db: CraftDatabase, id: string): CraftDatabase {
    return { ...db, agendamentos: db.agendamentos.filter((a) => a.id !== id) }
  }

  atualizarConfiguracao(db: CraftDatabase, patch: Partial<ConfiguracaoOficina>): CraftDatabase {
    return {
      ...db,
      configuracao: stampUpdate({ ...db.configuracao, ...patch }),
    }
  }

  adicionarModeloChecklist(
    db: CraftDatabase,
    input: ModeloChecklistInput
  ): { db: CraftDatabase; entity: ModeloChecklist } {
    const entity = buildNovoModeloChecklist(input, this.officeId)
    const modelos = input.padrao
      ? definirModeloPadraoLista(db.modelos_checklist, entity.id)
      : db.modelos_checklist
    return {
      db: { ...db, modelos_checklist: [...modelos, entity] },
      entity,
    }
  }

  atualizarModeloChecklist(
    db: CraftDatabase,
    id: string,
    patch: Partial<ModeloChecklist>
  ): CraftDatabase {
    let modelos = db.modelos_checklist.map((m) =>
      m.id === id ? mergeModeloChecklist(m, patch) : m
    )
    if (patch.padrao) {
      modelos = definirModeloPadraoLista(modelos, id)
    }
    return { ...db, modelos_checklist: modelos }
  }

  excluirModeloChecklist(db: CraftDatabase, id: string): CraftDatabase {
    const modelo = db.modelos_checklist.find((m) => m.id === id)
    if (!modelo || !podeExcluirModeloChecklist(modelo)) return db
    return {
      ...db,
      modelos_checklist: db.modelos_checklist.filter((m) => m.id !== id),
    }
  }

  definirModeloPadraoChecklist(db: CraftDatabase, id: string): CraftDatabase {
    return {
      ...db,
      modelos_checklist: definirModeloPadraoLista(db.modelos_checklist, id),
    }
  }

  adicionarServicoCatalogo(
    db: CraftDatabase,
    input: ServicoCatalogoInput
  ): { db: CraftDatabase; entity: ServicoCatalogo } {
    const entity = stampCreate(
      normalizarServicoCatalogo(
        {
          ...input,
          id: gerarId(),
          oficina_id: this.officeId,
          office_id: this.officeId,
          pecas_sugeridas: input.pecas_sugeridas ?? [],
          ativo: input.ativo ?? true,
        },
        db.pecas
      ),
      this.officeId
    )
    return {
      db: { ...db, servicos_catalogo: [...(db.servicos_catalogo ?? []), entity] },
      entity,
    }
  }

  atualizarServicoCatalogo(
    db: CraftDatabase,
    id: string,
    patch: Partial<ServicoCatalogo>
  ): CraftDatabase {
    return {
      ...db,
      servicos_catalogo: (db.servicos_catalogo ?? []).map((s) =>
        s.id === id ? stampUpdate({ ...s, ...patch }) : s
      ),
    }
  }

  excluirServicoCatalogo(db: CraftDatabase, id: string): CraftDatabase {
    return {
      ...db,
      servicos_catalogo: (db.servicos_catalogo ?? []).filter((s) => s.id !== id),
    }
  }

  adicionarFornecedor(
    db: CraftDatabase,
    input: FornecedorInput
  ): { db: CraftDatabase; entity: Fornecedor } {
    const entity = stampCreate(
      {
        ...input,
        id: gerarId(),
        oficina_id: this.officeId,
        office_id: this.officeId,
        ativo: input.ativo ?? true,
      },
      this.officeId
    )
    return {
      db: { ...db, fornecedores: [...(db.fornecedores ?? []), entity] },
      entity,
    }
  }

  atualizarFornecedor(db: CraftDatabase, id: string, patch: Partial<Fornecedor>): CraftDatabase {
    return {
      ...db,
      fornecedores: (db.fornecedores ?? []).map((f) =>
        f.id === id ? stampUpdate({ ...f, ...patch }) : f
      ),
    }
  }

  excluirFornecedor(db: CraftDatabase, id: string): CraftDatabase {
    return {
      ...db,
      fornecedores: (db.fornecedores ?? []).filter((f) => f.id !== id),
    }
  }

  registrarEntradaEstoque(db: CraftDatabase, input: EntradaEstoqueInput): CraftDatabase {
    return registrarEntradaEstoque(db, input, this.usuario, this.officeId)
  }

  registrarAjusteEstoque(db: CraftDatabase, input: AjusteEstoqueInput): CraftDatabase {
    return registrarAjusteEstoque(db, input, this.usuario, this.officeId)
  }

  salvarPerfilComissao(
    db: CraftDatabase,
    input: PerfilComissaoFuncionarioInput & { id?: string }
  ): { db: CraftDatabase; entity: PerfilComissaoFuncionario } {
    const existente = input.id
      ? (db.perfis_comissao ?? []).find((p) => p.id === input.id)
      : undefined

    const entity = stampUpdate(
      stampCreate(
        {
          ...input,
          id: existente?.id ?? gerarId(),
          oficina_id: this.officeId,
          office_id: this.officeId,
          salario_fixo_mensal: Math.max(0, input.salario_fixo_mensal ?? 0),
          comissao_ativa: input.comissao_ativa ?? false,
          tipo_comissao: input.tipo_comissao ?? 'sem_comissao',
        },
        this.officeId
      )
    )

    const lista = db.perfis_comissao ?? []
    const perfis = existente
      ? lista.map((p) => (p.id === entity.id ? entity : p))
      : [...lista, entity]

    return { db: { ...db, perfis_comissao: perfis }, entity }
  }

  excluirPerfilComissao(db: CraftDatabase, id: string): CraftDatabase {
    return {
      ...db,
      perfis_comissao: (db.perfis_comissao ?? []).filter((p) => p.id !== id),
    }
  }

  atualizarComissoesConfig(
    db: CraftDatabase,
    patch: Partial<import('@/types/comissoes').ComissoesConfigOficina>
  ): CraftDatabase {
    const atual = normalizarComissoesConfig(db.configuracao.comissoes_config)
    return {
      ...db,
      configuracao: stampUpdate({
        ...db.configuracao,
        comissoes_config: normalizarComissoesConfig({ ...atual, ...patch }),
      }),
    }
  }
}

export const craftDataService = new CraftDataService()
