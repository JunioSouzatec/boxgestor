export interface PermissoesDebugContext {
  rota?: string
  usuarioId?: string
  papel?: string
  temPermissionsSalvo?: boolean
  permissionsValidas?: boolean
  atualizadoEm?: string
}

declare global {
  interface Window {
    __CRAFT_PERM_DEBUG__?: PermissoesDebugContext
  }
}

export function registrarContextoPermissoesDebug(ctx: PermissoesDebugContext): void {
  if (typeof window === 'undefined') return
  window.__CRAFT_PERM_DEBUG__ = {
    ...window.__CRAFT_PERM_DEBUG__,
    ...ctx,
    atualizadoEm: new Date().toISOString(),
  }
}

export function obterContextoPermissoesDebug(): PermissoesDebugContext | undefined {
  if (typeof window === 'undefined') return undefined
  return window.__CRAFT_PERM_DEBUG__
}
