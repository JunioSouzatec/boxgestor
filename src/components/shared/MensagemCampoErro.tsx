interface MensagemCampoErroProps {
  mensagem?: string
}

export function MensagemCampoErro({ mensagem }: MensagemCampoErroProps) {
  if (!mensagem) return null
  return <p className="text-xs text-destructive">{mensagem}</p>
}
