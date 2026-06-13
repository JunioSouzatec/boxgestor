import { Outlet, Link } from 'react-router-dom'

export function AuthLayout() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-950/20 via-background to-background" />
      <div className="pointer-events-none absolute -left-32 top-1/4 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-1/4 h-64 w-64 rounded-full bg-amber-500/5 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/login" className="inline-flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-lg shadow-primary/20">
              C
            </div>
            <div className="text-left">
              <p className="text-xl font-bold tracking-tight">Craft</p>
              <p className="text-xs text-muted-foreground">Gestão de Oficina</p>
            </div>
          </Link>
        </div>

        <div className="rounded-xl border border-border bg-card/80 p-6 shadow-xl backdrop-blur-sm sm:p-8">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
