import { PostgrestClient } from '@supabase/postgrest-js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const postgrest = new PostgrestClient(`${supabaseUrl}/rest/v1`, {
  headers: {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
  },
  fetch,
})

// Drop-in replacement: supabase.from('table') works the same
export const supabase = { from: (table) => postgrest.from(table) }
