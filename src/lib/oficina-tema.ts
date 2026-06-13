import { CORES_MARCA_PADRAO, obterCoresMarcaEfetivas } from '@/lib/oficina-marca'
import type { ConfiguracaoOficina, CoresMarcaOficina } from '@/types/oficina'

const VARIAVEIS_TEMA = [
  '--color-primary',
  '--color-primary-foreground',
  '--color-secondary',
  '--color-accent-foreground',
  '--color-success',
  '--color-warning',
  '--color-destructive',
  '--color-sidebar-active',
] as const

function hexParaRgb(hex: string): { r: number; g: number; b: number } | null {
  const limpo = hex.replace('#', '').trim()
  if (limpo.length === 3) {
    const r = parseInt(limpo[0] + limpo[0], 16)
    const g = parseInt(limpo[1] + limpo[1], 16)
    const b = parseInt(limpo[2] + limpo[2], 16)
    return { r, g, b }
  }
  if (limpo.length === 6) {
    const r = parseInt(limpo.slice(0, 2), 16)
    const g = parseInt(limpo.slice(2, 4), 16)
    const b = parseInt(limpo.slice(4, 6), 16)
    if ([r, g, b].some(Number.isNaN)) return null
    return { r, g, b }
  }
  return null
}

function luminancia(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

export function corTextoContraste(fundoHex: string): string {
  const rgb = hexParaRgb(fundoHex)
  if (!rgb) return '#09090b'
  return luminancia(rgb.r, rgb.g, rgb.b) > 0.55 ? '#09090b' : '#fafafa'
}

function mapaVariaveisTema(cores: Required<CoresMarcaOficina>): Record<string, string> {
  const primaria = cores.cor_botoes || cores.cor_primaria
  return {
    '--color-primary': primaria,
    '--color-primary-foreground': corTextoContraste(primaria),
    '--color-secondary': cores.cor_secundaria,
    '--color-accent-foreground': cores.cor_destaque,
    '--color-success': cores.cor_sucesso,
    '--color-warning': cores.cor_alerta,
    '--color-destructive': cores.cor_erro,
    '--color-sidebar-active': `${primaria}22`,
  }
}

export function aplicarTemaOficina(config: ConfiguracaoOficina): void {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  const cores = obterCoresMarcaEfetivas(config)
  const vars = mapaVariaveisTema(cores)

  for (const [chave, valor] of Object.entries(vars)) {
    root.style.setProperty(chave, valor)
  }

  const temaEscuro = config.preferencias?.tema_escuro ?? true
  root.classList.toggle('craft-tema-claro', !temaEscuro)
  root.classList.toggle('craft-tema-escuro', temaEscuro)
}

export function restaurarTemaPadrao(): void {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  for (const chave of VARIAVEIS_TEMA) {
    root.style.removeProperty(chave)
  }
  root.classList.remove('craft-tema-claro')
  root.classList.add('craft-tema-escuro')
}

export function restaurarCoresMarcaPadrao(): CoresMarcaOficina {
  return { ...CORES_MARCA_PADRAO }
}
