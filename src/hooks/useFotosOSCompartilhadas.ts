import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  carregarFotosOsComPendentesLocais,
  revogarObjectUrls,
} from '@/services/os/offline-service-order-photos.service'
import {
  contarFotosPorItemChecklist,
  FOTOS_OS_ATUALIZADAS_EVENT,
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

export interface RecarregarFotosOsOpcoes {
  /** Usa id estável recém-criado (rascunho) antes do state React atualizar */
  osId?: string
  osNumero?: number
}

/**
 * Fonte única de fotos da OS (checklist + galeria).
 * Remotas (quando online) + pendentes locais (IndexedDB).
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
  const objectUrlsRef = useRef<string[]>([])
  const osIdRef = useRef(osId)
  const osNumeroRef = useRef(osNumero)
  const ativoRef = useRef(ativo)

  osIdRef.current = osId
  osNumeroRef.current = osNumero
  ativoRef.current = ativo

  const limparObjectUrls = useCallback(() => {
    revogarObjectUrls(objectUrlsRef.current)
    objectUrlsRef.current = []
  }, [])

  const recarregar = useCallback(
    async (opcoes?: RecarregarFotosOsOpcoes): Promise<ServiceOrderPhotoComUrl[]> => {
      const seq = ++seqRef.current
      const id = (opcoes?.osId ?? osIdRef.current)?.trim()
      const office = officeId?.trim()
      const numero = opcoes?.osNumero ?? osNumeroRef.current
      const forcarComOverride = Boolean(opcoes?.osId?.trim())

      if ((!ativoRef.current && !forcarComOverride) || !id || !office) {
        if (seqRef.current === seq) {
          if (!forcarComOverride) {
            limparObjectUrls()
            setFotos([])
            setErro(null)
            setCarregando(false)
          }
        }
        return []
      }

      setCarregando(true)
      setErro(null)

      const resultado = await carregarFotosOsComPendentesLocais({
        officeId: office,
        serviceOrderId: id,
        osNumero: numero,
      })

      if (seqRef.current !== seq) {
        if (resultado.ok && resultado.dados) {
          revogarObjectUrls(resultado.dados.objectUrls)
        }
        return resultado.ok && resultado.dados ? resultado.dados.fotos : []
      }

      limparObjectUrls()

      if (!resultado.ok || !resultado.dados) {
        setFotos([])
        setErro(resultado.erro ?? 'Não foi possível carregar as fotos.')
        setCarregando(false)
        return []
      }

      objectUrlsRef.current = resultado.dados.objectUrls
      setFotos(resultado.dados.fotos)
      setErro(
        resultado.dados.fotos.length === 0 && resultado.dados.erroRemoto
          ? resultado.dados.erroRemoto
          : null
      )
      setCarregando(false)
      return resultado.dados.fotos
    },
    [officeId, limparObjectUrls]
  )

  useEffect(() => {
    void recarregar()
  }, [recarregar, osId, osNumero, ativo])

  useEffect(() => {
    return () => {
      limparObjectUrls()
    }
  }, [limparObjectUrls])

  useEffect(() => {
    if (!ativo) return

    function onFotosAtualizadas(ev: Event) {
      const detail = (ev as CustomEvent<FotosOsAtualizadasDetail>).detail
      const idEvento = detail?.serviceOrderId?.trim()
      if (!idEvento) return
      const idAtual = osIdRef.current?.trim()
      // Aceita evento da OS atual ou rascunho recém-criado (state ainda sem id)
      if (idAtual && idEvento !== idAtual) return
      void recarregar({ osId: idEvento })
    }

    window.addEventListener(FOTOS_OS_ATUALIZADAS_EVENT, onFotosAtualizadas)
    return () => {
      window.removeEventListener(FOTOS_OS_ATUALIZADAS_EVENT, onFotosAtualizadas)
    }
  }, [ativo, recarregar])

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
