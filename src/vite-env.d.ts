/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_TODAY?: string
  /** '1': honor ?today= / VITE_TODAY in a production build (e2e against a preview build). */
  readonly VITE_ALLOW_TODAY?: string
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}
