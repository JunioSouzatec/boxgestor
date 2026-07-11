import { LockKeyhole } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { Button } from '@/components/ui/button'
import { useAutorizacaoValores } from '@/context/AutorizacaoValoresContext'
import { podeEditarValoresLinhaOS } from '@/services/auth/permissions'
import { formatarMoeda } from '@/lib/utils'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { AuthUser } from '@/types/auth'

interface MoneyInputComPinProps {
  user: AuthUser | null
  configuracao: ConfiguracaoOficina
  campoPinId: string
  onSolicitarAutorizacaoPin?: (campoId: string) => void | Promise<boolean | void>
  onRegistrarAlteracaoValor?: (
    campo: string,
    valorAnterior: number,
    valorNovo: number
  ) => void
  campoHistorico?: string
  value: number
  onChange: (value: number) => void
  id?: string
  className?: string
  disabled?: boolean
}

export function MoneyInputComPin({
  user,
  configuracao,
  campoPinId,
  onSolicitarAutorizacaoPin,
  onRegistrarAlteracaoValor,
  campoHistorico,
  value,
  onChange,
  id,
  className,
  disabled = false,
}: MoneyInputComPinProps) {
  const authRef = user ?? 'dono'
  const ehMecanico = user?.papel === 'mecanico'
  const { campoEstaAutorizado, consumirAutorizacao } = useAutorizacaoValores()
  const autorizadoPin = campoEstaAutorizado(campoPinId)
  const podeEditar = podeEditarValoresLinhaOS(authRef, configuracao, { autorizadoPin })
  const valorBaselineRef = useRef(value)
  const ultimoValorRef = useRef(value)
  const estavaAutorizadoRef = useRef(false)

  useEffect(() => {
    ultimoValorRef.current = value
  }, [value])

  useEffect(() => {
    if (autorizadoPin) {
      valorBaselineRef.current = value
      ultimoValorRef.current = value
      estavaAutorizadoRef.current = true
    }
  }, [autorizadoPin, value])

  useEffect(() => {
    return () => {
      if (estavaAutorizadoRef.current) {
        consumirAutorizacao(campoPinId)
        estavaAutorizadoRef.current = false
      }
    }
  }, [campoPinId, consumirAutorizacao])

  function finalizarEdicao() {
    if (!ehMecanico || !estavaAutorizadoRef.current) return

    const anterior = valorBaselineRef.current
    const novo = ultimoValorRef.current
    if (onRegistrarAlteracaoValor && Math.abs(anterior - novo) >= 0.009) {
      onRegistrarAlteracaoValor(campoHistorico ?? 'Valor', anterior, novo)
    }

    consumirAutorizacao(campoPinId)
    estavaAutorizadoRef.current = false
  }

  if (!disabled && (!ehMecanico || podeEditar)) {
    return (
      <MoneyInput
        id={id}
        className={className}
        value={value}
        disabled={disabled || !podeEditar}
        onChange={(novo) => {
          ultimoValorRef.current = novo
          onChange(novo)
        }}
        onBlur={() => {
          finalizarEdicao()
        }}
      />
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-10 min-w-[8rem] flex-1 items-center rounded-md border border-border bg-muted/30 px-3 text-sm font-medium tabular-nums">
          {formatarMoeda(value)}
        </div>
        {onSolicitarAutorizacaoPin && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => void onSolicitarAutorizacaoPin(campoPinId)}
          >
            <LockKeyhole className="h-3.5 w-3.5" />
            Alterar com PIN
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Alteração de valor requer PIN do dono/admin.
      </p>
    </div>
  )
}
