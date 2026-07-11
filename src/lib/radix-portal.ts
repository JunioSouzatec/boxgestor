/** Detecta interação em portais Radix (Select, Popover, confirmação) para não fechar o dialog pai. */
export function interacaoEmPortalRadix(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return !!(
    target.closest('[data-radix-popper-content-wrapper]') ||
    target.closest('[data-radix-select-content]') ||
    target.closest('[role="listbox"]') ||
    target.closest('[data-craft-confirmacao]') ||
    target.closest('[data-craft-autorizacao-pin]') ||
    target.closest('[data-radix-menu-content]')
  )
}

export function prevenirFechamentoDialogPorPortal(
  event: { preventDefault: () => void; detail?: { originalEvent?: Event } }
): void {
  const original = event.detail?.originalEvent
  if (original && interacaoEmPortalRadix(original.target)) {
    event.preventDefault()
  }
}
