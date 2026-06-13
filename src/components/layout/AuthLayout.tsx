import { Outlet } from 'react-router-dom'
import { MarcaOficinaAuth } from '@/components/oficina/MarcaOficinaAuth'

export function AuthLayout() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-950/20 via-background to-background" />
      <div className="pointer-events-none absolute -left-32 top-1/4 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-1/4 h-64 w-64 rounded-full bg-amber-500/5 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <MarcaOficinaAuth />
        </div>

        <div className="rounded-xl border border-border bg-card/80 p-6 shadow-xl backdrop-blur-sm sm:p-8">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
