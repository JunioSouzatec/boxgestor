import { forwardRef, useEffect, useRef, useState, type ChangeEvent, type FocusEvent, type InputHTMLAttributes } from 'react'
import { Input } from '@/components/ui/input'
import {
  formatMoneyDisplay,
  formatMoneyEditable,
  parseMoneyInput,
  sanitizeMoneyTyping,
} from '@/lib/money'
import { cn } from '@/lib/utils'

export interface MoneyInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: number
  onChange: (value: number) => void
  /** Limpa o campo ao focar quando o valor é zero (padrão: true) */
  limparZeroAoFocar?: boolean
}

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, className, limparZeroAoFocar = true, onFocus, onBlur, ...props }, ref) => {
    const [focused, setFocused] = useState(false)
    const [text, setText] = useState('')
    const inputRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
      if (!focused) {
        setText(formatMoneyDisplay(value))
      }
    }, [value, focused])

    function setRefs(el: HTMLInputElement | null) {
      inputRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) ref.current = el
    }

    function handleFocus(e: FocusEvent<HTMLInputElement>) {
      setFocused(true)
      if (value === 0 && limparZeroAoFocar) {
        setText('')
      } else {
        setText(formatMoneyEditable(value))
      }
      onFocus?.(e)
    }

    function handleBlur(e: FocusEvent<HTMLInputElement>) {
      setFocused(false)
      const parsed = parseMoneyInput(text)
      onChange(parsed)
      setText(formatMoneyDisplay(parsed))
      onBlur?.(e)
    }

    function handleChange(e: ChangeEvent<HTMLInputElement>) {
      const sanitized = sanitizeMoneyTyping(e.target.value)
      setText(sanitized)
      onChange(parseMoneyInput(sanitized))
    }

    return (
      <Input
        {...props}
        ref={setRefs}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={focused ? text : formatMoneyDisplay(value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={handleChange}
        className={cn(
          'tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          className
        )}
        placeholder={props.placeholder ?? 'R$ 0,00'}
      />
    )
  }
)

MoneyInput.displayName = 'MoneyInput'
