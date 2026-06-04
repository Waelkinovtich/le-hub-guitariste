import { createClient } from '@supabase/supabase-js'

const env = import.meta.env ?? {}

const supabaseUrl = env.VITE_SUPABASE_URL?.trim?.() ?? env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY?.trim?.() ?? env.VITE_SUPABASE_ANON_KEY ?? ''

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    String(supabaseUrl).startsWith('https://') &&
    String(supabaseAnonKey).length > 20,
)

if (!isSupabaseConfigured && env.DEV) {
  console.warn(
    '[Hub du Guitariste] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY invalides ou absents. ' +
      'Vérifiez .env.local puis redémarrez `npm run dev`.',
  )
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
