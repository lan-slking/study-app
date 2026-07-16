import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  throw new Error('Manjkajo Supabase nastavitve. Preveri datoteko .env.')
}

// Be explicit about browser-only auth settings. This avoids an edge case in
// recent Supabase Auth clients where automatic storage detection can fail.
export const supabase = createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    flowType: 'implicit',
  },
})
