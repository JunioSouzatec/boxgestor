import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { opcoesVisiveisCombobox } from '@/lib/combobox-opcoes'
import { cn } from '@/lib/utils'

interface SearchableComboboxProps {
  id?: string
  value: string
  options: string[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function SearchableCombobox({
  id,
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  className,
}: SearchableComboboxProps) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [aberto, setAberto] = useState(false)
  const [consulta, setConsulta] = useState(value)
  const [consultaAtiva, setConsultaAtiva] = useState(false)
  const [destaque, setDestaque] = useState(0)

  const visiveis = useMemo(
    () => opcoesVisiveisCombobox(options, consulta, consultaAtiva),
    [options, consulta, consultaAtiva]
  )

  const exibido = consultaAtiva ? consulta : value

  function abrirLista() {
    setAberto(true)
    setConsultaAtiva(false)
    setConsulta(value)
    const idx = options.findIndex((o) => o === value)
    setDestaque(idx >= 0 ? idx : 0)
  }

  function escolher(opcao: string) {
    onChange(opcao)
    setConsulta(opcao)
    setConsultaAtiva(false)
    setAberto(false)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!aberto) {
        abrirLista()
        return
      }
      setDestaque((i) => Math.min(i + 1, Math.max(visiveis.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!aberto) {
        abrirLista()
        return
      }
      setDestaque((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (aberto && visiveis[destaque]) {
        e.preventDefault()
        escolher(visiveis[destaque])
      }
    } else if (e.key === 'Escape') {
      setAberto(false)
      setConsultaAtiva(false)
      setConsulta(value)
    }
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={aberto}
          aria-controls={listId}
          aria-autocomplete="list"
          value={exibido}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className="pr-9"
          onFocus={() => {
            abrirLista()
            window.requestAnimationFrame(() => inputRef.current?.select())
          }}
          onClick={() => {
            if (!aberto) abrirLista()
          }}
          onChange={(e) => {
            setConsulta(e.target.value)
            setConsultaAtiva(true)
            setAberto(true)
            setDestaque(0)
            onChange(e.target.value)
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            window.setTimeout(() => {
              if (!rootRef.current?.contains(document.activeElement)) {
                setAberto(false)
                setConsultaAtiva(false)
                setConsulta(value)
              }
            }, 120)
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground"
          aria-label="Abrir opções"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (aberto) {
              setAberto(false)
              return
            }
            inputRef.current?.focus()
            abrirLista()
          }}
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      {aberto && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-background py-1 shadow-md"
        >
          {visiveis.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              Nenhuma opção. Continue digitando para valor personalizado.
            </li>
          ) : (
            visiveis.map((opcao, i) => (
              <li key={opcao} role="option" aria-selected={opcao === value}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center px-3 py-2 text-left text-sm hover:bg-muted',
                    i === destaque && 'bg-muted',
                    opcao === value && 'font-medium'
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setDestaque(i)}
                  onClick={() => escolher(opcao)}
                >
                  {opcao}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
