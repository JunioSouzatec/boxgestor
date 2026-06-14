/** Evita re-sincronizar todos os pagamentos após salvar só dados da oficina */
let pularPagamentosProximaPersistencia = false

/** Evita persistência remota duplicada (salvar OS com confirmação explícita) */
let pularPersistenciaRemotaProxima = false

/** Suprime toasts/fallback automáticos durante salvamento explícito (OS/pagamento) */
let operacoesSalvamentoExplicito = 0

export function iniciarOperacaoSalvamentoExplicito(): void {
  operacoesSalvamentoExplicito += 1
}

export function finalizarOperacaoSalvamentoExplicito(): void {
  operacoesSalvamentoExplicito = Math.max(0, operacoesSalvamentoExplicito - 1)
}

export function operacaoSalvamentoExplicitoAtiva(): boolean {
  return operacoesSalvamentoExplicito > 0
}

/** IDs de lançamentos recém-criados/alterados (ex.: Registrar pagamento) */
let lancamentosRecentes: string[] = []

export function marcarPersistenciaSomenteOficina(): void {
  pularPagamentosProximaPersistencia = true
}

export function marcarPularPersistenciaRemotaProxima(): void {
  pularPersistenciaRemotaProxima = true
}

export function consumirPularPersistenciaRemotaProxima(): boolean {
  const v = pularPersistenciaRemotaProxima
  pularPersistenciaRemotaProxima = false
  return v
}

export function consumirPularPagamentosProximaPersistencia(): boolean {
  const v = pularPagamentosProximaPersistencia
  pularPagamentosProximaPersistencia = false
  return v
}

export function marcarLancamentosRecentes(ids: string[]): void {
  lancamentosRecentes = [...new Set(ids)]
}

export function consumirLancamentosRecentes(): string[] {
  const v = lancamentosRecentes
  lancamentosRecentes = []
  return v
}
