import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface CampoKmEntradaProps {
  id: string
  label?: string
  value?: number
  obrigatorio?: boolean
  erro?: string
  className?: string
  onChange: (valor: number | undefined) => void
}

export function CampoKmEntrada({
  id,
  label = 'KM de entrada',
  value,
  obrigatorio,
  erro,
  className,
  onChange,
}: CampoKmEntradaProps) {
  const [focado, setFocado] = useState(false)

  const exibirVazio = value === undefined || value === null || (value === 0 && !focado)

  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={id}>
        {label}
        {obrigatorio ? ' *' : ''}
      </Label>
      <Input
        id={id}
        type="number"
        min={0}
        placeholder="Ex: 38.000"
        value={exibirVazio ? '' : value}
        aria-invalid={!!erro}
        className={cn(erro && 'border-destructive')}
        onFocus={() => {
          setFocado(true)
          if (value === 0) onChange(undefined)
        }}
        onBlur={() => setFocado(false)}
        onChange={(e) => {
          const raw = e.target.value.trim()
          onChange(raw === '' ? undefined : Number(raw))
        }}
      />
    </div>
  )
}
