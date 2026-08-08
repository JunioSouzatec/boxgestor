/**
 * F4A — validação fiscal de preparação (sem emissão, sem cálculo de imposto).
 */
import { entidadeFoiExcluida } from '@/lib/entidade-ativa'
import type { Cliente } from '@/types/cliente'
import {
  cadastroFiscalBasicoPreenchido,
  obterDadosFiscaisOficina,
  somenteDigitos,
  type DadosFiscaisOficina,
} from '@/types/fiscal'
import {
  obterDadosFiscaisCliente,
  somenteDigitos as digitosCliente,
  type DadosFiscaisCliente,
} from '@/types/fiscal-cliente'
import {
  obterDadosFiscaisProduto,
  somenteDigitosFiscal,
  type DadosFiscaisProduto,
} from '@/types/fiscal-produto'
import {
  DADOS_FISCAIS_SERVICO_VAZIO,
  descricaoFiscalServicoEfetiva,
  type DadosFiscaisServico,
} from '@/types/fiscal-servico'
import type {
  PendenciaFiscalItem,
  ResumoFiscalCentral,
} from '@/types/fiscal-preparacao'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { Peca } from '@/types/peca'

let seqPendencia = 0
function pend(
  escopo: PendenciaFiscalItem['escopo'],
  mensagem: string,
  opts?: { severidade?: PendenciaFiscalItem['severidade']; referencia?: string }
): PendenciaFiscalItem {
  seqPendencia += 1
  return {
    id: `pend-${seqPendencia}`,
    escopo,
    mensagem,
    severidade: opts?.severidade ?? 'bloqueante',
    referencia: opts?.referencia,
  }
}

export function resetSeqPendenciaFiscal() {
  seqPendencia = 0
}

export function validarOficinaParaPreparacao(
  oficina: DadosFiscaisOficina
): PendenciaFiscalItem[] {
  const out: PendenciaFiscalItem[] = []
  if (somenteDigitos(oficina.cnpj).length !== 14) {
    out.push(pend('oficina', 'Oficina sem CNPJ válido (14 dígitos).'))
  }
  if (!oficina.razao_social?.trim()) {
    out.push(pend('oficina', 'Oficina sem razão social.'))
  }
  if (!oficina.regime_tributario) {
    out.push(pend('oficina', 'Oficina sem regime tributário.'))
  }
  if (!oficina.endereco?.cidade?.trim()) {
    out.push(pend('oficina', 'Oficina sem cidade no endereço fiscal.'))
  }
  if (!oficina.endereco?.uf || oficina.endereco.uf.length !== 2) {
    out.push(pend('oficina', 'Oficina sem UF no endereço fiscal.'))
  }
  return out
}

export function validarClienteParaPreparacao(
  cliente: Cliente | null | undefined,
  consumidorNaoIdentificado: boolean
): { pendencias: PendenciaFiscalItem[]; ok: boolean; fiscal: DadosFiscaisCliente | null } {
  if (consumidorNaoIdentificado || !cliente) {
    return {
      pendencias: [
        pend(
          'cliente',
          'Consumidor não identificado. NFC-e futura pode exigir identificação conforme o caso — confirme com o contador.',
          { severidade: 'aviso' }
        ),
      ],
      ok: true,
      fiscal: null,
    }
  }

  const fiscal = obterDadosFiscaisCliente(cliente)
  const out: PendenciaFiscalItem[] = []
  const cpf = digitosCliente(fiscal.cpf)
  const cnpj = digitosCliente(fiscal.cnpj)
  const ehPj = fiscal.tipo_pessoa === 'juridica'

  if (ehPj) {
    if (cnpj.length !== 14) {
      out.push(pend('cliente', 'Cliente PJ sem CNPJ válido.', { referencia: cliente.nome }))
    }
  } else if (cpf.length !== 11 && cnpj.length !== 14) {
    out.push(
      pend('cliente', 'Cliente sem CPF/CNPJ fiscal.', { referencia: cliente.nome })
    )
  }

  if (!fiscal.endereco?.cidade?.trim()) {
    out.push(
      pend('cliente', 'Cliente sem cidade no endereço fiscal.', {
        severidade: 'aviso',
        referencia: cliente.nome,
      })
    )
  }
  if (!fiscal.endereco?.uf || fiscal.endereco.uf.length !== 2) {
    out.push(
      pend('cliente', 'Cliente sem UF no endereço fiscal.', {
        severidade: 'aviso',
        referencia: cliente.nome,
      })
    )
  }

  const bloqueantes = out.filter((p) => p.severidade === 'bloqueante')
  return { pendencias: out, ok: bloqueantes.length === 0, fiscal }
}

export function validarProdutoFiscalParaPreparacao(
  fiscal: DadosFiscaisProduto,
  nome: string,
  chave: string
): { pendencias: PendenciaFiscalItem[]; ok: boolean } {
  const out: PendenciaFiscalItem[] = []
  const desc = fiscal.descricao_fiscal?.trim() || nome.trim()
  if (!desc) {
    out.push(pend('produto', 'Produto sem descrição fiscal/nome.', { referencia: chave }))
  }
  if (somenteDigitosFiscal(fiscal.ncm).length !== 8) {
    out.push(pend('produto', `Produto sem NCM (8 dígitos): ${nome || chave}`, { referencia: chave }))
  }
  if (!fiscal.unidade_fiscal?.trim()) {
    out.push(
      pend('produto', `Produto sem unidade fiscal: ${nome || chave}`, { referencia: chave })
    )
  }
  if (!fiscal.origem_mercadoria?.trim()) {
    out.push(
      pend('produto', `Produto sem origem da mercadoria: ${nome || chave}`, {
        referencia: chave,
      })
    )
  }
  if (!fiscal.cfop_padrao_venda?.trim()) {
    out.push(
      pend('produto', `CFOP padrão de venda não preenchido: ${nome || chave}`, {
        severidade: 'aviso',
        referencia: chave,
      })
    )
  }
  if (!fiscal.cst_csosn?.trim()) {
    out.push(
      pend('produto', `CST/CSOSN não preenchido: ${nome || chave}`, {
        severidade: 'aviso',
        referencia: chave,
      })
    )
  }
  const bloqueantes = out.filter((p) => p.severidade === 'bloqueante')
  return { ok: bloqueantes.length === 0, pendencias: out }
}

export function validarServicoParaPreparacao(
  input: {
    nome: string
    valor: number
    chave: string
    fiscal?: DadosFiscaisServico
    descricao?: string
    manual?: boolean
    semCatalogo?: boolean
  }
): { ok: boolean; pendencias: PendenciaFiscalItem[] } {
  const { nome, valor, chave, fiscal, descricao, manual, semCatalogo } = input
  const out: PendenciaFiscalItem[] = []
  const f = fiscal ?? DADOS_FISCAIS_SERVICO_VAZIO
  const descEfetiva = descricaoFiscalServicoEfetiva(f, nome, descricao)

  if (!descEfetiva.trim()) {
    out.push(
      pend('servico', 'Serviço sem descrição fiscal/nome.', {
        referencia: chave,
      })
    )
  }

  if (!f.codigo_municipal_servico?.trim()) {
    out.push(
      pend(
        'servico',
        `Serviço sem código municipal do serviço: ${nome || chave}`,
        { referencia: chave }
      )
    )
  }

  if (!(valor > 0)) {
    out.push(
      pend('servico', `Serviço sem valor: ${nome || chave}`, {
        severidade: 'aviso',
        referencia: chave,
      })
    )
  }

  if (!f.item_lista_servico_lc116?.trim()) {
    out.push(
      pend('servico', `Serviço sem item da lista LC 116: ${nome || chave}`, {
        severidade: 'aviso',
        referencia: chave,
      })
    )
  }

  if (!f.codigo_tributacao_municipal?.trim()) {
    out.push(
      pend(
        'servico',
        `Serviço sem código de tributação municipal: ${nome || chave}`,
        { severidade: 'aviso', referencia: chave }
      )
    )
  }

  if (!f.municipio_prestacao_padrao?.trim()) {
    out.push(
      pend('servico', `Serviço sem município de prestação: ${nome || chave}`, {
        severidade: 'aviso',
        referencia: chave,
      })
    )
  }

  const exig = f.exigibilidade_iss
  if (!exig || exig === 'nao_informado') {
    out.push(
      pend('servico', `Serviço sem exigibilidade do ISS: ${nome || chave}`, {
        severidade: 'aviso',
        referencia: chave,
      })
    )
  }

  if (manual || semCatalogo) {
    out.push(
      pend(
        'servico',
        `Serviço manual / sem vínculo ao catálogo — complete os dados fiscais: ${nome || chave}`,
        { severidade: 'aviso', referencia: chave }
      )
    )
  }

  const bloqueantes = out.filter((p) => p.severidade === 'bloqueante')
  return { ok: bloqueantes.length === 0, pendencias: out }
}

export function montarResumoFiscalCentral(input: {
  configuracao?: ConfiguracaoOficina | null
  clientes: Cliente[]
  pecas: Peca[]
  pendenciasAmostra?: number
}): ResumoFiscalCentral {
  const oficina = obterDadosFiscaisOficina(input.configuracao)
  const clientesAtivos = input.clientes.filter((c) => !entidadeFoiExcluida(c))
  const pecasAtivas = input.pecas.filter((p) => !entidadeFoiExcluida(p) && p.ativo !== false)

  let clientesOk = 0
  for (const c of clientesAtivos) {
    const f = obterDadosFiscaisCliente(c)
    const cpf = digitosCliente(f.cpf)
    const cnpj = digitosCliente(f.cnpj)
    const cidade = Boolean(f.endereco?.cidade?.trim())
    const uf = Boolean(f.endereco?.uf && f.endereco.uf.length === 2)
    if ((cpf.length === 11 || cnpj.length === 14) && cidade && uf) clientesOk += 1
  }

  let produtosOk = 0
  for (const p of pecasAtivas) {
    const f = obterDadosFiscaisProduto(p)
    if (
      somenteDigitosFiscal(f.ncm).length === 8 &&
      f.unidade_fiscal?.trim() &&
      f.origem_mercadoria?.trim()
    ) {
      produtosOk += 1
    }
  }

  return {
    oficina_completa: cadastroFiscalBasicoPreenchido(oficina),
    clientes_basico_preenchido: clientesOk,
    clientes_total: clientesAtivos.length,
    produtos_basico_preenchido: produtosOk,
    produtos_total: pecasAtivas.length,
    pendencias_amostra: input.pendenciasAmostra ?? 0,
    emissao_ativa: false,
  }
}
