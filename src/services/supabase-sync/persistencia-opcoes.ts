/** Evita re-sincronizar todos os pagamentos após salvar só dados da oficina */
let pularPagamentosProximaPersistencia = false

export function marcarPersistenciaSomenteOficina(): void {
  pularPagamentosProximaPersistencia = true
}

export function consumirPularPagamentosProximaPersistencia(): boolean {
  const v = pularPagamentosProximaPersistencia
  pularPagamentosProximaPersistencia = false
  return v
}
