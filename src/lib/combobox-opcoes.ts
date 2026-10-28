function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
}

/**
 * Lista do combobox: com o valor atual visível (consulta inativa) mostra
 * todas as opções — o usuário troca sem apagar o texto. Ao digitar, filtra.
 */
export function opcoesVisiveisCombobox(
  opcoes: string[],
  consulta: string,
  consultaAtiva: boolean
): string[] {
  if (!consultaAtiva || !consulta.trim()) return opcoes
  const q = normalizar(consulta)
  return opcoes.filter((o) => normalizar(o).includes(q))
}
