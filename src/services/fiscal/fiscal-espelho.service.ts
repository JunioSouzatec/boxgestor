/**
 * F4C — Espelho fiscal para conferência (NÃO é nota fiscal).
 * Somente leitura/HTML de impressão. Sem XML, DANFE, chave, numeração ou emissão.
 */
import { formatarDataBrasil, formatarDataHoraBrasil } from '@/lib/data-local'
import { formatarMoeda } from '@/lib/utils'
import {
  formatarCepExibicao,
  formatarCnpjExibicao,
  obterDadosFiscaisOficina,
  type DadosFiscaisOficina,
} from '@/types/fiscal'
import {
  formatarCpfExibicao,
  obterDadosFiscaisCliente,
  type DadosFiscaisCliente,
  INDICADORES_IE_CLIENTE,
} from '@/types/fiscal-cliente'
import { obterDadosFiscaisProduto } from '@/types/fiscal-produto'
import type { Cliente } from '@/types/cliente'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { Peca } from '@/types/peca'
import type { FiscalDraft } from '@/types/fiscal-draft'
import { labelStatusFiscalDraft } from '@/types/fiscal-draft'
import type {
  ItemProdutoPreparacao,
  ItemServicoPreparacao,
  PendenciaFiscalItem,
  PreparacaoNotaFiscal,
} from '@/types/fiscal-preparacao'
import { labelRegimeTributarioFiscal } from '@/services/fiscal/fiscal-format.helpers'

const MSG_POPUP =
  'Não foi possível abrir a impressão. Verifique se o navegador bloqueou pop-ups.'

export interface EspelhoFiscalContexto {
  preparacao: PreparacaoNotaFiscal
  configuracao?: ConfiguracaoOficina | null
  cliente?: Cliente | null
  pecas?: Peca[]
  /** Quando aberto a partir de um rascunho salvo. */
  draft?: FiscalDraft | null
}

export interface EspelhoProdutoLinha extends ItemProdutoPreparacao {
  desconto?: number
  cest?: string
}

export interface EspelhoFiscalViewModel {
  gerado_em: string
  origem_label: string
  rascunho_id?: string
  rascunho_status?: string
  rascunho_atualizado_em?: string
  qtd_pendencias: number
  tipo_sugerido_label: string
  tipo_sugerido: PreparacaoNotaFiscal['tipo_sugerido']
  oficina: DadosFiscaisOficina
  cliente: {
    consumidor_nao_identificado: boolean
    nome?: string
    fiscal: DadosFiscaisCliente
  }
  produtos: EspelhoProdutoLinha[]
  servicos: ItemServicoPreparacao[]
  pagamento: {
    status: string
    forma?: string
    subtotal: number
    desconto: number
    total: number
  }
  pendencias_criticas: PendenciaFiscalItem[]
  pendencias_atencao: PendenciaFiscalItem[]
  pendencias_info: string[]
  proximos_passos: string[]
  avisos: string[]
}

function textoSeguro(valor: unknown, fallback = '—'): string {
  if (valor == null) return fallback
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return fallback
    return String(valor)
  }
  const s = String(valor).trim()
  if (!s || s === 'undefined' || s === 'null' || s === 'NaN') return fallback
  return s
}

function esc(valor: unknown, fallback = '—'): string {
  return textoSeguro(valor, fallback)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function moedaSegura(valor: unknown): string {
  const n = Number(valor)
  if (!Number.isFinite(n)) return formatarMoeda(0)
  return formatarMoeda(n)
}

function labelIndicadorIe(raw?: string | null): string {
  const v = String(raw ?? '').trim()
  if (!v) return '—'
  return INDICADORES_IE_CLIENTE.find((i) => i.value === v)?.label ?? v
}

function formatarEndereco(end?: {
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  cidade?: string
  uf?: string
  cep?: string
}): string {
  if (!end) return '—'
  const linha1 = [
    end.logradouro,
    end.numero ? `nº ${end.numero}` : '',
    end.complemento,
    end.bairro,
  ]
    .map((x) => String(x ?? '').trim())
    .filter(Boolean)
    .join(', ')
  const linha2 = [end.cidade, end.uf].filter(Boolean).join(' / ')
  const cep = end.cep ? formatarCepExibicao(end.cep) : ''
  const partes = [linha1, linha2, cep ? `CEP ${cep}` : ''].filter(Boolean)
  return partes.length > 0 ? partes.join(' · ') : '—'
}

function enriquecerProduto(
  p: ItemProdutoPreparacao,
  pecas?: Peca[]
): EspelhoProdutoLinha {
  const peca = p.peca_id ? pecas?.find((x) => x.id === p.peca_id) : undefined
  const fiscal = peca ? obterDadosFiscaisProduto(peca) : null
  const descricaoFiscalBruta = p.descricao_fiscal || fiscal?.descricao_fiscal
  return {
    ...p,
    cest: fiscal?.cest || undefined,
    // Só mantém descrição fiscal se for diferente do nome (evita duplicar na tela).
    descricao_fiscal: descricaoFiscalParaExibir(p.nome, descricaoFiscalBruta),
    ncm: p.ncm || fiscal?.ncm,
    unidade_fiscal: p.unidade_fiscal || fiscal?.unidade_fiscal,
    origem_mercadoria: p.origem_mercadoria || fiscal?.origem_mercadoria,
    ean: p.ean || fiscal?.ean,
    cfop_padrao_venda: p.cfop_padrao_venda || fiscal?.cfop_padrao_venda,
    cst_csosn: p.cst_csosn || fiscal?.cst_csosn,
  }
}

/** Se descrição fiscal = nome, não exibe de novo. */
export function descricaoFiscalParaExibir(
  nome: string,
  descricaoFiscal?: string | null
): string | undefined {
  const df = String(descricaoFiscal ?? '').trim()
  if (!df) return undefined
  if (df.toLowerCase() === String(nome ?? '').trim().toLowerCase()) return undefined
  return df
}

function filtrarPendenciasInfo(avisos: string[]): string[] {
  const out: string[] = []
  for (const raw of avisos) {
    const a = String(raw ?? '').trim()
    if (!a) continue
    const lower = a.toLowerCase()
    if (lower.includes('contador')) continue
    if (lower.includes('conferência interna') || lower.includes('conferencia interna')) continue
    if (lower.includes('configurações fiscais iniciais') || lower.includes('configuracoes fiscais iniciais'))
      continue
    out.push(a)
  }
  const temNaoEmite = out.some(
    (x) =>
      x.toLowerCase().includes('não emite') ||
      x.toLowerCase().includes('nao emite') ||
      x.toLowerCase().includes('não gera xml') ||
      x.toLowerCase().includes('nao gera xml')
  )
  const temEmissaoInativa = out.some(
    (x) =>
      x.toLowerCase().includes('ainda não está ativa') ||
      x.toLowerCase().includes('ainda nao esta ativa') ||
      x.toLowerCase().includes('emissão fiscal ainda') ||
      x.toLowerCase().includes('emissao fiscal ainda')
  )
  if (!temNaoEmite) {
    out.unshift('Esta preparação não emite nota fiscal e não gera XML fiscal.')
  }
  if (!temEmissaoInativa) {
    out.push('A emissão fiscal ainda não está ativa.')
  }
  return [...new Set(out)]
}

function montarProximosPassos(prep: PreparacaoNotaFiscal): string[] {
  const passos: string[] = []
  const escopos = new Set(prep.pendencias.map((p) => p.escopo))
  if (escopos.has('oficina') || !prep.oficina_ok) {
    passos.push('Corrigir dados fiscais na oficina')
  }
  if (escopos.has('cliente') || !prep.cliente_ok) {
    passos.push('Corrigir dados fiscais do cliente')
  }
  if (escopos.has('produto') || !prep.produtos_ok) {
    passos.push('Corrigir dados fiscais dos produtos')
  }
  if (escopos.has('servico') || !prep.servicos_ok) {
    passos.push('Corrigir dados fiscais dos serviços')
  }
  passos.push('Revisar configurações fiscais iniciais com o contador')
  passos.push('Integrar provedor fiscal em fase futura')
  passos.push('Emitir apenas quando o módulo de emissão estiver ativo')
  return passos
}

/**
 * Monta o modelo do espelho a partir da preparação (e rascunho opcional).
 * Não calcula imposto. Não altera dados.
 */
export function montarEspelhoFiscalConferencia(
  ctx: EspelhoFiscalContexto
): EspelhoFiscalViewModel {
  const prep = ctx.preparacao
  const oficinaLive = obterDadosFiscaisOficina(ctx.configuracao)
  const snap = ctx.draft?.issuer_snapshot

  const oficina: DadosFiscaisOficina = {
    ...oficinaLive,
    cnpj:
      (typeof snap?.cnpj === 'string' && snap.cnpj.trim()
        ? snap.cnpj
        : oficinaLive.cnpj) || '',
    razao_social:
      (typeof snap?.razao_social === 'string' && snap.razao_social.trim()
        ? snap.razao_social
        : oficinaLive.razao_social) || '',
    nome_fantasia:
      (typeof snap?.nome_fantasia === 'string' && snap.nome_fantasia.trim()
        ? snap.nome_fantasia
        : oficinaLive.nome_fantasia) || '',
    regime_tributario:
      (typeof snap?.regime_tributario === 'string' && snap.regime_tributario.trim()
        ? (snap.regime_tributario as DadosFiscaisOficina['regime_tributario'])
        : oficinaLive.regime_tributario) || '',
    endereco: {
      ...oficinaLive.endereco,
      cidade:
        (typeof snap?.cidade === 'string' && snap.cidade.trim()
          ? snap.cidade
          : oficinaLive.endereco?.cidade) || '',
      uf:
        (typeof snap?.uf === 'string' && snap.uf.trim()
          ? snap.uf
          : oficinaLive.endereco?.uf) || '',
    },
  }

  const fiscalCliente = obterDadosFiscaisCliente(ctx.cliente ?? undefined)

  const desconto = Number(prep.desconto) || 0
  const total = Number(prep.valor_total) || 0
  const subtotal = Math.round((total + desconto) * 100) / 100

  const geradoEm = formatarDataHoraBrasil(new Date())

  const pendenciasInfo = filtrarPendenciasInfo(prep.avisos ?? [])

  return {
    gerado_em: geradoEm,
    origem_label: prep.origem_label,
    rascunho_id: ctx.draft?.id,
    rascunho_status: ctx.draft ? labelStatusFiscalDraft(ctx.draft.status) : undefined,
    rascunho_atualizado_em: ctx.draft?.updated_at
      ? (() => {
          try {
            return formatarDataHoraBrasil(ctx.draft.updated_at)
          } catch {
            try {
              return formatarDataBrasil(ctx.draft.updated_at)
            } catch {
              return ctx.draft.updated_at
            }
          }
        })()
      : undefined,
    qtd_pendencias: prep.pendencias.length,
    tipo_sugerido_label: prep.tipo_sugerido_label,
    tipo_sugerido: prep.tipo_sugerido,
    oficina,
    cliente: {
      consumidor_nao_identificado: prep.consumidor_nao_identificado,
      nome: prep.cliente_nome,
      fiscal: fiscalCliente,
    },
    produtos: prep.produtos.map((p) => enriquecerProduto(p, ctx.pecas)),
    servicos: prep.servicos,
    pagamento: {
      status: prep.status_financeiro_label,
      forma: prep.forma_pagamento,
      subtotal,
      desconto,
      total,
    },
    pendencias_criticas: prep.pendencias.filter((p) => p.severidade === 'bloqueante'),
    pendencias_atencao: prep.pendencias.filter((p) => p.severidade === 'aviso'),
    pendencias_info: pendenciasInfo,
    proximos_passos: montarProximosPassos(prep),
    avisos: pendenciasInfo,
  }
}

function blocoEnderecoHtml(titulo: string, linhas: Array<[string, string]>): string {
  const cells = linhas
    .map(
      ([rotulo, valor]) => `
      <div class="dado">
        <span class="rotulo">${esc(rotulo)}</span>
        <span class="valor">${esc(valor)}</span>
      </div>`
    )
    .join('')
  return `
    <section class="bloco">
      <h2>${esc(titulo)}</h2>
      <div class="dados">${cells}</div>
    </section>`
}

/**
 * Abre espelho em nova aba e dispara impressão (print do navegador).
 * Não gera XML/DANFE/chave. Não emite nota.
 */
export function imprimirEspelhoFiscalConferencia(vm: EspelhoFiscalViewModel): void {
  const of = vm.oficina
  const cli = vm.cliente
  const docFiscalCli =
    cli.fiscal.tipo_pessoa === 'juridica'
      ? formatarCnpjExibicao(cli.fiscal.cnpj) || '—'
      : formatarCpfExibicao(cli.fiscal.cpf) ||
        formatarCnpjExibicao(cli.fiscal.cnpj) ||
        '—'

  const produtosRows =
    vm.produtos.length === 0
      ? `<tr><td colspan="8">Nenhum produto</td></tr>`
      : vm.produtos
          .map(
            (p) => `
        <tr>
          <td>
            ${
              p.descricao_fiscal
                ? `<strong>Descrição: ${esc(p.nome)}</strong><div class="sub">Descrição fiscal: ${esc(p.descricao_fiscal)}</div>`
                : `<strong>${esc(p.nome)}</strong>`
            }
            <div class="sub">NCM ${esc(p.ncm)} · CFOP ${esc(p.cfop_padrao_venda)} · CEST ${esc(p.cest)} · Origem ${esc(p.origem_mercadoria)} · CST/CSOSN ${esc(p.cst_csosn)}${p.ean ? ` · EAN ${esc(p.ean)}` : ''}</div>
          </td>
          <td class="num">${esc(p.quantidade)}</td>
          <td class="num">${esc(p.unidade_fiscal || '—')}</td>
          <td class="num">${esc(moedaSegura(p.valor_unitario))}</td>
          <td class="num">${esc(moedaSegura(p.desconto ?? 0))}</td>
          <td class="num">${esc(moedaSegura(p.valor_total))}</td>
        </tr>`
          )
          .join('')

  const servicosRows =
    vm.servicos.length === 0
      ? `<tr><td colspan="3">Nenhum serviço</td></tr>`
      : vm.servicos
          .map(
            (s) => `
        <tr>
          <td>
            ${
              s.descricao_fiscal
                ? `<strong>Descrição: ${esc(s.nome)}</strong><div class="sub">Descrição fiscal: ${esc(s.descricao_fiscal)}</div>`
                : `<strong>${esc(s.nome)}</strong>`
            }
            <div class="sub">Cód. municipal ${esc(s.codigo_municipal_servico)} · LC 116 ${esc(s.item_lista_servico_lc116)} · Trib. municipal ${esc(s.codigo_tributacao_municipal)} · CNAE ${esc(s.cnae)}</div>
            <div class="sub">Município ${esc(s.municipio_prestacao_padrao)} · ISS informado ${esc(s.aliquota_iss_informada != null ? `${s.aliquota_iss_informada}%` : '—')} · Retido ${esc(s.iss_retido)} · Exigibilidade ${esc(s.exigibilidade_iss)}</div>
            <div class="sub">Dados de serviço preparados para futura NFS-e. A emissão ainda não está ativa.</div>
          </td>
          <td class="num">${esc(s.quantidade ?? 1)}</td>
          <td class="num">${esc(moedaSegura(s.valor))}</td>
        </tr>`
          )
          .join('')

  const listaCriticas =
    vm.pendencias_criticas.length === 0
      ? '<li>Nenhuma pendência crítica</li>'
      : vm.pendencias_criticas.map((p) => `<li>${esc(p.mensagem)}</li>`).join('')
  const listaAtencao =
    vm.pendencias_atencao.length === 0
      ? '<li>Nenhuma pendência de atenção</li>'
      : vm.pendencias_atencao.map((p) => `<li>${esc(p.mensagem)}</li>`).join('')
  const listaInfo =
    vm.pendencias_info.length === 0
      ? ''
      : `<h3>Informativas</h3><ul>${vm.pendencias_info.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>`

  const rascunhoLinha = vm.rascunho_id
    ? `<div class="dado"><span class="rotulo">Rascunho fiscal</span><span class="valor">${esc(vm.rascunho_id.slice(0, 8))} · ${esc(vm.rascunho_status)} · Última validação: ${esc(vm.rascunho_atualizado_em)}</span></div>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Espelho fiscal para conferência — NÃO É NOTA FISCAL</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      background: #f4f4f5; color: #111;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 13px; line-height: 1.45;
    }
    .page {
      max-width: 900px; margin: 16px auto; padding: 28px 32px;
      background: #fff; border: 1px solid #e4e4e7; border-radius: 8px;
      position: relative;
    }
    .marca-dagua {
      position: absolute; inset: 18% 8%;
      display: flex; align-items: center; justify-content: center;
      pointer-events: none; z-index: 0;
      font-size: 64px; font-weight: 800; letter-spacing: 0.08em;
      color: rgba(185, 28, 28, 0.07); transform: rotate(-18deg);
      text-align: center;
    }
    .conteudo { position: relative; z-index: 1; }
    .aviso-topo {
      border: 2px solid #b91c1c; background: #fef2f2; color: #7f1d1d;
      padding: 12px 14px; border-radius: 6px; margin-bottom: 16px;
      font-weight: 700; text-align: center;
    }
    .aviso-topo .sub {
      display: block; margin-top: 4px; font-weight: 600; font-size: 12px;
    }
    h1 { margin: 0 0 4px; font-size: 20px; }
    .subtitulo { margin: 0 0 12px; color: #52525b; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; margin-bottom: 16px; }
    .bloco { margin: 18px 0; page-break-inside: avoid; }
    .bloco h2 {
      margin: 0 0 8px; font-size: 13px; text-transform: uppercase;
      letter-spacing: 0.04em; color: #3f3f46; border-bottom: 1px solid #d4d4d8; padding-bottom: 4px;
    }
    .bloco h3 { margin: 10px 0 4px; font-size: 12px; color: #52525b; }
    .dados { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
    .dado { min-width: 0; }
    .dado .rotulo { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #71717a; }
    .dado .valor { display: block; word-break: break-word; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 6px; }
    th, td { border-bottom: 1px solid #e4e4e7; padding: 8px 6px; text-align: left; vertical-align: top; }
    th { background: #f4f4f5; font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; }
    .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .sub { font-size: 11px; color: #52525b; margin-top: 2px; }
    ul { margin: 4px 0 0; padding-left: 18px; }
    li { margin: 2px 0; }
    .critica { color: #991b1b; }
    .atencao { color: #92400e; }
    .rodape {
      margin-top: 24px; padding-top: 12px; border-top: 2px solid #b91c1c;
      font-size: 11px; color: #7f1d1d; text-align: center; font-weight: 600;
    }
    .acoes { margin-top: 20px; text-align: center; }
    .acoes button {
      font-family: inherit; font-size: 14px; font-weight: 600;
      padding: 10px 22px; border: none; border-radius: 6px;
      background: #18181b; color: #fff; cursor: pointer;
    }
    @media (max-width: 640px) {
      .page { margin: 8px; padding: 16px; }
      .meta, .dados { grid-template-columns: 1fr; }
      .marca-dagua { font-size: 36px; }
    }
    @media print {
      html, body { background: #fff !important; }
      .page { margin: 0; padding: 0; border: none; box-shadow: none; max-width: none; }
      .acoes, .acoes button, button { display: none !important; }
      .aviso-topo, .rodape { display: block !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .marca-dagua { color: rgba(185, 28, 28, 0.06); }
      @page { size: A4; margin: 12mm; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="marca-dagua">NÃO FISCAL</div>
    <div class="conteudo">
      <div class="aviso-topo">
        NÃO É NOTA FISCAL
        <span class="sub">Documento sem validade fiscal. Use apenas para conferência antes da emissão.</span>
      </div>
      <h1>BoxGestor</h1>
      <p class="subtitulo">Espelho fiscal para conferência</p>
      <div class="meta">
        <div class="dado"><span class="rotulo">Gerado em</span><span class="valor">${esc(vm.gerado_em)}</span></div>
        <div class="dado"><span class="rotulo">Origem</span><span class="valor">${esc(vm.origem_label)}</span></div>
        ${rascunhoLinha}
        <div class="dado"><span class="rotulo">Pendências</span><span class="valor">${esc(vm.qtd_pendencias)}</span></div>
      </div>

      ${blocoEnderecoHtml('1. Emitente / Oficina', [
        ['CNPJ', formatarCnpjExibicao(of.cnpj) || '—'],
        ['Razão social', of.razao_social || '—'],
        ['Nome fantasia', of.nome_fantasia || '—'],
        ['Regime tributário', labelRegimeTributarioFiscal(of.regime_tributario)],
        ['Endereço', formatarEndereco(of.endereco)],
        ['Cidade / UF', [of.endereco?.cidade, of.endereco?.uf].filter(Boolean).join(' / ') || '—'],
        ['Telefone', of.telefone_fiscal || '—'],
        ['E-mail', of.email_fiscal || '—'],
      ])}

      <section class="bloco">
        <h2>2. Cliente / Destinatário</h2>
        ${
          cli.consumidor_nao_identificado
            ? `<p><strong>Consumidor não identificado</strong></p><p class="sub">Dados do destinatário não informados.</p>`
            : `<div class="dados">
                <div class="dado"><span class="rotulo">Nome</span><span class="valor">${esc(cli.nome || cli.fiscal.razao_social || cli.fiscal.nome_fantasia)}</span></div>
                <div class="dado"><span class="rotulo">CPF / CNPJ</span><span class="valor">${esc(docFiscalCli)}</span></div>
                <div class="dado"><span class="rotulo">IE / Indicador IE</span><span class="valor">${esc(cli.fiscal.inscricao_estadual || '—')} · ${esc(labelIndicadorIe(cli.fiscal.indicador_ie))}</span></div>
                <div class="dado"><span class="rotulo">E-mail fiscal</span><span class="valor">${esc(cli.fiscal.email_fiscal || '—')}</span></div>
                <div class="dado"><span class="rotulo">Telefone fiscal</span><span class="valor">${esc(cli.fiscal.telefone_fiscal || '—')}</span></div>
                <div class="dado"><span class="rotulo">Endereço fiscal</span><span class="valor">${esc(formatarEndereco(cli.fiscal.endereco))}</span></div>
                <div class="dado"><span class="rotulo">Cidade / UF</span><span class="valor">${esc([cli.fiscal.endereco?.cidade, cli.fiscal.endereco?.uf].filter(Boolean).join(' / ') || '—')}</span></div>
                <div class="dado"><span class="rotulo">CEP</span><span class="valor">${esc(cli.fiscal.endereco?.cep ? formatarCepExibicao(cli.fiscal.endereco.cep) : '—')}</span></div>
              </div>`
        }
      </section>

      <section class="bloco">
        <h2>3. Tipo sugerido</h2>
        <p><strong>${esc(vm.tipo_sugerido_label)}</strong></p>
        ${
          vm.tipo_sugerido === 'misto_servico_produto'
            ? '<p class="sub">OS mista: serviço + produto — pode exigir documentos separados.</p>'
            : ''
        }
        <p class="sub">Consulte o contador na configuração inicial e em caso de dúvida sobre o tipo de documento. No uso normal, esta prévia serve para conferência interna.</p>
      </section>

      <section class="bloco">
        <h2>4. Itens / produtos</h2>
        <table>
          <thead>
            <tr>
              <th>Descrição</th>
              <th class="num">Qtd</th>
              <th class="num">Und</th>
              <th class="num">Unitário</th>
              <th class="num">Desc.</th>
              <th class="num">Total</th>
            </tr>
          </thead>
          <tbody>${produtosRows}</tbody>
        </table>
      </section>

      <section class="bloco">
        <h2>5. Serviços</h2>
        <table>
          <thead>
            <tr>
              <th>Descrição</th>
              <th class="num">Qtd</th>
              <th class="num">Total</th>
            </tr>
          </thead>
          <tbody>${servicosRows}</tbody>
        </table>
      </section>

      <section class="bloco">
        <h2>6. Pagamento</h2>
        <div class="dados">
          <div class="dado"><span class="rotulo">Status financeiro</span><span class="valor">${esc(vm.pagamento.status)}</span></div>
          <div class="dado"><span class="rotulo">Forma</span><span class="valor">${esc(vm.pagamento.forma || '—')}</span></div>
          <div class="dado"><span class="rotulo">Subtotal</span><span class="valor">${esc(moedaSegura(vm.pagamento.subtotal))}</span></div>
          <div class="dado"><span class="rotulo">Desconto</span><span class="valor">${esc(moedaSegura(vm.pagamento.desconto))}</span></div>
          <div class="dado"><span class="rotulo">Total</span><span class="valor"><strong>${esc(moedaSegura(vm.pagamento.total))}</strong></span></div>
        </div>
      </section>

      <section class="bloco">
        <h2>7. Pendências</h2>
        <h3 class="critica">Críticas</h3>
        <ul class="critica">${listaCriticas}</ul>
        <h3 class="atencao">Atenção</h3>
        <ul class="atencao">${listaAtencao}</ul>
        ${listaInfo}
      </section>

      <section class="bloco">
        <h2>8. Próximos passos</h2>
        <ul>
          ${vm.proximos_passos.map((passo) => `<li>${esc(passo)}</li>`).join('')}
        </ul>
        <p class="sub" style="margin-top:10px"><strong>Emissão ainda não ativa.</strong></p>
      </section>

      <footer class="rodape">
        NÃO É NOTA FISCAL — SEM VALIDADE FISCAL<br />
        Este documento não substitui NF-e, NFC-e, NFS-e, DANFE, XML autorizado ou qualquer documento fiscal oficial.
      </footer>

      <div class="acoes">
        <button type="button" onclick="window.print()">Imprimir conferência</button>
      </div>
    </div>
  </div>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 250);
    });
  </script>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank', 'noopener,noreferrer')
  if (!win) {
    URL.revokeObjectURL(url)
    throw new Error(MSG_POPUP)
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
