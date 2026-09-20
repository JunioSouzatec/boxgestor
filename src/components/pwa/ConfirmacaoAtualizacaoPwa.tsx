import { useEffect } from 'react'
import { useToast } from '@/context/ToastContext'
import { APP_DEPLOY_BUILT_AT, APP_DEPLOY_VERSION } from '@/generated/app-version'
import {
  consumirConfirmacaoAtualizacao,
  mensagemBoxGestorAtualizado,
} from '@/lib/pwa-update-estado'

export function ConfirmacaoAtualizacaoPwa() {
  const { toast } = useToast()

  useEffect(() => {
    if (!consumirConfirmacaoAtualizacao(APP_DEPLOY_VERSION)) return
    toast.sucesso(mensagemBoxGestorAtualizado(APP_DEPLOY_VERSION, APP_DEPLOY_BUILT_AT), 4000)
  }, [toast])

  return null
}
