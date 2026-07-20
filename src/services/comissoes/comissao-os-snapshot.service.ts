import { calcularComissaoBase, type RegraComissao } from '@/services/comissoes/comissoes.service'
import type {
  ComissaoRegraSnapshotOS,
  LinhaComissaoOSPreparada,
  PerfilComissaoFuncionario,
} from '@/types/comissoes'
import type { OrdemServico } from '@/types/ordem-servico'

function normalizarNome(valor: string | undefined | null): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

/** Encontra o perfil de comissão do responsável da OS (por id, depois por nome). */
export function encontrarPerfilResponsavel(
  perfis: PerfilComissaoFuncionario[],
  responsavelId?: string,
  responsavelNome?: string
): PerfilComissaoFuncionario | undefined {
  const id = responsavelId?.trim()
  if (id) {
    const porId = perfis.find((p) => p.usuario_id?.trim() === id)
    if (porId) return porId
  }
  const nome = normalizarNome(responsavelNome)
  if (nome) {
    const porNome = perfis.find((p) => normalizarNome(p.nome) === nome)
    if (porNome) return porNome
  }
  return undefined
}

function regraDoPerfil(perfil: PerfilComissaoFuncionario): RegraComissao {
  return {
    comissao_ativa: perfil.comissao_ativa,
    tipo_comissao: perfil.tipo_comissao,
    percentual_comissao: perfil.percentual_comissao,
    percentual_comissao_pecas: perfil.percentual_comissao_pecas,
    valor_fixo_por_os: perfil.valor_fixo_por_os,
  }
}

function regraDoSnapshot(snapshot: ComissaoRegraSnapshotOS): RegraComissao {
  return {
    comissao_ativa: true,
    tipo_comissao: snapshot.tipo_comissao,
    percentual_comissao: snapshot.percentual_mao_obra,
    percentual_comissao_pecas: snapshot.percentual_pecas,
    valor_fixo_por_os: snapshot.valor_fixo_os,
  }
}

interface OsParaSnapshot {
  responsavel_id?: string
  responsavel?: string
  valor_mao_obra?: number
  valor_pecas?: number
  comissao_snapshot?: ComissaoRegraSnapshotOS
}

function mesmoResponsavel(a: OsParaSnapshot | null | undefined, b: OsParaSnapshot): boolean {
  const idA = a?.responsavel_id?.trim() ?? ''
  const idB = b.responsavel_id?.trim() ?? ''
  if (idA || idB) return idA === idB
  return normalizarNome(a?.responsavel) === normalizarNome(b.responsavel)
}

/**
 * Resolve o snapshot de comissão a persistir na OS.
 *
 * Regras:
 * - Sem responsável ou sem perfil de comissão ativo → sem snapshot (undefined).
 * - Congela a regra (tipo + percentuais) na PRIMEIRA vez ou quando o responsável muda.
 * - Mudanças posteriores na configuração do funcionário NÃO alteram a regra congelada.
 * - Os valores (MO/peças/comissão) são recalculados com a base atual da OS e a regra congelada,
 *   preservando o histórico do percentual aplicado.
 */
export function resolverSnapshotComissaoOS(
  osNova: OsParaSnapshot,
  osAnterior: OsParaSnapshot | null,
  perfis: PerfilComissaoFuncionario[]
): ComissaoRegraSnapshotOS | undefined {
  const respId = osNova.responsavel_id?.trim()
  const respNome = osNova.responsavel?.trim()
  if (!respId && !respNome) return undefined

  const perfil = encontrarPerfilResponsavel(perfis, respId, respNome)
  if (!perfil || !perfil.comissao_ativa || perfil.tipo_comissao === 'sem_comissao') {
    return undefined
  }

  const snapAnterior = osAnterior?.comissao_snapshot
  const manterRegraCongelada = Boolean(snapAnterior) && mesmoResponsavel(osAnterior, osNova)

  const regra: RegraComissao =
    manterRegraCongelada && snapAnterior ? regraDoSnapshot(snapAnterior) : regraDoPerfil(perfil)

  const maoObra = osNova.valor_mao_obra ?? 0
  const pecas = osNova.valor_pecas ?? 0
  const { valor, base } = calcularComissaoBase({ maoObra, pecas }, regra)

  return {
    perfil_id: perfil.id,
    responsavel_id: respId,
    responsavel_nome: respNome,
    tipo_comissao: regra.tipo_comissao,
    percentual_mao_obra: regra.percentual_comissao,
    percentual_pecas: regra.percentual_comissao_pecas,
    valor_fixo_os: regra.valor_fixo_por_os,
    valor_mao_obra: maoObra,
    valor_pecas: pecas,
    valor_base: base,
    valor_comissao: valor,
    capturado_em:
      manterRegraCongelada && snapAnterior?.capturado_em
        ? snapAnterior.capturado_em
        : new Date().toISOString(),
  }
}

/**
 * Prepara as linhas de comissão por serviço (estrutura futura — sem pagamento).
 * Usa o responsável por serviço quando existir; senão o responsável da OS.
 * Distribui MO por serviço; peças no nível da OS (rateadas ao serviço quando houver 1 responsável).
 */
export function prepararLinhasComissaoOS(
  os: OrdemServico,
  perfis: PerfilComissaoFuncionario[]
): LinhaComissaoOSPreparada[] {
  const itens = os.servicos_itens ?? []
  if (itens.length === 0) {
    const perfil = encontrarPerfilResponsavel(perfis, os.responsavel_id, os.responsavel)
    const mo = os.valor_mao_obra ?? 0
    const pecas = os.valor_pecas ?? 0
    const regra = perfil ? regraDoPerfil(perfil) : undefined
    const calc = regra ? calcularComissaoBase({ maoObra: mo, pecas }, regra) : undefined
    return [
      {
        os_id: os.id,
        responsavel_id: os.responsavel_id,
        responsavel_nome: os.responsavel,
        tipo_comissao: perfil?.tipo_comissao,
        valor_mao_obra: mo,
        valor_pecas: pecas,
        percentual_mao_obra: perfil?.percentual_comissao,
        percentual_pecas: perfil?.percentual_comissao_pecas,
        valor_comissao_estimado: calc?.valor,
      },
    ]
  }

  return itens.map((item) => {
    const respId = item.responsavel_id ?? os.responsavel_id
    const respNome = item.responsavel_nome ?? os.responsavel
    const perfil = encontrarPerfilResponsavel(perfis, respId, respNome)
    const mo = item.valor_mao_obra ?? 0
    const regra = perfil ? regraDoPerfil(perfil) : undefined
    // Peças ficam no nível da OS; a linha por serviço estima só a MO do próprio serviço.
    const calc = regra ? calcularComissaoBase({ maoObra: mo, pecas: 0 }, regra) : undefined
    return {
      os_id: os.id,
      servico_item_id: item.id,
      servico_nome: item.nome,
      responsavel_id: respId,
      responsavel_nome: respNome,
      tipo_comissao: perfil?.tipo_comissao,
      valor_mao_obra: mo,
      percentual_mao_obra: perfil?.percentual_comissao,
      percentual_pecas: perfil?.percentual_comissao_pecas,
      valor_comissao_estimado: calc?.valor,
    }
  })
}
