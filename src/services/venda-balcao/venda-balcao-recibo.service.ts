/**
 * RC2 Venda Balcão A3 — recibo HTML simples (somente leitura).
 * Não usa o recibo/PDF de OS. Não altera venda, estoque, caixa nem financeiro.
 */
import { formatarDataBrasil } from '@/lib/data-local'
import { formatarMoeda } from '@/lib/utils'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { VendaBalcao } from '@/types/venda-balcao'
import { labelPagamentoVendaBalcao } from '@/types/venda-balcao'
import {
  formatarFormaBalcaoComParcelas,
  obterParcelasCraftMetaVenda,
} from '@/services/venda-balcao/venda-balcao-forma.helpers'

const MSG_POPUP =
  'Não foi possível abrir o recibo. Verifique se o navegador bloqueou pop-ups.'

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

/** Quantidade + unidade legível (sempre com espaço; plural quando couber). */
function formatarQuantidadeRecibo(quantity: unknown, unit: unknown): string {
  const qtd = Number(quantity)
  if (!Number.isFinite(qtd)) return '—'

  const qtdLabel =
    Math.abs(qtd - Math.round(qtd)) < 0.0005
      ? String(Math.round(qtd))
      : String(Math.round(qtd * 1000) / 1000)

  const raw = String(unit ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (!raw || raw === 'undefined' || raw === 'null' || raw === 'nan') {
    return qtdLabel
  }

  const singular = Math.abs(qtd) === 1

  // unidade / unidades
  if (raw === 'unidade' || raw === 'unidades') {
    return singular ? `${qtdLabel} unidade` : `${qtdLabel} unidades`
  }

  // un / un.
  if (raw === 'un' || raw === 'un.') {
    return `${qtdLabel} un.`
  }

  // kg (invariável)
  if (raw === 'kg' || raw === 'kgs' || raw === 'quilo' || raw === 'quilos') {
    return `${qtdLabel} kg`
  }

  // litro / litros
  if (raw === 'litro' || raw === 'litros' || raw === 'l' || raw === 'lt') {
    return singular ? `${qtdLabel} litro` : `${qtdLabel} litros`
  }

  // metro / metros
  if (raw === 'metro' || raw === 'metros' || raw === 'm') {
    return singular ? `${qtdLabel} metro` : `${qtdLabel} metros`
  }

  // peca / pecas
  if (raw === 'peca' || raw === 'pecas') {
    return singular ? `${qtdLabel} peça` : `${qtdLabel} peças`
  }

  // Demais unidades: quantidade + espaço + rótulo original limpo
  const rotulo = String(unit ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!rotulo) return qtdLabel
  return `${qtdLabel} ${rotulo}`
}

/**
 * Abre recibo em nova aba e dispara impressão.
 * Usa Blob URL para funcionar com noopener (window.open('', …, 'noopener') retorna null no Chrome).
 */
export function imprimirReciboVendaBalcao(params: {
  venda: VendaBalcao
  configuracao?: ConfiguracaoOficina | null
}): void {
  const { venda } = params
  if (!venda?.id) {
    throw new Error('Não foi possível gerar o recibo: venda não encontrada.')
  }

  const oficina = textoSeguro(params.configuracao?.nome, 'Oficina')
  const dataIso = venda.sold_at || venda.created_at
  let dataLabel = '—'
  try {
    if (dataIso) dataLabel = formatarDataBrasil(dataIso)
  } catch {
    dataLabel = '—'
  }

  const num =
    venda.sale_number != null && Number.isFinite(Number(venda.sale_number))
      ? String(venda.sale_number)
      : textoSeguro(venda.id?.slice(0, 8), '—')

  const forma =
    (typeof venda.craft_meta?.payment_method_label === 'string' &&
      venda.craft_meta.payment_method_label.trim()) ||
    formatarFormaBalcaoComParcelas(
      venda.payment_method,
      obterParcelasCraftMetaVenda(venda)
    )

  const recebidoPor = textoSeguro(
    (venda.craft_meta?.received_by_name as string | undefined) || venda.seller_name,
    '—'
  )
  const vendedor = textoSeguro(venda.seller_name, '—')
  const cliente = textoSeguro(venda.customer_name, 'Não informado')
  const status = textoSeguro(
    labelPagamentoVendaBalcao(venda.payment_status || 'paid'),
    'Pago'
  )
  const itens = Array.isArray(venda.itens) ? venda.itens : []

  const linhasItens = itens
    .map((i) => {
      // Monta "2 unidades" completo antes do esc — não concatenar qtd+unit via esc separado
      const qtdFormatada = formatarQuantidadeRecibo(i.quantity, i.unit)
      return `
      <tr>
        <td>${esc(i.item_name, 'Não informado')}</td>
        <td class="num">${esc(qtdFormatada)}</td>
        <td class="num">${esc(moedaSegura(i.unit_price))}</td>
        <td class="num">${esc(moedaSegura(i.discount))}</td>
        <td class="num">${esc(moedaSegura(i.total))}</td>
      </tr>`
    })
    .join('')

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Recibo — Venda balcão #${esc(num)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #f4f4f5;
      color: #111;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 14px;
      line-height: 1.45;
      -webkit-font-smoothing: antialiased;
    }
    .page {
      max-width: 720px;
      margin: 24px auto;
      padding: 32px 36px;
      background: #fff;
      border: 1px solid #e4e4e7;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,.06);
    }
    .cabecalho { margin-bottom: 20px; }
    .cabecalho h1 {
      margin: 0 0 6px;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #09090b;
    }
    .cabecalho .subtitulo {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #52525b;
    }
    .divisor {
      height: 1px;
      background: #d4d4d8;
      border: 0;
      margin: 0 0 20px;
    }
    .dados {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 24px;
      margin-bottom: 24px;
    }
    .dado {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .dado .rotulo {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #71717a;
    }
    .dado .valor {
      font-size: 14px;
      color: #18181b;
      word-break: break-word;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 0 0 8px;
      font-size: 13px;
    }
    thead th {
      background: #f4f4f5;
      border-top: 1px solid #d4d4d8;
      border-bottom: 1px solid #d4d4d8;
      padding: 10px 8px;
      text-align: left;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #3f3f46;
    }
    tbody td {
      padding: 10px 8px;
      border-bottom: 1px solid #e4e4e7;
      color: #18181b;
      vertical-align: top;
    }
    tbody tr:last-child td { border-bottom: 1px solid #d4d4d8; }
    .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .totais {
      margin-top: 16px;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
    }
    .totais .linha {
      display: flex;
      justify-content: space-between;
      gap: 32px;
      min-width: 240px;
      font-size: 13px;
      color: #52525b;
    }
    .totais .linha.total {
      margin-top: 6px;
      padding-top: 10px;
      border-top: 2px solid #18181b;
      font-size: 16px;
      font-weight: 700;
      color: #09090b;
    }
    .rodape {
      margin-top: 28px;
      padding-top: 14px;
      border-top: 1px solid #e4e4e7;
      font-size: 11px;
      color: #71717a;
      text-align: center;
    }
    .acoes {
      margin-top: 24px;
      text-align: center;
    }
    .acoes button {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 14px;
      font-weight: 600;
      padding: 10px 22px;
      cursor: pointer;
      border: none;
      border-radius: 6px;
      background: #18181b;
      color: #fff;
    }
    .acoes button:hover { background: #27272a; }
    @media (max-width: 560px) {
      .page { margin: 12px; padding: 20px 18px; }
      .dados { grid-template-columns: 1fr; }
    }
    @media print {
      html, body {
        background: #fff !important;
        color: #000 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .page {
        max-width: none;
        margin: 0;
        padding: 0;
        border: none;
        border-radius: 0;
        box-shadow: none;
      }
      .acoes { display: none !important; }
      thead th { background: #f4f4f5 !important; }
      table { page-break-inside: auto; }
      tr, td, th { page-break-inside: avoid; }
      @page { size: A4; margin: 14mm; }
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="cabecalho">
      <h1>${esc(oficina)}</h1>
      <p class="subtitulo">Recibo de venda balcão</p>
    </header>
    <hr class="divisor" />
    <section class="dados">
      <div class="dado">
        <span class="rotulo">Venda</span>
        <span class="valor">#${esc(num)}</span>
      </div>
      <div class="dado">
        <span class="rotulo">Data</span>
        <span class="valor">${esc(dataLabel)}</span>
      </div>
      <div class="dado">
        <span class="rotulo">Cliente</span>
        <span class="valor">${esc(cliente)}</span>
      </div>
      <div class="dado">
        <span class="rotulo">Vendedor</span>
        <span class="valor">${esc(vendedor)}</span>
      </div>
      <div class="dado">
        <span class="rotulo">Status</span>
        <span class="valor">${esc(status)}</span>
      </div>
      <div class="dado">
        <span class="rotulo">Forma de pagamento</span>
        <span class="valor">${esc(forma)}</span>
      </div>
      <div class="dado">
        <span class="rotulo">Recebido por</span>
        <span class="valor">${esc(recebidoPor)}</span>
      </div>
    </section>
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th class="num">Qtd</th>
          <th class="num">Preço</th>
          <th class="num">Desconto</th>
          <th class="num">Total</th>
        </tr>
      </thead>
      <tbody>
        ${linhasItens || '<tr><td colspan="5">Sem itens</td></tr>'}
      </tbody>
    </table>
    <div class="totais">
      <div class="linha">
        <span>Subtotal</span>
        <span class="num">${esc(moedaSegura(venda.subtotal))}</span>
      </div>
      <div class="linha">
        <span>Descontos</span>
        <span class="num">${esc(moedaSegura(venda.discount_total))}</span>
      </div>
      <div class="linha total">
        <span>Total</span>
        <span class="num">${esc(moedaSegura(venda.total))}</span>
      </div>
    </div>
    <footer class="rodape">
      Documento gerado automaticamente · Venda balcão
    </footer>
    <div class="acoes">
      <button type="button" onclick="window.print()">Imprimir</button>
    </div>
  </div>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () {
        try { window.print(); } catch (e) {}
      }, 250);
    });
  </script>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  // noopener ok com Blob URL: a aba carrega o HTML sem precisar de document.write
  const w = window.open(url, '_blank')
  if (!w) {
    URL.revokeObjectURL(url)
    throw new Error(MSG_POPUP)
  }

  // Libera o Blob depois que a aba teve tempo de carregar
  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(url)
    } catch {
      /* ignore */
    }
  }, 60_000)
}
