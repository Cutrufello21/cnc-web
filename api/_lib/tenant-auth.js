// api/_lib/tenant-auth.js
//
// JWT-only auth + tenant resolution for v2 write endpoints (currently /api/db-v2).
//
// Differs from requireAuth():
//   - No API_SECRET path. Tokens equal to API_SECRET are explicitly rejected
//     so that v2 cannot accept the build-time secret legacy /api/db accepts;
//     otherwise tenant scoping could be bypassed by anyone with the bundle.
//   - No anonymous fallback. Missing or invalid JWT always returns 401.
//   - Resolves the caller's tenant_id from profiles and the tenant's status
//     from tenants. Two PostgREST round-trips (matches /api/tenant.js).
//   - Gates on tenants.status ∈ ('active','trial'). Suspended/archived
//     tenants get 403, even if the JWT is otherwise valid.
//
// On success: returns { user, tenantId, tenantStatus }.
// On failure: sends a typed JSON error response and returns null. Caller's
// pattern is `const auth = await requireTenantAuth(req, res); if (!auth) return`.
//
// Error codes:
//   401 unauthorized       — missing/invalid token, or token === API_SECRET
//   401 no_tenant_binding  — profile missing, profile.tenant_id null, or
//                            profile.tenant_id points to a nonexistent tenants row
//   403 tenant_not_active  — tenant.status not in ('active','trial')
//   500 auth_internal      — unexpected DB/network failure during resolution
//
// Env:
//   TENANT_AUTH_VERBOSE=true  → log every 4xx denial via console.warn. Off
//   by default (silent on user-driven 401/403 to avoid alert fatigue at
//   steady state). Turn on during cutover windows for full visibility.

import { supabase } from './supabase.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const API_SECRET = process.env.API_SECRET

function extractToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization || ''
  // Permissive on input format: case-insensitive "Bearer", any whitespace
  // between scheme and token. Real clients sometimes send "bearer" or
  // "Bearer  " (double space). Strict on credential validity below.
  const m = auth.match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : null
}

async function validateJwt(token) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
    })
    if (!res.ok) return null
    const user = await res.json()
    return user?.id ? user : null
  } catch (err) {
    // Network blip vs real auth bug looks identical to the caller (both 401).
    // Leave a breadcrumb so we can tell them apart in Vercel logs.
    console.error('[tenant-auth] JWT validation network error:', err?.message || err)
    return null
  }
}

function fail(res, status, error, message) {
  // Steady-state: silent on user-driven denials. During cutover (or any
  // high-stakes parallel-write window), flip TENANT_AUTH_VERBOSE=true and
  // every denial leaves a log line for triage.
  if (process.env.TENANT_AUTH_VERBOSE === 'true') {
    console.warn(`[tenant-auth] ${status} ${error}: ${message}`)
  }
  res.status(status).json({ error, message })
  return null
}

export async function requireTenantAuth(req, res) {
  const token = extractToken(req)

  // Reject missing tokens AND any token equal to API_SECRET. The latter is
  // accepted by legacy /api/db; v2 must never honor it.
  if (!token || (API_SECRET && token === API_SECRET)) {
    return fail(res, 401, 'unauthorized', 'Missing or invalid bearer token')
  }

  const user = await validateJwt(token)
  if (!user) {
    return fail(res, 401, 'unauthorized', 'Missing or invalid bearer token')
  }

  try {
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .maybeSingle()

    if (profileErr) throw profileErr
    if (!profile || profile.tenant_id == null) {
      return fail(res, 401, 'no_tenant_binding',
        'Authenticated user has no tenant binding')
    }

    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('status')
      .eq('id', profile.tenant_id)
      .maybeSingle()

    if (tenantErr) throw tenantErr
    if (!tenant) {
      return fail(res, 401, 'no_tenant_binding',
        'Tenant binding points to a nonexistent tenant')
    }

    if (tenant.status !== 'active' && tenant.status !== 'trial') {
      return fail(res, 403, 'tenant_not_active',
        `Tenant status is "${tenant.status}"`)
    }

    return {
      user,
      tenantId: profile.tenant_id,
      tenantStatus: tenant.status,
    }
  } catch (err) {
    console.error('[tenant-auth] resolution failed:', err?.message || err)
    return fail(res, 500, 'auth_internal', 'Tenant resolution failed')
  }
}
