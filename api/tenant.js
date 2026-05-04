import { supabase } from './_lib/supabase.js'
import { requireAuth } from './_lib/auth.js'

// Map of camelCase feature-flag key → snake_case JSONB key in tenants.feature_flags.
// Every flag in this map appears in the response, defaulting to false when absent.
// Keep this list in sync with the seed in sql/2026-05-03-phase-0-tenants.sql.
const FEATURE_FLAGS = {
  tesla:               'tesla',
  cxt:                 'cxt',
  dualPharmacyChain:   'dual_pharmacy_chain',
  roadWarrior:         'road_warrior',
  aiDispatch:          'ai_dispatch',
  aiInsights:          'ai_insights',
  communicationsHub:   'communications_hub',
  shiftOffers:         'shift_offers',
  pickupRequests:      'pickup_requests',
  analyticsInsights:   'analytics_insights',
  scheduleAudit:       'schedule_audit',
  whiteLabelBranding:  'white_label_branding',
}

function shapeFeatures(flags) {
  const src = (flags && typeof flags === 'object') ? flags : {}
  const out = {}
  for (const [camel, snake] of Object.entries(FEATURE_FLAGS)) {
    out[camel] = src[snake] === true
  }
  return out
}

function shapeTenant(row) {
  return {
    id:           row.id,
    slug:         row.slug,
    displayName:  row.display_name,
    legalName:    row.legal_name ?? null,

    brand: {
      primaryColor: row.primary_color,
      accentColor:  row.accent_color ?? null,
      logoUrl:      row.logo_url ?? null,
      logoDarkUrl:  row.logo_dark_url ?? null,
      fontFamily:   row.font_family,
    },

    features: shapeFeatures(row.feature_flags),

    tier:           row.tier,
    status:         row.status,
    trialEndsAt:    row.trial_ends_at ?? null,
    timezone:       row.timezone,
    defaultLocale:  row.default_locale,

    pharmacyOrigins: Array.isArray(row.pharmacy_origins) ? row.pharmacy_origins : [],
    adminEmails:     Array.isArray(row.admin_emails) ? row.admin_emails : [],
  }
}

// GET /api/tenant
// Returns the authenticated user's tenant config, shaped for the React client.
// Read-only, idempotent, safe to retry. Cached privately for 60s.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  try {
    const user = await requireAuth(req, res)
    if (!user) return // requireAuth already sent 401

    // 1. Resolve the user's tenant binding via profiles.
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .maybeSingle()

    if (profileErr) throw profileErr
    if (!profile || profile.tenant_id == null) {
      return res.status(404).json({ error: 'no_tenant_binding' })
    }

    // 2. Load the tenant row.
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('id, slug, display_name, legal_name, tier, status, logo_url, logo_dark_url, primary_color, accent_color, font_family, trial_ends_at, timezone, default_locale, pharmacy_origins, admin_emails, feature_flags')
      .eq('id', profile.tenant_id)
      .maybeSingle()

    if (tenantErr) throw tenantErr
    if (!tenant) {
      return res.status(404).json({ error: 'tenant_not_found' })
    }

    // 3. Gate on status. Suspended/archived tenants cannot use the app.
    if (tenant.status !== 'active' && tenant.status !== 'trial') {
      return res.status(403).json({ error: 'tenant_not_active' })
    }

    // 4. Shape and return.
    res.setHeader('Cache-Control', 'private, max-age=60')
    return res.status(200).json(shapeTenant(tenant))
  } catch (err) {
    console.error('[tenant GET]', err?.message || err)
    return res.status(500).json({ error: 'internal' })
  }
}
