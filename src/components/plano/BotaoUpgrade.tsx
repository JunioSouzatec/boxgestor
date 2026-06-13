import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface BotaoUpgradeProps {
  className?: string
  size?: 'default' | 'sm' | 'lg'
  variant?: 'default' | 'outline'
}

export function BotaoUpgrade({
  className,
  size = 'sm',
  variant = 'default',
}: BotaoUpgradeProps) {
  return (
    <Button asChild size={size} variant={variant} className={cn('gap-2', className)}>
      <Link to="/planos">
        Fazer upgrade
        <ArrowUpRight className="h-4 w-4" />
      </Link>
    </Button>
  )
}
