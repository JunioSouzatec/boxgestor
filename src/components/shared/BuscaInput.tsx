import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

interface BuscaInputProps {
  valor: string
  onChange: (valor: string) => void
  placeholder?: string
  className?: string
}

export function BuscaInput({
  valor,
  onChange,
  placeholder = 'Buscar...',
  className,
}: BuscaInputProps) {
  return (
    <div className={`relative ${className ?? ''}`}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
      />
    </div>
  )
}
