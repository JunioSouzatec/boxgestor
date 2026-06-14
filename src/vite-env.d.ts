/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** local | supabase — padrão: local */
  readonly VITE_CRAFT_PERSISTENCE?: string
  /** local | supabase — padrão: local (demo) */
  readonly VITE_CRAFT_AUTH?: string
  /** E-mails do Administrador do Sistema (dev/suporte), separados por vírgula */
  readonly VITE_SYSTEM_ADMIN_EMAILS?: string
  /** @deprecated Use VITE_SYSTEM_ADMIN_EMAILS */
  readonly VITE_CRAFT_ADMIN_EMAILS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
