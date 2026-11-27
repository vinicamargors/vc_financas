import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Service role: ignora RLS. Sempre filtrar por user_id explicitamente.
export function createAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
