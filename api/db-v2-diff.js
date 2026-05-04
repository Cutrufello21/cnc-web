// api/db-v2-diff.js
//
// Audit logger for the /api/db → /api/db-v2 parallel-write cutover window.
//
// Receives one diff record per dual-write call from the cnc-web client
// wrapper (src/lib/db.js). Computes a categorical match_status from the
// pair of v1/v2 responses + statuses, then service-role-inserts one row
// into public.db_v2_diff.
//
// Auth: same pattern as /api/db-v2 — JWT-only via requireTenantAuth.
// API_SECRET fallback rejected. Anonymous fallback rejected. The audit
// table is service-role-only at the DB layer; the auth check here stops
// random callers from spamming the audit log with synthetic rows AND
// gives us tenant_id / user_id stamping for free.
//
// Bucketing rules (computeMatchStatus):
//   - Both 4xx/5xx                                → both_failed
//   - v1 wrote rows, v2 returned no rows          → v1_only_succeeded
//   - v2 wrote rows, v1 returned no rows          → v2_only_succeeded
//   - Both wrote rows, equivalent after stripping → match
//   - Both wrote rows, differ after stripping     → mismatch
//   - Both 2xx, both wrote zero rows              → match (no-op)
//
// "Wrote rows" = HTTP 2xx AND response.data is a non-empty array. This
// handles the cross-tenant scope case where v2 returns 200 with data:[]
// because tenant scoping filtered out the matched row — that's a real
// asymmetry, bucketed as v1_only_succeeded, not match.
//
// Strip-before-comparing: id, created_at, updated_at. These are auto-
// generated and will always differ between two independent writes;
// removing them lets us detect actual data drift. Other *_id columns
// (tenant_id, stop_id, driver_id, etc.) are user-supplied in this
// codebase and SHOULD match — they're left in so v1/v2 disagreement on
// them is caught.
//
// Storage shape: v1_response and v2_response are stored verbatim as
// jsonb (the bodies, not wrapped). v1_status / v2_status are accepted
// as inputs and used for bucketing but NOT stored separately — the
// db_v2_diff table has no status columns and the response body usually
// carries enough info to triage post-hoc (errors include "error" +
// "message" fields). If we need status as a queryable column later,
// add columns then or derive from body shape.
//
// Error codes:
//   401 unauthorized            — bubbled from tenant-auth
//   401 no_tenant_binding       — bubbled from tenant-auth
//   403 tenant_not_active       — bubbled from tenant-auth
//   400 invalid_body            — request body not parseable as JSON object
//   400 missing_fields          — required input missing or wrong type
//   400 invalid_operation       — operation not in allowed set
//   500 db_error                — Supabase insert failed (its message in `message`)
//
// Env:
//   TENANT_AUTH_VERBOSE=true → log every 4xx denial via console.warn.
//   Off by default; flip on during cutover for full visibility.

import { supabase } from './_lib/supabase.js'
import { parseBody } from './_lib/sheets.js'
import { requireTenantAuth } from './_lib/tenant-auth.js'

const STRIP_FIELDS = new Set(['id', 'created_at', 'updated_at'])
const ALLOWED_OPERATIONS = new Set(['insert', 'update', 'upsert', 'delete'])

function fail(res, status, error, message) {
  // Reuses the same env toggle as tenant-auth.js so one switch controls
  // verbosity across the whole parallel-write surface.
  if (process.env.TENANT_AUTH_VERBOSE === 'true') {
    console.warn(`[db-v2-diff] ${status} ${error}: ${message}`)
  }
  res.status(status).json({ error, message })
  return null
}

function extractData(response) {
  return response && Array.isArray(response.data) ? response.data : []
}

// Stable stringification with sorted object keys so that two equivalent
// rows with different key insertion order compare equal.
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  const keys = Object.keys(value).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}'
}

function stripAutoFields(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row
  const cleaned = {}
  for (const [k, v] of Object.entries(row)) {
    if (!STRIP_FIELDS.has(k)) cleaned[k] = v
  }
  return cleaned
}

function sameShape(v1Data, v2Data) {
  if (v1Data.length !== v2Data.length) return false
  for (let i = 0; i < v1Data.length; i++) {
    const a = canonicalJson(stripAutoFields(v1Data[i]))
    const b = canonicalJson(stripAutoFields(v2Data[i]))
    if (a !== b) return false
  }
  return true
}

function computeMatchStatus(v1Response, v2Response, v1Status, v2Status) {
  const v1Ok = Number.isInteger(v1Status) && v1Status >= 200 && v1Status < 300
  const v2Ok = Number.isInteger(v2Status) && v2Status >= 200 && v2Status < 300

  if (!v1Ok && !v2Ok) return 'both_failed'

  // "Wrote" = 2xx AND non-empty data array. Empty data on a 2xx happens
  // when an UPDATE/DELETE matched zero rows — for v2, this is the
  // tenant-scope-filtered-out case, which is a real asymmetry.
  const v1Data = extractData(v1Response)
  const v2Data = extractData(v2Response)
  const v1Wrote = v1Ok && v1Data.length > 0
  const v2Wrote = v2Ok && v2Data.length > 0

  if (v1Wrote && !v2Wrote) return 'v1_only_succeeded'
  if (v2Wrote && !v1Wrote) return 'v2_only_succeeded'
  if (!v1Wrote && !v2Wrote) return 'match'  // both 2xx no-op (e.g. UPDATE WHERE matched nothing on both sides)

  return sameShape(v1Data, v2Data) ? 'match' : 'mismatch'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed', message: 'POST only' })
  }

  const auth = await requireTenantAuth(req, res)
  if (!auth) return
  const { tenantId, user } = auth

  let body
  try {
    body = await parseBody(req)
  } catch {
    return fail(res, 400, 'invalid_body',
      'Request body could not be parsed as JSON')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail(res, 400, 'invalid_body',
      'Request body must be a JSON object')
  }

  const { table_name, operation, v1_response, v2_response, v1_status, v2_status } = body

  // Validate inputs. v1_response/v2_response are checked for PRESENCE
  // (any value, including null, is acceptable — error responses can be
  // null-bodied). Status fields must be integers.
  const missing = []
  if (typeof table_name !== 'string' || !table_name) missing.push('table_name')
  if (typeof operation !== 'string' || !operation) missing.push('operation')
  if (!Number.isInteger(v1_status)) missing.push('v1_status')
  if (!Number.isInteger(v2_status)) missing.push('v2_status')
  if (!('v1_response' in body)) missing.push('v1_response')
  if (!('v2_response' in body)) missing.push('v2_response')

  if (missing.length > 0) {
    return fail(res, 400, 'missing_fields',
      `Required fields missing or wrong type: ${missing.join(', ')}`)
  }

  if (!ALLOWED_OPERATIONS.has(operation)) {
    return fail(res, 400, 'invalid_operation',
      `Unknown operation "${operation}". Allowed: ${[...ALLOWED_OPERATIONS].join(', ')}`)
  }

  const matchStatus = computeMatchStatus(v1_response, v2_response, v1_status, v2_status)

  try {
    const { data, error } = await supabase
      .from('db_v2_diff')
      .insert({
        table_name,
        operation,
        v1_response,
        v2_response,
        match_status: matchStatus,
        user_id: user.id,
        tenant_id: tenantId,
      })
      .select('id')
      .single()

    if (error) throw error

    return res.status(200).json({
      success: true,
      match_status: matchStatus,
      diff_id: data.id,
    })
  } catch (err) {
    console.error('[db-v2-diff insert] failed:', err?.message || err)
    return fail(res, 500, 'db_error', err?.message || 'Database error')
  }
}
