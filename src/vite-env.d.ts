/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** local | supabase — em PROD com Supabase, padrão supabase */
  readonly VITE_CRAFT_PERSISTENCE?: string
  /** local | supabase — em PROD com Supabase, padrão supabase */
  readonly VITE_CRAFT_AUTH?: string
  /** Nome exibido do app (padrão: BoxGestor) */
  readonly VITE_APP_NAME?: string
  /** URL pública do deploy (convites, auth redirects) */
  readonly VITE_APP_URL?: string
  /** E-mails do Administrador do Sistema (dev/suporte), separados por vírgula */
  readonly VITE_SYSTEM_ADMIN_EMAILS?: string
  /** @deprecated Use VITE_SYSTEM_ADMIN_EMAILS */
  readonly VITE_CRAFT_ADMIN_EMAILS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
