import type { CraftDatabase } from '@/types/database'
import type { OrdemServico } from '@/types/ordem-servico'
import {
  auditarNumeracaoOs,
  detectarNumerosOsDuplicados,
  type AuditoriaNumeracaoOs,
} from '@/services/os-numbering.service'
import { calcularResumoFinanceiroOS } from '@/services/os-financeiro.service'
import { listarPagamentosPorVinculoId } from '@/services/pagamentos/payment-os-audit.service'

export interface LinhaOsAuditoriaNumeracao {
  os: OrdemServico
  clienteNome: string
  motoLabel: string
  totalOs: number
  qtdPagamentos: number
  totalPagamentos: number
}

export interface ResultadoBuscaAuditoriaOs {
  auditoria: AuditoriaNumeracaoOs
  linhas: LinhaOsAuditoriaNumeracao[]
}

function montarLinha(
  os: OrdemServico,
  dados: CraftDatabase
): LinhaOsAuditoriaNumeracao {
  const cliente = dados.clientes.find((c) => c.id === os.cliente_id)
  const moto = dados.motos.find((m) => m.id === os.moto_id)
  const resumo = calcularResumoFinanceiroOS(os, dados.lancamentos)
  const pagamentos = listarPagamentosPorVinculoId(os.id, dados.lancamentos)
  const totalPagamentos = pagamentos.filter((p) => p.pago).reduce((a, p) => a + p.valor, 0)

  return {
    os,
    clienteNome: cliente?.nome ?? '—',
    motoLabel: moto ? `${moto.marca} ${moto.modelo} (${moto.placa})` : '—',
    totalOs: resumo.totalGeral,
    qtdPagamentos: pagamentos.length,
    totalPagamentos,
  }
}

export function auditarNumeracaoOsCompleta(dados: CraftDatabase): ResultadoBuscaAuditoriaOs {
  const auditoria = auditarNumeracaoOs(dados)
  const linhas = dados.ordens_servico
    .slice()
    .sort((a, b) => b.numero - a.numero)
    .map((os) => montarLinha(os, dados))

  return { auditoria, linhas }
}

export function buscarOsAuditoriaNumeracao(
  dados: CraftDatabase,
  termo: string
): LinhaOsAuditoriaNumeracao[] {
  const ref = termo.trim().toLowerCase()
  if (!ref) return []

  const porNumero = parseInt(ref.replace(/^#/, ''), 10)
  if (Number.isFinite(porNumero)) {
    const os = dados.ordens_servico.find((o) => o.numero === porNumero)
    return os ? [montarLinha(os, dados)] : []
  }

  return dados.ordens_servico
    .filter((os) => {
      const cliente = dados.clientes.find((c) => c.id === os.cliente_id)
      const moto = dados.motos.find((m) => m.id === os.moto_id)
      const texto = [
        cliente?.nome ?? '',
        moto?.marca ?? '',
        moto?.modelo ?? '',
        moto?.placa ?? '',
        os.id,
      ]
        .join(' ')
        .toLowerCase()
      return texto.includes(ref)
    })
    .sort((a, b) => b.numero - a.numero)
    .map((os) => montarLinha(os, dados))
}

export function listarLinhasOsDuplicadas(dados: CraftDatabase): LinhaOsAuditoriaNumeracao[] {
  const grupos = detectarNumerosOsDuplicados(dados.ordens_servico)
  return grupos.flatMap((g) => g.ordens.map((os) => montarLinha(os, dados)))
}
