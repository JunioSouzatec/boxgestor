interface PageHeaderProps {
  titulo: React.ReactNode
  descricao?: React.ReactNode
  acoes?: React.ReactNode
}

export function PageHeader({ titulo, descricao, acoes }: PageHeaderProps) {
  return (
    <div className="mb-6 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{titulo}</h1>
        {descricao && (
          <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>
        )}
      </div>
      {acoes && (
        <div className="flex min-w-0 flex-wrap items-center gap-2">{acoes}</div>
      )}
    </div>
  )
}
