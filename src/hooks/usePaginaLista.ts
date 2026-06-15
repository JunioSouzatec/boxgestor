import { useEffect, useMemo, useState } from 'react'

const TAMANHO_PADRAO = 50

export function usePaginaLista<T>(itens: T[], tamanhoPagina = TAMANHO_PADRAO, resetKey = '') {
  const [pagina, setPagina] = useState(1)

  useEffect(() => {
    setPagina(1)
  }, [resetKey, itens.length])

  const total = itens.length
  const totalPaginas = Math.max(1, Math.ceil(total / tamanhoPagina))
  const paginaAtual = Math.min(pagina, totalPaginas)

  const itensPagina = useMemo(() => {
    const inicio = (paginaAtual - 1) * tamanhoPagina
    return itens.slice(inicio, inicio + tamanhoPagina)
  }, [itens, paginaAtual, tamanhoPagina])

  return {
    itensPagina,
    pagina: paginaAtual,
    totalPaginas,
    total,
    tamanhoPagina,
    irPagina: setPagina,
    temPaginacao: total > tamanhoPagina,
  }
}
