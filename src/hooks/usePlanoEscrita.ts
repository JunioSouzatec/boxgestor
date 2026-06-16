import { useCallback } from 'react'
import { useAssinatura } from '@/context/AssinaturaContext'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { MSG } from '@/lib/mensagens-usuario'
import { mensagemTesteExpirado } from '@/services/assinatura/plano-features'

/** Verifica se a oficina pode salvar/criar (bloqueia após fim do Teste Premium). */
export function usePlanoEscrita() {
  const { podeEscrever: podeEscreverPlano, testeExpirado } = useAssinatura()
  const { estadoAuth } = useAuth()
  const { toast } = useToast()

  const oficinaArquivada = estadoAuth === 'oficina_arquivada'
  const podeEscrever = podeEscreverPlano && !oficinaArquivada

  const verificarEscrita = useCallback((): boolean => {
    if (oficinaArquivada) {
      toast.atencao(MSG.oficinaArquivada)
      return false
    }
    if (!podeEscreverPlano) {
      toast.atencao(mensagemTesteExpirado())
      return false
    }
    return true
  }, [oficinaArquivada, podeEscreverPlano, toast])

  return { podeEscrever, testeExpirado, verificarEscrita }
}
