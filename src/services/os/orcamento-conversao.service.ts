import { getCraftPersistenceMode } from '@/lib/supabase'
import { buildNovaOSInputFromOrcamento } from '@/lib/os-modo-documento'
import { patchOrcamentoAposConversao, tituloEventoConversaoOrcamento, tituloEventoOsDeOrcamento } from '@/lib/orcamento-vinculo'
import {
  criarEventoHistoricoOS,
  mesclarHistoricoEventos,
} from '@/services/os-historico.service'
import { MSG } from '@/lib/mensagens-usuario'
import { CraftDataService } from '@/services/craft-data.service'
import { reservarProximoNumeroOsSupabase } from '@/services/os-numbering-rpc.service'
import { createCraftRepository } from '@/services/repository/repository.factory'
import { localCraftRepository } from '@/services/repository/local.repository'
import {
  finalizarOperacaoSalvamentoExplicito,
  iniciarOperacaoSalvamentoExplicito,
} from '@/services/supabase-sync/persistencia-opcoes'
import { salvarOsComConfirmacaoSupabase } from '@/services/supabase-sync/service-order-save.service'
import type { CraftDatabase } from '@/types/database'
import type { OrdemServico } from '@/types/ordem-servico'

export interface ConverterOrcamentoEmOSOpcoes {
  officeId: string
  responsavel?: string
}

export interface ResultadoConverterOrcamentoEmOS {
  novaOs: OrdemServico
  orcamentoAtualizado: OrdemServico
  db: CraftDatabase
}

export function aplicarConversaoOrcamentoEmDatabase(
  service: CraftDataService,
  db: CraftDatabase,
  orcamento: OrdemServico,
  opcoes?: { numeroOs?: number; responsavel?: string }
): ResultadoConverterOrcamentoEmOS {
  const convertidoEm = new Date().toISOString()
  const input = buildNovaOSInputFromOrcamento(orcamento)
  if (opcoes?.responsavel?.trim()) {
    input.responsavel = opcoes.responsavel.trim()
  }

  const { db: dbComNova, entity: novaOs } = service.adicionarOS(
    db,
    input,
    opcoes?.numeroOs != null ? { numero: opcoes.numeroOs } : undefined
  )

  const patch = patchOrcamentoAposConversao(orcamento, novaOs, {
    responsavel: opcoes?.responsavel,
    convertidoEm,
  })
  const eventoOrcamento = criarEventoHistoricoOS({
    tipo: 'conversao_orcamento',
    titulo: tituloEventoConversaoOrcamento(orcamento.numero, novaOs.numero),
    usuario_nome: opcoes?.responsavel,
    data_hora: convertidoEm,
    detalhe: `Orçamento convertido por ${opcoes?.responsavel?.trim() || 'usuário'}`,
  })
  let dbFinal = service.atualizarOS(dbComNova, orcamento.id, {
    ...patch,
    historico_eventos: mesclarHistoricoEventos(orcamento.historico_eventos, [eventoOrcamento]),
  })

  const eventoNovaOs = criarEventoHistoricoOS({
    tipo: 'os_de_orcamento',
    titulo: tituloEventoOsDeOrcamento(novaOs.numero, orcamento.numero),
    usuario_nome: opcoes?.responsavel,
    data_hora: convertidoEm,
    detalhe: orcamento.criado_por_nome
      ? `Orçamento original aberto por ${orcamento.criado_por_nome}`
      : undefined,
  })
  dbFinal = service.atualizarOS(dbFinal, novaOs.id, {
    historico_eventos: mesclarHistoricoEventos(novaOs.historico_eventos, [eventoNovaOs]),
  })

  const orcamentoAtualizado = dbFinal.ordens_servico.find((o) => o.id === orcamento.id)
  const novaOsFinal = dbFinal.ordens_servico.find((o) => o.id === novaOs.id)

  if (!orcamentoAtualizado || !novaOsFinal) {
    throw new Error(MSG.erroSalvar)
  }

  return {
    novaOs: novaOsFinal,
    orcamentoAtualizado,
    db: dbFinal,
  }
}

export async function converterOrcamentoEmOSComSync(
  orcamento: OrdemServico,
  opcoes: ConverterOrcamentoEmOSOpcoes
): Promise<ResultadoConverterOrcamentoEmOS> {
  const service = new CraftDataService(createCraftRepository(), opcoes.officeId)
  const db = localCraftRepository.carregar(opcoes.officeId)
  const modoSupabase = getCraftPersistenceMode() === 'supabase'
  const online = typeof navigator !== 'undefined' && navigator.onLine

  iniciarOperacaoSalvamentoExplicito()
  try {
    let numeroReservado: number | undefined
    if (modoSupabase && online) {
      numeroReservado = await reservarProximoNumeroOsSupabase(opcoes.officeId)
    }

    const resultado = aplicarConversaoOrcamentoEmDatabase(service, db, orcamento, {
      numeroOs: numeroReservado,
      responsavel: opcoes.responsavel,
    })

    if (modoSupabase && online) {
      const resultadoNova = await salvarOsComConfirmacaoSupabase(
        opcoes.officeId,
        resultado.novaOs,
        resultado.db,
        { eraNova: true }
      )
      if (!resultadoNova.ok) {
        throw new Error(resultadoNova.mensagem || MSG.erroSalvar)
      }

      const resultadoOrcamento = await salvarOsComConfirmacaoSupabase(
        opcoes.officeId,
        resultado.orcamentoAtualizado,
        resultado.db
      )
      if (!resultadoOrcamento.ok) {
        throw new Error(resultadoOrcamento.mensagem || MSG.erroSalvar)
      }
    }

    return resultado
  } finally {
    finalizarOperacaoSalvamentoExplicito()
  }
}
