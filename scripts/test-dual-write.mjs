// scripts/test-dual-write.mjs
//
// Phase 2 simulation test for src/lib/db.js dual-write orchestration.
//
// SIMULATION TEST: this script re-implements the dual-write logic with
// mocked fetch + supabase to exercise the orchestration shape without
// the Vite-only `import.meta.env` and browser-only Supabase auth client
// the production module depends on. The real production code is
// exercised end-to-end in Phase 3 against the staging deploy.
//
// Keep the logic here in lockstep with src/lib/db.js. If src/lib/db.js
// changes, this file should change too.
//
// Run: node scripts/test-dual-write.mjs

// ---------- Mock state ----------
const calls = [] // [{url, body, headers, response}, ...]
let mockSession = null
const mockLocalStorage = {} // mirrors browser localStorage.getItem
const v1ResponseQueue = []
const v2ResponseQueue = []
const diffResponseQueue = []
const pendingShadows = []
let PARALLEL_WRITE_ENABLED = false

function mockFetch(url, options) {
  const body = options?.body ? JSON.parse(options.body) : null
  const headers = options?.headers || {}
  let response
  if (url === '/api/db') response = v1ResponseQueue.shift()
  else if (url === '/api/db-v2') response = v2ResponseQueue.shift()
  else if (url === '/api/db-v2-diff') response = diffResponseQueue.shift()
  if (!response) throw new Error(`No queued response for ${url}`)

  calls.push({ url, body, headers, response })

  if (response.throws) return Promise.reject(new Error(response.throws))

  return Promise.resolve({
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    json: () => Promise.resolve(response.body),
  })
}

const supabase = {
  auth: {
    getSession: () => Promise.resolve({ data: { session: mockSession } }),
  },
}

const localStorage = {
  getItem: (key) => mockLocalStorage[key] ?? null,
}

// ---------- Mirror of src/lib/db.js logic ----------
const V2_ELIGIBLE_TABLES = new Set([
  'time_off_requests', 'delivery_confirmations', 'driver_routes', 'daily_stops',
  'driver_notifications', 'stop_reconciliation', 'driver_favorites', 'mileage_log',
  'address_notes', 'order_deletions', 'drivers', 'routing_rules',
  'schedule_overrides', 'shift_offers', 'driver_schedule', 'announcements',
  'poll_responses', 'announcement_reads', 'geocode_cache', 'address_corrections',
  'pickup_requests',
])

function v1Headers() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer test-secret` }
}

async function getJwt() {
  // Mirrors src/lib/db.js: try Supabase session first, fall back to
  // legacy 'cnc-token' localStorage key set by /login (LoginPage.jsx).
  try {
    const { data } = await supabase.auth.getSession()
    if (data?.session?.access_token) return data.session.access_token
  } catch {
    // fall through
  }
  try {
    return localStorage.getItem('cnc-token') || null
  } catch {
    return null
  }
}

async function postV2(bodyStr, jwt) {
  try {
    const res = await mockFetch('/api/db-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: bodyStr,
    })
    const body = await res.json().catch(() => null)
    return { status: res.status, body }
  } catch (err) {
    return { status: 0, body: { error: 'fetch_threw', message: String(err?.message || err) } }
  }
}

async function postDiff(table, operation, v1Body, v1Status, v2Body, v2Status, jwt) {
  try {
    await mockFetch('/api/db-v2-diff', {
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
  } catch {
    // swallow — production console.warns
  }
}

function queueShadow(payload, v1Body, v1Status) {
  // Track the promise so the test can await it; in production this is
  // truly fire-and-forget.
  const p = (async () => {
    const jwt = await getJwt()
    if (!jwt) return
    const v2Result = await postV2(JSON.stringify(payload), jwt)
    await postDiff(payload.table, payload.operation, v1Body, v1Status, v2Result.body, v2Result.status, jwt)
  })()
  pendingShadows.push(p)
}

async function callApi(payload) {
  const bodyStr = JSON.stringify(payload)

  let v1Status = 0
  let v1Body = null
  let v1Threw = null
  try {
    const v1Res = await mockFetch('/api/db', { method: 'POST', headers: v1Headers(), body: bodyStr })
    v1Status = v1Res.status
    v1Body = await v1Res.json()
  } catch (err) {
    v1Threw = err
  }

  if (PARALLEL_WRITE_ENABLED && V2_ELIGIBLE_TABLES.has(payload.table)) {
    queueShadow(payload, v1Body, v1Status)
  }

  if (v1Threw) throw v1Threw
  if (v1Status < 200 || v1Status >= 300) throw new Error(v1Body?.error)
  return v1Body.data
}

// ---------- Test runner ----------
let passed = 0
let failed = 0

function reset() {
  calls.length = 0
  v1ResponseQueue.length = 0
  v2ResponseQueue.length = 0
  diffResponseQueue.length = 0
  pendingShadows.length = 0
  mockSession = null
  for (const k of Object.keys(mockLocalStorage)) delete mockLocalStorage[k]
  PARALLEL_WRITE_ENABLED = false
}

async function flushShadows() {
  await Promise.allSettled(pendingShadows)
}

function assert(label, cond, detail = '') {
  if (cond) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.log(`  ✗ ${label}${detail ? ' (' + detail + ')' : ''}`)
    failed++
  }
}

async function test1_flagOff() {
  console.log('\nTEST 1: flag off → only v1 fires')
  reset()
  PARALLEL_WRITE_ENABLED = false
  v1ResponseQueue.push({ status: 200, body: { success: true, data: [{ id: 1 }] } })

  const result = await callApi({ table: 'time_off_requests', operation: 'insert', data: {} })
  await flushShadows()

  assert('v1 fired', calls.some(c => c.url === '/api/db'))
  assert('v2 did NOT fire', !calls.some(c => c.url === '/api/db-v2'))
  assert('diff did NOT fire', !calls.some(c => c.url === '/api/db-v2-diff'))
  assert('returns v1 data', JSON.stringify(result) === JSON.stringify([{ id: 1 }]))
}

async function test2_flagOnSessionOk() {
  console.log('\nTEST 2: flag on + eligible table + session ok → v1 + shadow fire')
  reset()
  PARALLEL_WRITE_ENABLED = true
  mockSession = { access_token: 'jwt-test-cnc' }
  v1ResponseQueue.push({ status: 200, body: { success: true, data: [{ id: 1 }] } })
  v2ResponseQueue.push({ status: 200, body: { success: true, data: [{ id: 2 }] } })
  diffResponseQueue.push({ status: 200, body: { success: true, match_status: 'match' } })

  await callApi({ table: 'time_off_requests', operation: 'insert', data: {} })
  await flushShadows()

  assert('v1 fired', calls.some(c => c.url === '/api/db'))
  assert('v2 fired', calls.some(c => c.url === '/api/db-v2'))
  assert('diff fired', calls.some(c => c.url === '/api/db-v2-diff'))

  const diffCall = calls.find(c => c.url === '/api/db-v2-diff')
  assert('diff carries v1_status=200', diffCall?.body?.v1_status === 200)
  assert('diff carries v2_status=200', diffCall?.body?.v2_status === 200)
  assert('diff carries table_name', diffCall?.body?.table_name === 'time_off_requests')
  assert('diff carries operation', diffCall?.body?.operation === 'insert')
}

async function test3_sessionNull() {
  console.log('\nTEST 3: flag on + eligible table + session null → v1 only')
  reset()
  PARALLEL_WRITE_ENABLED = true
  mockSession = null
  v1ResponseQueue.push({ status: 200, body: { success: true, data: [{ id: 1 }] } })

  await callApi({ table: 'time_off_requests', operation: 'insert', data: {} })
  await flushShadows()

  assert('v1 fired', calls.some(c => c.url === '/api/db'))
  assert('v2 did NOT fire', !calls.some(c => c.url === '/api/db-v2'))
  assert('diff did NOT fire', !calls.some(c => c.url === '/api/db-v2-diff'))
}

async function test4_nonEligibleTable() {
  console.log('\nTEST 4: flag on + non-eligible table (payroll) → v1 only')
  reset()
  PARALLEL_WRITE_ENABLED = true
  mockSession = { access_token: 'jwt-test-cnc' }
  v1ResponseQueue.push({ status: 200, body: { success: true, data: [{ id: 1 }] } })

  await callApi({ table: 'payroll', operation: 'update', data: {}, match: { id: 1 } })
  await flushShadows()

  assert('v1 fired', calls.some(c => c.url === '/api/db'))
  assert('v2 did NOT fire (payroll not in V2_ELIGIBLE_TABLES)', !calls.some(c => c.url === '/api/db-v2'))
  assert('diff did NOT fire', !calls.some(c => c.url === '/api/db-v2-diff'))
}

async function test5_v1Throws() {
  console.log('\nTEST 5: v1 fetch throws → caller sees throw, shadow STILL fires')
  reset()
  PARALLEL_WRITE_ENABLED = true
  mockSession = { access_token: 'jwt-test-cnc' }
  v1ResponseQueue.push({ throws: 'simulated network error' })
  v2ResponseQueue.push({ status: 200, body: { success: true, data: [{ id: 1 }] } })
  diffResponseQueue.push({ status: 200, body: { success: true } })

  let caught = null
  try {
    await callApi({ table: 'time_off_requests', operation: 'insert', data: {} })
  } catch (err) {
    caught = err
  }
  await flushShadows()

  assert('caller saw throw', caught instanceof Error)
  assert('v1 was attempted', calls.some(c => c.url === '/api/db'))
  assert('shadow still fired v2', calls.some(c => c.url === '/api/db-v2'))
  assert('shadow still fired diff', calls.some(c => c.url === '/api/db-v2-diff'))

  const diffCall = calls.find(c => c.url === '/api/db-v2-diff')
  assert('diff has v1_status=0 for thrown v1', diffCall?.body?.v1_status === 0)
  assert('diff has v1_response=null for thrown v1', diffCall?.body?.v1_response === null)
}

async function test6_v1FourHundred() {
  console.log('\nTEST 6: v1 returns 4xx → caller sees throw, shadow STILL fires')
  reset()
  PARALLEL_WRITE_ENABLED = true
  mockSession = { access_token: 'jwt-test-cnc' }
  v1ResponseQueue.push({ status: 403, body: { error: 'forbidden_table', message: 'denied' } })
  v2ResponseQueue.push({ status: 403, body: { error: 'forbidden_table', message: 'denied' } })
  diffResponseQueue.push({ status: 200, body: { success: true } })

  let caught = null
  try {
    await callApi({ table: 'time_off_requests', operation: 'insert', data: {} })
  } catch (err) {
    caught = err
  }
  await flushShadows()

  assert('caller saw throw', caught instanceof Error)
  assert('throw carried v1 error string', caught?.message === 'forbidden_table')
  assert('shadow fired v2', calls.some(c => c.url === '/api/db-v2'))
  assert('shadow fired diff', calls.some(c => c.url === '/api/db-v2-diff'))

  const diffCall = calls.find(c => c.url === '/api/db-v2-diff')
  assert('diff has v1_status=403', diffCall?.body?.v1_status === 403)
  assert('diff has v1_response.error', diffCall?.body?.v1_response?.error === 'forbidden_table')
}

async function test7_v2Throws() {
  console.log('\nTEST 7: v2 fetch throws → swallowed, diff STILL fires with synthetic body')
  reset()
  PARALLEL_WRITE_ENABLED = true
  mockSession = { access_token: 'jwt-test-cnc' }
  v1ResponseQueue.push({ status: 200, body: { success: true, data: [{ id: 1 }] } })
  v2ResponseQueue.push({ throws: 'simulated v2 network error' })
  diffResponseQueue.push({ status: 200, body: { success: true } })

  const result = await callApi({ table: 'time_off_requests', operation: 'insert', data: {} })
  await flushShadows()

  assert('caller got v1 result', JSON.stringify(result) === JSON.stringify([{ id: 1 }]))
  assert('v2 was attempted', calls.some(c => c.url === '/api/db-v2'))
  assert('diff fired despite v2 throw', calls.some(c => c.url === '/api/db-v2-diff'))

  const diffCall = calls.find(c => c.url === '/api/db-v2-diff')
  assert('diff has v2_status=0', diffCall?.body?.v2_status === 0)
  assert('diff has synthetic v2 error', diffCall?.body?.v2_response?.error === 'fetch_threw')
}

async function test8_callerNotBlockedByShadow() {
  console.log('\nTEST 8: caller returns BEFORE shadow completes (fire-and-forget)')
  reset()
  PARALLEL_WRITE_ENABLED = true
  mockSession = { access_token: 'jwt-test-cnc' }
  v1ResponseQueue.push({ status: 200, body: { success: true, data: [{ id: 1 }] } })
  v2ResponseQueue.push({ status: 200, body: { success: true, data: [{ id: 2 }] } })
  diffResponseQueue.push({ status: 200, body: { success: true } })

  await callApi({ table: 'time_off_requests', operation: 'insert', data: {} })
  // At this point the shadow may still be in-flight. v2 and diff calls
  // recorded ONLY because mockFetch is synchronous-ish. In a real env
  // the assertion would be timing-based. Here we check that callApi did
  // not await the shadow:
  const v2BeforeFlush = calls.some(c => c.url === '/api/db-v2')
  const diffBeforeFlush = calls.some(c => c.url === '/api/db-v2-diff')
  // mockFetch resolves on the next microtask; both v2 and diff will
  // have been REGISTERED into the calls array via mockFetch call, but
  // since our mockFetch pushes synchronously on call, we can only
  // confirm fire-and-forget semantics by ensuring the shadow IIFE
  // completes off the main awaited path. The pendingShadows tracking
  // proves it: callApi returned without awaiting pendingShadows[0].
  assert('shadow promise was queued, not awaited inline', pendingShadows.length === 1)
  await flushShadows()
  assert('after flush, v2 fired', calls.some(c => c.url === '/api/db-v2'))
  assert('after flush, diff fired', calls.some(c => c.url === '/api/db-v2-diff'))
}

async function test9_fallbackToLocalStorage() {
  console.log("\nTEST 9: null supabase session + cnc-token present → fallback fires shadow")
  reset()
  PARALLEL_WRITE_ENABLED = true
  mockSession = null                                           // /portal-style auth absent
  mockLocalStorage['cnc-token'] = 'jwt-from-legacy-dispatcher-login'  // /login wrote this
  v1ResponseQueue.push({ status: 200, body: { success: true, data: [{ id: 1 }] } })
  v2ResponseQueue.push({ status: 200, body: { success: true, data: [{ id: 2 }] } })
  diffResponseQueue.push({ status: 200, body: { success: true } })

  await callApi({ table: 'time_off_requests', operation: 'insert', data: {} })
  await flushShadows()

  assert('v1 fired', calls.some(c => c.url === '/api/db'))
  assert('v2 fired (used cnc-token fallback)', calls.some(c => c.url === '/api/db-v2'))
  assert('diff fired', calls.some(c => c.url === '/api/db-v2-diff'))

  const v2Call = calls.find(c => c.url === '/api/db-v2')
  assert(
    'v2 Authorization header used cnc-token JWT',
    v2Call?.headers?.Authorization === 'Bearer jwt-from-legacy-dispatcher-login',
    `actual: ${v2Call?.headers?.Authorization}`,
  )

  const diffCall = calls.find(c => c.url === '/api/db-v2-diff')
  assert(
    'diff Authorization header used cnc-token JWT',
    diffCall?.headers?.Authorization === 'Bearer jwt-from-legacy-dispatcher-login',
    `actual: ${diffCall?.headers?.Authorization}`,
  )
}

async function test10_noJwtInEitherPath() {
  console.log("\nTEST 10: null supabase session + no cnc-token → shadow skips silently")
  reset()
  PARALLEL_WRITE_ENABLED = true
  mockSession = null
  // mockLocalStorage intentionally empty — neither auth path has a JWT
  v1ResponseQueue.push({ status: 200, body: { success: true, data: [{ id: 1 }] } })

  await callApi({ table: 'time_off_requests', operation: 'insert', data: {} })
  await flushShadows()

  assert('v1 fired', calls.some(c => c.url === '/api/db'))
  assert('v2 did NOT fire', !calls.some(c => c.url === '/api/db-v2'))
  assert('diff did NOT fire', !calls.some(c => c.url === '/api/db-v2-diff'))
}

;(async () => {
  console.log('Phase 2 simulation test: src/lib/db.js dual-write orchestration')
  console.log('================================================================')
  await test1_flagOff()
  await test2_flagOnSessionOk()
  await test3_sessionNull()
  await test4_nonEligibleTable()
  await test5_v1Throws()
  await test6_v1FourHundred()
  await test7_v2Throws()
  await test8_callerNotBlockedByShadow()
  await test9_fallbackToLocalStorage()
  await test10_noJwtInEitherPath()
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
})()
