import type { PreferenciasSistema } from '@/types/oficina'

export type ModoOS = 'simples' | 'completa'

export function obterModoOS(preferencias?: PreferenciasSistema | null): ModoOS {
  return preferencias?.os_modo === 'simples' ? 'simples' : 'completa'
}

export function osModoEhCompleta(preferencias?: PreferenciasSistema | null): boolean {
  return obterModoOS(preferencias) === 'completa'
}

export const LABEL_MODO_OS: Record<ModoOS, string> = {
  simples: 'OS Simples',
  completa: 'OS Completa',
}
