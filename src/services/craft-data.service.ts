import type { Agendamento, AgendamentoInput } from '@/types/agendamento'
import type { ModeloChecklist, ModeloChecklistInput } from '@/types/checklist-modelo'
import type { Cliente, ClienteInput } from '@/types/cliente'
import type { CraftDatabase } from '@/types/database'
import type { LancamentoFinanceiro, LancamentoFinanceiroInput } from '@/types/financeiro'
import type { Moto, MotoInput } from '@/types/moto'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { OrdemServico, OrdemServicoInput } from '@/types/ordem-servico'
import type { Peca, PecaInput } from '@/types/peca'
import { OFFICE_ID } from '@/types/base'
import { gerarId } from '@/lib/utils'
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
import { createCraftRepository } from '@/services/repository/repository.factory'
import type { ICraftRepository } from '@/services/repository/types'

export class CraftDataService {
  private repository: ICraftRepository
  private officeId: string

  constructor(
    repository: ICraftRepository = createCraftRepository(),
    officeId: string = OFFICE_ID
  ) {
    this.repository = repository
    this.officeId = officeId
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
        criado_em: new Date().toISOString().slice(0, 10),
      },
      this.officeId
    )
    return { db: { ...db, clientes: [...db.clientes, entity] }, entity }
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
        criado_em: new Date().toISOString().slice(0, 10),
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
    input: OrdemServicoInput
  ): { db: CraftDatabase; entity: OrdemServico } {
    const entity = buildNovaOrdemServico(
      input,
      db.proximo_numero_os,
      db.modelos_checklist,
      this.officeId
    )
    let motos = db.motos
    if (deveAtualizarKmMoto(entity)) {
      motos = motos.map((m) =>
        m.id === entity.moto_id ? { ...m, quilometragem: entity.quilometragem_saida! } : m
      )
    }
    return {
      db: {
        ...db,
        ordens_servico: [...db.ordens_servico, entity],
        motos,
        proximo_numero_os: db.proximo_numero_os + 1,
      },
      entity,
    }
  }

  atualizarOS(db: CraftDatabase, id: string, patch: Partial<OrdemServico>): CraftDatabase {
    let motoIdAtualizar: string | null = null
    let novaKm: number | null = null

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

    return { ...db, ordens_servico: ordens, motos }
  }

  excluirOS(db: CraftDatabase, id: string): CraftDatabase {
    return { ...db, ordens_servico: db.ordens_servico.filter((o) => o.id !== id) }
  }

  adicionarPeca(db: CraftDatabase, input: PecaInput): { db: CraftDatabase; entity: Peca } {
    const entity = stampCreate(
      { ...input, id: gerarId(), oficina_id: this.officeId, office_id: this.officeId },
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
    const entity = stampCreate(
      { ...input, id: gerarId(), oficina_id: this.officeId, office_id: this.officeId },
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
}

export const craftDataService = new CraftDataService()
