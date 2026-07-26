import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  contarFotosPorItemChecklist,
  FOTOS_OS_ATUALIZADAS_EVENT,
  listarFotosOSComUrls,
  type FotosOsAtualizadasDetail,
  type ServiceOrderPhotoComUrl,
} from '@/services/os/service-order-photos.service'

export interface UseFotosOSCompartilhadasParams {
  osId?: string
  officeId?: string
  osNumero?: number
  /** Só carrega quando o diálogo/tela da OS está ativo */
  ativo?: boolean
}

/**
 * Fonte única de fotos da OS (checklist + galeria).
 * Um listarFotosOSComUrls por reload; anti-corrida por seq.
 */
export function useFotosOSCompartilhadas({
  osId,
  officeId,
  osNumero,
  ativo = true,
}: UseFotosOSCompartilhadasParams) {
  const [fotos, setFotos] = useState<ServiceOrderPhotoComUrl[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const seqRef = useRef(0)

  const recarregar = useCallback(async (): Promise<ServiceOrderPhotoComUrl[]> => {
    const seq = ++seqRef.current
    const id = osId?.trim()
    const office = officeId?.trim()

    if (!ativo || !id || !office) {
      if (seqRef.current === seq) {
        setFotos([])
        setErro(null)
        setCarregando(false)
      }
      return []
    }

    setCarregando(true)
    setErro(null)

    const resultado = await listarFotosOSComUrls({
      officeId: office,
      serviceOrderId: id,
      osNumero,
    })

    if (seqRef.current !== seq) {
      return resultado.ok && resultado.dados ? resultado.dados : []
    }

    if (!resultado.ok || !resultado.dados) {
      setFotos([])
      setErro(resultado.erro ?? 'Não foi possível carregar as fotos.')
      setCarregando(false)
      return []
    }

    setFotos(resultado.dados)
    setErro(null)
    setCarregando(false)
    return resultado.dados
  }, [ativo, osId, officeId, osNumero])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  // Compatibilidade: um único listener (pai) para eventos dos filhos
  useEffect(() => {
    const idAtual = osId?.trim()
    if (!ativo || !idAtual) return

    function onFotosAtualizadas(ev: Event) {
      const detail = (ev as CustomEvent<FotosOsAtualizadasDetail>).detail
      const idEvento = detail?.serviceOrderId?.trim()
      if (!idEvento || idEvento !== idAtual) return
      void recarregar()
    }

    window.addEventListener(FOTOS_OS_ATUALIZADAS_EVENT, onFotosAtualizadas)
    return () => {
      window.removeEventListener(FOTOS_OS_ATUALIZADAS_EVENT, onFotosAtualizadas)
    }
  }, [ativo, osId, recarregar])

  const contagemPorItem = useMemo(
    () => contarFotosPorItemChecklist(fotos),
    [fotos]
  )

  return {
    fotos,
    setFotos,
    carregando,
    erro,
    recarregar,
    contagemPorItem,
  }
}
