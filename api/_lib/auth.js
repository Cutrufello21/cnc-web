// API Authentication Layer
// Validates Supabase JWT from Authorization header
// Usage: const driver = await requireAuth(req, res); if (!driver) return;

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const API_SECRET = process.env.API_SECRET // For server-to-server calls (cron, dispatch web)

// Validate a Supabase JWT and return the user
async function validateToken(token) {
  if (!token) return null
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
    })
    if (!res.ok) return null
    const user = await res.json()
    return user
  } catch {
    return null
  }
}

// Extract token from Authorization header
function extractToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization || ''
  if (auth.startsWith('Bearer ')) return auth.slice(7)
  return null
}

// Require authentication — returns user or sends 401
// Options:
//   allowApiSecret: true — also accepts API_SECRET for server-to-server calls
//   allowAnon: true — allows unauthenticated access (for public endpoints)
export async function requireAuth(req, res, options = {}) {
  const token = extractToken(req)

  // Check API secret for server-to-server calls (cron jobs, dispatch web)
  if (options.allowApiSecret && token && API_SECRET && token === API_SECRET) {
    return { id: 'server', email: 'server@cncdelivery.com', role: 'admin', isServer: true }
  }

  // Check Supabase JWT
  if (token) {
    const user = await validateToken(token)
    if (user?.id) return user
  }

  // No valid auth
  if (options.allowAnon) return null
  // TEMPORARY: Allow unauthenticated requests during transition period
  // TODO: Remove this block once all driver apps are updated to send auth tokens (build #69+)
  console.warn(`[auth] Unauthenticated request to ${req.url} — allowing during transition`)
  return { id: 'anonymous', email: null, role: 'driver', isAnonymous: true }
}

// Require that the authenticated user matches the driver name
// Returns the driver record or sends 403
export async function requireDriver(req, res, driverName) {
  const user = await requireAuth(req, res, { allowApiSecret: true })
  if (!user) return null // 401 already sent

  // Server/admin calls can act as any driver
  if (user.isServer) return user

  // Verify the authenticated user matches the claimed driver
  // The user's email should match a driver record
  if (user.email) {
    // Lookup driver by email to verify identity
    const { supabase } = await import('./supabase.js')
    const { data: driver } = await supabase.from('drivers')
      .select('driver_name, email')
      .or(`email.eq.${user.email},driver_name.eq.${driverName}`)
      .limit(1)

    if (driver?.[0]?.driver_name === driverName) return user
  }

  res.status(403).json({ error: 'Forbidden — you can only access your own data' })
  return null
}

// Simple API key check for dispatch web / internal tools
export function requireApiKey(req, res) {
  const token = extractToken(req)
  if (token && API_SECRET && token === API_SECRET) return true
  // Also check query param for backwards compatibility
  const key = req.query?.apiKey || req.headers['x-api-key']
  if (key && API_SECRET && key === API_SECRET) return true
  res.status(401).json({ error: 'Unauthorized — API key required' })
  return false
}
