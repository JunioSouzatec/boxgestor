import { Outlet } from 'react-router-dom'
import { MarcaOficinaAuth } from '@/components/oficina/MarcaOficinaAuth'

export function AuthLayout() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-950/20 via-background to-background" />

      <div className="relative w-full max-w-lg">
        <div className="mb-8 flex justify-center">
          <MarcaOficinaAuth />
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-md sm:p-8">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
