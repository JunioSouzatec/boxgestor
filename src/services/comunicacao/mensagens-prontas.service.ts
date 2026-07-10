import { adaptarTextoLembrete, obterTermosOficina } from '@/lib/termos-oficina'
import { MODELOS_MENSAGEM_PADRAO } from '@/services/comunicacao/comunicacao.service'
import type { ModeloMensagem } from '@/types/comunicacao'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { TipoOficina } from '@/types/tipo-oficina'

export function obterModelosMensagemPadrao(tipoOficina?: TipoOficina): ModeloMensagem[] {
  const termos = obterTermosOficina(tipoOficina)
  return MODELOS_MENSAGEM_PADRAO.map((modelo) => ({
    ...modelo,
    label: adaptarLabelModelo(modelo, termos.tipo),
    corpo: adaptarTextoLembrete(modelo.corpo, termos),
  }))
}

function adaptarLabelModelo(modelo: ModeloMensagem, tipo: TipoOficina): string {
  if (tipo === 'motos') return modelo.label
  return modelo.label
    .replace(/\bMoto\b/g, 'Veículo')
    .replace(/\bMotos\b/g, 'Veículos')
    .replace(/\bmoto\b/g, 'veículo')
}

export function resolverModelosMensagemOficina(
  configuracao: ConfiguracaoOficina | null | undefined
): ModeloMensagem[] {
  const padrao = obterModelosMensagemPadrao(configuracao?.tipo_oficina)
  const custom = configuracao?.mensagens_prontas
  if (!custom?.length) return padrao

  const mapaCustom = new Map(custom.map((m) => [m.tipo, m]))
  return padrao.map((base) => {
    const editado = mapaCustom.get(base.tipo)
    if (!editado) return base
    const termos = obterTermosOficina(configuracao?.tipo_oficina)
    return {
      ...base,
      label: editado.label || base.label,
      corpo: adaptarTextoLembrete(editado.corpo || base.corpo, termos),
    }
  })
}

export function mesclarModeloMensagemSalvo(
  configuracao: ConfiguracaoOficina,
  tipo: ModeloMensagem['tipo'],
  patch: Partial<Pick<ModeloMensagem, 'label' | 'corpo'>>
): ModeloMensagem[] {
  const atuais = resolverModelosMensagemOficina(configuracao)
  const existentes = configuracao.mensagens_prontas ?? []
  const mapa = new Map(existentes.map((m) => [m.tipo, m]))

  const base = atuais.find((m) => m.tipo === tipo)
  if (!base) return existentes

  mapa.set(tipo, {
    tipo,
    label: patch.label ?? base.label,
    corpo: patch.corpo ?? base.corpo,
  })

  return [...mapa.values()]
}
