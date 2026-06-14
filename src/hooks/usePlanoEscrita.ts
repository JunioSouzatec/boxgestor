import { useCallback } from 'react'
import { useAssinatura } from '@/context/AssinaturaContext'
import { useToast } from '@/context/ToastContext'
import { mensagemTesteExpirado } from '@/services/assinatura/plano-features'

/** Verifica se a oficina pode salvar/criar (bloqueia após fim do Teste Premium). */
export function usePlanoEscrita() {
  const { podeEscrever, testeExpirado } = useAssinatura()
  const { toast } = useToast()

  const verificarEscrita = useCallback((): boolean => {
    if (!podeEscrever) {
      toast.atencao(mensagemTesteExpirado())
      return false
    }
    return true
  }, [podeEscrever, toast])

  return { podeEscrever, testeExpirado, verificarEscrita }
}
