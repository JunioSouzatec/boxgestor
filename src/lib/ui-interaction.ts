/** Pausas leves de sync UI enquanto o usuário edita dialogs pesados (OS). */

let dialogOsAberto = false

export function setDialogOsAberto(aberto: boolean): void {
  dialogOsAberto = aberto
}

export function isDialogOsAberto(): boolean {
  return dialogOsAberto
}
