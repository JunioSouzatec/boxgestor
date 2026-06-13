import { ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { StatusOSBadge } from '@/components/shared/StatusBadges'
import { cn } from '@/lib/utils'
import type { StatusOS } from '@/types'
import { STATUS_OS } from '@/types'

interface StatusOSRapidoProps {
  status: StatusOS
  onAlterarStatus: (status: StatusOS) => void
  className?: string
}

export function StatusOSRapido({ status, onAlterarStatus, className }: StatusOSRapidoProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1 rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary/50 cursor-pointer',
            className
          )}
          aria-label="Alterar status da OS"
        >
          <StatusOSBadge status={status} />
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>Alterar status</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {STATUS_OS.map((item) => (
          <DropdownMenuItem
            key={item.value}
            onClick={() => onAlterarStatus(item.value)}
            className={cn(item.value === status && 'bg-muted')}
          >
            <StatusOSBadge status={item.value} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
