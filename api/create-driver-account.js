import { supabase } from './_lib/supabase.js'
import { parseBody } from './_lib/sheets.js'
import { requireAuth } from './_lib/auth.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// Admin-create a Supabase Auth user for a new driver, with email_confirm=true
// so the driver can log in immediately. Replaces the public /auth/v1/signup
// path in Drivers.jsx, which always required email verification.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user = await requireAuth(req, res, { allowApiSecret: true })
  if (!user) return

  const { email, password, full_name, driver_number } = await parseBody(req)
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' })
  }

  try {
    // Inherit tenant_id from the calling dispatcher so the new driver lands
    // in the right tenant under the multi-tenant model.
    let tenantId = null
    if (user.id && !user.isServer && !user.isAnonymous) {
      const { data: callerProfile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle()
      tenantId = callerProfile?.tenant_id ?? null
    }

    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, role: 'driver' },
      }),
    })

    const created = await createRes.json()
    if (!createRes.ok) {
      return res.status(createRes.status).json({ error: created?.msg || created?.error_description || 'Failed to create auth user' })
    }

    const userId = created.id
    if (!userId) {
      return res.status(500).json({ error: 'Auth user created but no id returned' })
    }

    // Upsert profile. The handle_new_user trigger usually creates the row;
    // upsert covers both cases (trigger ran / didn't run).
    const profilePayload = {
      id: userId,
      role: 'driver',
      full_name: full_name || null,
      driver_id: driver_number || null,
      driver_number: driver_number || null,
      ...(tenantId != null ? { tenant_id: tenantId } : {}),
    }
    const { error: profileErr } = await supabase
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'id' })

    if (profileErr) {
      console.warn('[create-driver-account] profile upsert failed:', profileErr.message)
      // Don't fail the request — auth user exists, profile can be fixed later
    }

    return res.status(200).json({ success: true, user_id: userId, email })
  } catch (err) {
    console.error('[create-driver-account]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
