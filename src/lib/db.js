// Client-side DB write helper — routes all writes through /api/db (service role)
// This bypasses RLS issues with expired/missing auth sessions

const API_SECRET = import.meta.env.VITE_API_SECRET || ''
function authHeaders() {
  return { 'Content-Type': 'application/json', ...(API_SECRET ? { Authorization: `Bearer ${API_SECRET}` } : {}) }
}

export async function dbInsert(table, data) {
  const res = await fetch('/api/db', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ table, operation: 'insert', data }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error)
  return json.data
}

export async function dbUpdate(table, data, match) {
  const res = await fetch('/api/db', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ table, operation: 'update', data, match }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error)
  return json.data
}

export async function dbDelete(table, match) {
  const res = await fetch('/api/db', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ table, operation: 'delete', match }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error)
  return json.data
}

export async function dbUpsert(table, data, onConflict) {
  const res = await fetch('/api/db', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ table, operation: 'upsert', data, onConflict }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error)
  return json.data
}
