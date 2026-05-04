// Client-side write helper for cnc-web. All four exports
// (dbInsert / dbUpdate / dbDelete / dbUpsert) front the legacy /api/db
// endpoint. v1 behavior is unchanged from pre-Phase-2 code.
//
// Phase 2 of the /api/db → /api/db-v2 cutover harness adds an optional
// background dual-write shadow: when VITE_PARALLEL_WRITE_ENABLED=true,
// every write performed via this module additionally fires
//   - a /api/db-v2 call (with the user's Supabase JWT)
//   - a /api/db-v2-diff audit log (with both responses + statuses)
// in the background, AFTER v1 has settled. The user-facing call always
// returns v1's response; v2/diff failures never surface.
//
// === COVERAGE GAP — read before extending ===
// 30 sites in cnc-web bypass these wrappers and call fetch('/api/db', …)
// directly (DispatchMap, RoutesView, PortalDashboard, useRouteActions,
// Pickups, Schedule, etc. — most daily_stops writes). Those will NOT
// participate in the dual-write harness during Phase 2. Phase 2.5 work
// (separate session) = migrate them to use this wrapper or add a
// dbRaw(payload) shim. Until then, the diff log only sees the 45
// wrapper call sites (~60% of v1 write traffic, missing most
// daily_stops). Tracked in the cutover plan.
//
// === V2 WHITELIST SYNC — !!! ===
// V2_ELIGIBLE_TABLES below MUST stay in sync with ALLOWED_V2 in
// api/db-v2.js. Drift modes:
//   - Table added to v2 but not here → dual-write doesn't fire for it
//     (silent coverage hole, undetectable from diff log).
//   - Table removed from v2 but still here → every dual-write logs as
//     v1_only_succeeded with v2_response.error = 'forbidden_table'
//     (loud, detectable; not silent corruption).
// When editing either list, edit BOTH.
//
// === DESIGN: SEQUENTIAL, NOT PARALLEL ===
// v1 fires + awaits, then v2 + diff fire in background. Parallel firing
// would create a race-condition regression: with the OLD uniques
// restored by phase-0 amendment 2, INSERT/UPSERT race winners are
// non-deterministic. If v2 wins the race, v1 hits the unique and
// returns 23505 to the caller — a regression vs today's single-write
// behavior. Sequential guarantees v1 always lands first; v2 hits the
// (now-occupied) unique and gets bucketed as v1_only_succeeded.

import { supabase } from './supabase'

// import.meta.env is Vite-injected at build time. The `?? {}` guard
// lets this module also load in plain Node (e.g., for unit tests),
// where import.meta.env is undefined — flags collapse to false.
const _env = import.meta.env ?? {}
const API_SECRET = _env.VITE_API_SECRET || ''
const PARALLEL_WRITE_ENABLED = _env.VITE_PARALLEL_WRITE_ENABLED === 'true'

// Mirrors api/db-v2.js's ALLOWED_V2. See SYNC notice in header above.
const V2_ELIGIBLE_TABLES = new Set([
  'time_off_requests',
  'delivery_confirmations',
  'driver_routes',
  'daily_stops',
  'driver_notifications',
  'stop_reconciliation',
  'driver_favorites',
  'mileage_log',
  'address_notes',
  'order_deletions',
  'drivers',
  'routing_rules',
  'schedule_overrides',
  'shift_offers',
  'driver_schedule',
  'announcements',
  'poll_responses',
  'announcement_reads',
  'geocode_cache',
  'address_corrections',
  'pickup_requests',
])

function v1Headers() {
  return {
    'Content-Type': 'application/json',
    ...(API_SECRET ? { Authorization: `Bearer ${API_SECRET}` } : {}),
  }
}

// JWT lookup spans two storage paths because cnc-web has two login flows:
//
//   1. supabase.auth.signInWithPassword() → writes to localStorage under
//      the storageKey from src/lib/supabase.js ('cnc-auth'). Used by
//      /portal (PortalLogin.jsx). This is the modern, "right" path.
//
//   2. The dispatcher login at /login (LoginPage.jsx) bypasses Supabase's
//      JS client entirely: it does a raw fetch to
//        ${SUPABASE_URL}/auth/v1/token?grant_type=password
//      and stores the returned access_token under localStorage 'cnc-token'
//      (NOT 'cnc-auth'). This means supabase.auth.getSession() returns
//      null for every dispatcher session — even though a real Supabase
//      JWT is sitting in the browser. The fallback below picks up that
//      JWT so the dual-write shadow can fire from the dispatch portal.
//
// Both branches return real Supabase access_tokens that /api/db-v2 and
// /api/db-v2-diff accept.
//
// !!! DO NOT delete the cnc-token fallback as cruft !!!
// Removing it silently disables the harness for every dispatcher session
// (the symptom: zero rows land in db_v2_diff from /dispatch UI actions).
// The fallback can be retired only after LoginPage.jsx is migrated to
// supabase.auth.signInWithPassword — tracked as a separate ticket.
async function getJwt() {
  try {
    const { data } = await supabase.auth.getSession()
    if (data?.session?.access_token) return data.session.access_token
  } catch {
    // fall through to legacy-login localStorage fallback
  }
  try {
    return localStorage.getItem('cnc-token') || null
  } catch {
    return null
  }
}

async function postV2(bodyStr, jwt) {
  // Always returns { status, body } — never throws. fetch errors are
  // converted to a synthetic { status: 0, body: { error: 'fetch_threw' } }
  // so the diff log can record what happened.
  try {
    const res = await fetch('/api/db-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: bodyStr,
    })
    const body = await res.json().catch(() => null)
    return { status: res.status, body }
  } catch (err) {
    console.warn('[dual-write] v2 fetch threw:', err?.message || err)
    return { status: 0, body: { error: 'fetch_threw', message: String(err?.message || err) } }
  }
}

async function postDiff(table, operation, v1Body, v1Status, v2Body, v2Status, jwt) {
  // Fully fire-and-forget. Audit log loss is preferable to masking a
  // successful v1 write with a noisy error.
  try {
    await fetch('/api/db-v2-diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({
        table_name: table,
        operation,
        v1_response: v1Body,
        v1_status: v1Status,
        v2_response: v2Body,
        v2_status: v2Status,
      }),
    })
  } catch (err) {
    console.warn('[dual-write] diff fetch threw:', err?.message || err)
  }
}

// Background shadow. Fires after v1 has settled and the caller has
// returned. Errors swallowed end-to-end so caller-perceived v1 success
// is never affected by harness instability.
function queueShadow(payload, v1Body, v1Status) {
  // No await on the IIFE. Caller is unblocked immediately.
  ;(async () => {
    try {
      const jwt = await getJwt()
      if (!jwt) return // not logged in — silent skip per design

      const v2Result = await postV2(JSON.stringify(payload), jwt)
      // postV2 always returns { status, body }, never throws.

      await postDiff(
        payload.table,
        payload.operation,
        v1Body,
        v1Status,
        v2Result.body,
        v2Result.status,
        jwt,
      )
    } catch (err) {
      console.warn('[dual-write] background shadow failed:', err?.message || err)
    }
  })()
}

// Core v1 caller. Fire v1, await, return v1's data — same shape as
// pre-Phase-2 code. If the flag is on AND the table is v2-eligible,
// queue the background shadow before returning.
async function callApi(payload) {
  const bodyStr = JSON.stringify(payload)

  // v1 — preserve exact pre-Phase-2 throw semantics
  let v1Status = 0
  let v1Body = null
  let v1Threw = null
  try {
    const v1Res = await fetch('/api/db', {
      method: 'POST',
      headers: v1Headers(),
      body: bodyStr,
    })
    v1Status = v1Res.status
    v1Body = await v1Res.json()
  } catch (err) {
    v1Threw = err
  }

  // Background shadow. Fires for v1 failures too — separating
  // pre-existing v1 errors from v2-introduced ones is valuable signal
  // for cutover analysis.
  if (PARALLEL_WRITE_ENABLED && V2_ELIGIBLE_TABLES.has(payload.table)) {
    queueShadow(payload, v1Body, v1Status)
  }

  if (v1Threw) throw v1Threw
  if (v1Status < 200 || v1Status >= 300) throw new Error(v1Body?.error)
  return v1Body.data
}

export async function dbInsert(table, data) {
  return callApi({ table, operation: 'insert', data })
}

export async function dbUpdate(table, data, match) {
  return callApi({ table, operation: 'update', data, match })
}

export async function dbDelete(table, match) {
  return callApi({ table, operation: 'delete', match })
}

export async function dbUpsert(table, data, onConflict) {
  return callApi({ table, operation: 'upsert', data, onConflict })
}
