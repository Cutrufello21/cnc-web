// api/db-v2.js
//
// Tenant-scoped replacement for /api/db. JWT-only auth, derives tenant_id
// server-side from profiles, stamps it onto every INSERT/UPDATE/UPSERT
// payload and appends it to UPDATE/DELETE match clauses.
//
// Whitelist parity with v1: same 21 tables, same per-table operations.
// Behavioral differences from /api/db:
//   - Auth: requires a Supabase JWT. Rejects API_SECRET. No anonymous fallback.
//   - tenant_id on data (insert/update/upsert): stamped server-side from the
//     caller's JWT-bound profile. A caller-supplied tenant_id is allowed only
//     if it matches the derived value (idempotent); mismatch → 403.
//   - tenant_id on match (update/delete): always appended, scoping the write
//     to the caller's tenant. Cross-tenant match misses return data:[] (no
//     404 — returning 404 would leak existence of other tenants' rows).
//   - geocode_cache stays untenanted (tenantScoped:false): auth required, no
//     injection. Intentionally shared cache, no PHI.
//
// Response shape unchanged: { success:true, data: rows[] } | { error, message }.
//
// Error codes:
//   401 unauthorized            — bubbled from tenant-auth
//   401 no_tenant_binding       — bubbled from tenant-auth
//   403 tenant_not_active       — bubbled from tenant-auth
//   403 tenant_mismatch         — caller-supplied tenant_id ≠ derived
//   403 forbidden_table         — table not in ALLOWED_V2
//   403 forbidden_operation     — op not allowed for that table
//   400 invalid_body            — request body not parseable as JSON
//   400 missing_table_or_operation
//   400 missing_match           — update/delete without a match object
//   400 unknown_operation       — not insert/update/delete/upsert
//   500 db_error                — Supabase returned an error (its message in `message`)

import { supabase } from './_lib/supabase.js'
import { parseBody } from './_lib/sheets.js'
import { requireTenantAuth } from './_lib/tenant-auth.js'

// Whitelist. Parity with api/db.js's ALLOWED. Adding a tenantScoped:true
// table here REQUIRES the table to have a NOT NULL tenant_id column with
// FK to public.tenants(id). Verified by the post-deploy check SQL, not at
// request time. Do not flip a table to tenantScoped:false without a
// considered reason — geocode_cache is the only justified exception today.
const ALLOWED_V2 = {
  time_off_requests:      { ops: ['insert', 'update'],                     tenantScoped: true  },
  delivery_confirmations: { ops: ['insert'],                               tenantScoped: true  },
  driver_routes:          { ops: ['upsert'],                               tenantScoped: true  },
  daily_stops:            { ops: ['update', 'delete'],                     tenantScoped: true  },
  driver_notifications:   { ops: ['update'],                               tenantScoped: true  },
  stop_reconciliation:    { ops: ['insert', 'update', 'upsert'],           tenantScoped: true  },
  driver_favorites:       { ops: ['insert', 'delete'],                     tenantScoped: true  },
  mileage_log:            { ops: ['upsert'],                               tenantScoped: true  },
  address_notes:          { ops: ['upsert'],                               tenantScoped: true  },
  order_deletions:        { ops: ['insert'],                               tenantScoped: true  },
  drivers:                { ops: ['update'],                               tenantScoped: true  },
  routing_rules:          { ops: ['insert', 'update', 'upsert', 'delete'], tenantScoped: true  },
  schedule_overrides:     { ops: ['insert', 'update', 'upsert'],           tenantScoped: true  },
  shift_offers:           { ops: ['insert', 'update', 'upsert'],           tenantScoped: true  },
  driver_schedule:        { ops: ['insert', 'update', 'upsert'],           tenantScoped: true  },
  announcements:          { ops: ['insert', 'update', 'delete'],           tenantScoped: true  },
  poll_responses:         { ops: ['insert', 'delete'],                     tenantScoped: true  },
  announcement_reads:     { ops: ['insert'],                               tenantScoped: true  },
  geocode_cache:          { ops: ['upsert'],                               tenantScoped: false },
  address_corrections:    { ops: ['insert'],                               tenantScoped: true  },
  pickup_requests:        { ops: ['insert', 'update', 'upsert', 'delete'], tenantScoped: true  },
}

function fail(res, status, error, message) {
  // Reuses the same env toggle as tenant-auth.js so one switch controls
  // verbosity across both files during the parallel-write cutover window.
  if (process.env.TENANT_AUTH_VERBOSE === 'true') {
    console.warn(`[db-v2] ${status} ${error}: ${message}`)
  }
  res.status(status).json({ error, message })
  return null
}

// Stamp tenant_id onto data (single object or array). Returns the stamped
// data, or null after sending a 403 on mismatch. Pass-through for
// non-object data (DB layer surfaces the actual shape error).
function stampDataWithTenant(data, tenantId, res) {
  if (Array.isArray(data)) {
    for (const row of data) {
      if (row && row.tenant_id != null && row.tenant_id !== tenantId) {
        return fail(res, 403, 'tenant_mismatch',
          `Row tenant_id ${row.tenant_id} does not match caller tenant ${tenantId}`)
      }
    }
    return data.map(row => ({ ...row, tenant_id: tenantId }))
  }
  if (data && typeof data === 'object') {
    if (data.tenant_id != null && data.tenant_id !== tenantId) {
      return fail(res, 403, 'tenant_mismatch',
        `Payload tenant_id ${data.tenant_id} does not match caller tenant ${tenantId}`)
    }
    return { ...data, tenant_id: tenantId }
  }
  return data
}

// Append tenant_id to a match clause. 400 if match is missing/non-object.
// 403 if caller supplied a mismatched match.tenant_id.
function stampMatchWithTenant(match, tenantId, res) {
  if (!match || typeof match !== 'object' || Array.isArray(match)) {
    return fail(res, 400, 'missing_match',
      'match clause is required and must be an object')
  }
  if (match.tenant_id != null && match.tenant_id !== tenantId) {
    return fail(res, 403, 'tenant_mismatch',
      `Match tenant_id ${match.tenant_id} does not match caller tenant ${tenantId}`)
  }
  return { ...match, tenant_id: tenantId }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed', message: 'POST only' })
  }

  const auth = await requireTenantAuth(req, res)
  if (!auth) return
  const { tenantId } = auth

  let body
  try {
    body = await parseBody(req)
  } catch {
    return fail(res, 400, 'invalid_body',
      'Request body could not be parsed as JSON')
  }

  const { table, operation, data, match, onConflict } = body || {}

  if (!table || !operation) {
    return fail(res, 400, 'missing_table_or_operation',
      'Both table and operation are required')
  }

  const config = ALLOWED_V2[table]
  if (!config) {
    return fail(res, 403, 'forbidden_table',
      `Table "${table}" is not accessible via this endpoint`)
  }
  if (!config.ops.includes(operation)) {
    return fail(res, 403, 'forbidden_operation',
      `Operation "${operation}" is not allowed on table "${table}"`)
  }

  // === tenant_id injection ===
  let stampedData = data
  let stampedMatch = match

  if (config.tenantScoped) {
    if (operation === 'insert' || operation === 'upsert') {
      stampedData = stampDataWithTenant(data, tenantId, res)
      if (stampedData === null) return
    } else if (operation === 'update') {
      stampedData = stampDataWithTenant(data, tenantId, res)
      if (stampedData === null) return
      stampedMatch = stampMatchWithTenant(match, tenantId, res)
      if (stampedMatch === null) return
    } else if (operation === 'delete') {
      stampedMatch = stampMatchWithTenant(match, tenantId, res)
      if (stampedMatch === null) return
    }
  } else if (operation === 'update' || operation === 'delete') {
    // Defensive: no untenanted table currently allows update/delete in
    // ALLOWED_V2. If one is added later, this branch ensures the match
    // clause is at least present rather than letting the query run unbounded.
    if (!match || typeof match !== 'object' || Array.isArray(match)) {
      return fail(res, 400, 'missing_match',
        'match clause is required and must be an object')
    }
  }

  try {
    let rows

    if (operation === 'insert') {
      const { data: result, error } = await supabase.from(table).insert(stampedData).select()
      if (error) throw error
      rows = result
    } else if (operation === 'update') {
      let q = supabase.from(table).update(stampedData)
      for (const [k, v] of Object.entries(stampedMatch)) q = q.eq(k, v)
      const { data: result, error } = await q.select()
      if (error) throw error
      rows = result
    } else if (operation === 'delete') {
      let q = supabase.from(table).delete()
      for (const [k, v] of Object.entries(stampedMatch)) q = q.eq(k, v)
      const { data: result, error } = await q.select()
      if (error) throw error
      rows = result
    } else if (operation === 'upsert') {
      const opts = onConflict ? { onConflict } : {}
      const { data: result, error } = await supabase.from(table).upsert(stampedData, opts).select()
      if (error) throw error
      rows = result
    } else {
      return fail(res, 400, 'unknown_operation', `Unknown operation: ${operation}`)
    }

    return res.status(200).json({ success: true, data: rows })
  } catch (err) {
    console.error(`[db-v2 ${operation}] ${table}:`, err?.message || err)
    return fail(res, 500, 'db_error', err?.message || 'Database error')
  }
}
