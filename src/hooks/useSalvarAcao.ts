import { useCallback, useState } from 'react'
import { useToast } from '@/context/ToastContext'

export interface OpcoesSalvarAcao {
  acao: () => void | Promise<void>
  sucesso: string
  erro?: string
  onSuccess?: () => void
  /** Validação síncrona — retorna mensagem de erro ou null */
  validar?: () => string | null
}

export function useSalvarAcao() {
  const { toast } = useToast()
  const [salvando, setSalvando] = useState(false)

  const executar = useCallback(
    async (opcoes: OpcoesSalvarAcao) => {
      if (salvando) return false

      const erroValidacao = opcoes.validar?.()
      if (erroValidacao) {
        toast.atencao(erroValidacao)
        return false
      }

      setSalvando(true)
      try {
        await opcoes.acao()
        toast.sucesso(opcoes.sucesso)
        opcoes.onSuccess?.()
        return true
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('[Craft] Erro ao salvar:', err)
        }
        toast.erro(opcoes.erro ?? 'Não foi possível salvar. Tente novamente.')
        return false
      } finally {
        setSalvando(false)
      }
    },
    [salvando, toast]
  )

  return { executar, salvando }
}
