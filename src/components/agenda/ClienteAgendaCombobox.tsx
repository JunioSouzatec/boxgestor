import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { formatarTelefone } from '@/lib/utils'
import { filtrarClientesAgenda } from '@/lib/busca-cliente'
import type { Cliente } from '@/types/cliente'
import type { Moto } from '@/types/moto'

interface ClienteAgendaComboboxProps {
  clientes: Cliente[]
  motos: Moto[]
  /** ID do cliente cadastrado, ou vazio quando nenhum / futuro guest. */
  value: string
  onChange: (clienteId: string) => void
  placeholder?: string
  disabled?: boolean
}

/**
 * Autocomplete isolado de cliente cadastrado.
 * Não exige seleção: `value=""` é estado válido (Agenda guest pode coexistir).
 */
export function ClienteAgendaCombobox({
  clientes,
  motos,
  value,
  onChange,
  placeholder = 'Buscar por nome, telefone ou placa',
  disabled = false,
}: ClienteAgendaComboboxProps) {
  const selecionado = clientes.find((c) => c.id === value)
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)

  const query = aberto || !selecionado ? busca : selecionado.nome
  const resultados = useMemo(
    () => filtrarClientesAgenda(clientes, motos, aberto ? busca : ''),
    [clientes, motos, aberto, busca]
  )

  return (
    <div className="relative">
      <Input
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        onFocus={() => {
          setAberto(true)
          setBusca(selecionado?.nome ?? '')
        }}
        onChange={(e) => {
          setAberto(true)
          setBusca(e.target.value)
          if (value) onChange('')
        }}
        onBlur={() => {
          window.setTimeout(() => setAberto(false), 150)
        }}
      />
      {aberto && (
        <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-background py-1 shadow-md">
          {resultados.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Nenhum cliente encontrado.</li>
          ) : (
            resultados.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(c.id)
                    setBusca(c.nome)
                    setAberto(false)
                  }}
                >
                  <span className="font-medium">{c.nome}</span>
                  <span className="text-xs text-muted-foreground">
                    {[c.telefone ? formatarTelefone(c.telefone) : '', c.placa]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
