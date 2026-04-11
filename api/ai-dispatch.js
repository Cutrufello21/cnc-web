// AI Dispatch Suggestions — READ ONLY
// GET /api/ai-dispatch?date=2026-04-10
//
// Reads: daily_stops, routing_rules, dispatch_history_import, drivers
// Writes: NOTHING
// Returns: { assignments, flags, summary, stats }

import Anthropic from '@anthropic-ai/sdk'
import { supabase } from './_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })

  try {
    // ── 1. Target date ──────────────────────────────────────────
    const dateStr = req.query.date || new Date().toISOString().split('T')[0]
    const dateObj = new Date(dateStr + 'T12:00:00')
    const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' })

    // ── 2. Fetch all context in parallel ────────────────────────
    const cutoff90 = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]

    const [stopsRes, rulesRes, driversRes, historyRes] = await Promise.all([
      supabase
        .from('daily_stops')
        .select('id, order_id, driver_name, driver_number, zip, city, address, pharmacy, cold_chain, assigned_driver_number, dispatch_driver_number')
        .eq('delivery_date', dateStr)
        .limit(1000),

      supabase
        .from('routing_rules')
        .select('*')
        .limit(500),

      supabase
        .from('drivers')
        .select('driver_name, driver_number, pharmacy, active')
        .eq('active', true),

      supabase
        .from('dispatch_history_import')
        .select('delivery_date, day_of_week, driver_name, zip, city, pharmacy, cold_chain')
        .gte('delivery_date', cutoff90)
        .order('delivery_date', { ascending: false })
        .limit(6000),
    ])

    const stops = stopsRes.data || []
    const rules = rulesRes.data || []
    const drivers = driversRes.data || []
    const history = historyRes.data || []

    if (stops.length === 0) {
      return res.status(200).json({
        assignments: [],
        flags: [],
        summary: `No stops found for ${dateStr}.`,
        stats: { total_stops: 0, assigned: 0, flagged: 0, high_confidence: 0 },
      })
    }

    // ── 3. Build context for Claude ─────────────────────────────

    // Stops to assign
    const stopsContext = stops.map(s => ({
      stop_id: s.id,
      order_id: s.order_id,
      current_driver: s.driver_name || null,
      driver_number: s.driver_number || null,
      zip: s.zip,
      city: s.city,
      pharmacy: s.pharmacy,
      cold_chain: !!s.cold_chain,
    }))

    // Routing rules for this day
    const dayShort = dayOfWeek.slice(0, 3).toLowerCase()
    const dayRules = rules
      .filter(r => r[dayShort])
      .map(r => ({ zip: r.zip, driver: r[dayShort] }))

    // Active drivers
    const driverList = drivers.map(d => ({
      name: d.driver_name,
      number: d.driver_number,
      pharmacy: d.pharmacy || 'SHSP',
    }))

    // Historical patterns for this day of week
    // Match by deriving day from delivery_date AND by stored day_of_week column (handles both formats)
    const histForDay = history.filter(h => {
      // Check stored day_of_week (could be "Monday", "Mon", etc.)
      if (h.day_of_week) {
        const stored = h.day_of_week.trim()
        if (stored === dayOfWeek || stored === dayOfWeek.slice(0, 3)) return true
      }
      // Fallback: derive day from delivery_date
      if (h.delivery_date) {
        const d = new Date(h.delivery_date + 'T12:00:00')
        return d.toLocaleDateString('en-US', { weekday: 'long' }) === dayOfWeek
      }
      return false
    })
    const zipDriverFreq = {}
    for (const h of histForDay) {
      if (!h.zip || !h.driver_name) continue
      if (!zipDriverFreq[h.zip]) zipDriverFreq[h.zip] = {}
      zipDriverFreq[h.zip][h.driver_name] = (zipDriverFreq[h.zip][h.driver_name] || 0) + 1
    }
    // Convert to sorted array per ZIP
    const histPatterns = Object.entries(zipDriverFreq).map(([zip, drivers]) => {
      const sorted = Object.entries(drivers).sort((a, b) => b[1] - a[1]).slice(0, 3)
      return { zip, drivers: sorted.map(([name, count]) => ({ name, count })) }
    })

    // ── 4. Call Claude ──────────────────────────────────────────
    const systemPrompt = `You are Dom's dispatch assistant at CNC Delivery Service in Northeast Ohio. Dom has 7 years of dispatch experience. Analyze his historical patterns and assign today's stops exactly the way Dom would.
Rules:
- Assign ZIP codes to drivers, not individual stops
- Keep geographically close ZIPs clustered on the same driver
- Balance cold chain stops across drivers — no driver should have a disproportionate cold load
- Match historical day-of-week patterns — if Mike always gets 44270 on Fridays, give it to Mike
- Never overload one driver significantly vs others (target 35-50 stops each)
- SHSP stops stay with SHSP pharmacy drivers
- Aultman stops stay with Aultman pharmacy drivers
- Drivers marked "Both" can take either pharmacy
- Flag anything unusual: unbalanced loads, ZIPs with no historical precedent, cold chain concentration
- Every ZIP in the input MUST appear in exactly one driver's assignment
Return valid JSON only. No explanation outside the JSON.`

    // Summarize stops by ZIP for a compact prompt
    const zipSummary = {}
    for (const s of stopsContext) {
      if (!zipSummary[s.zip]) zipSummary[s.zip] = { count: 0, cold: 0, pharmacy: s.pharmacy, cities: new Set() }
      zipSummary[s.zip].count++
      if (s.cold_chain) zipSummary[s.zip].cold++
      if (s.city) zipSummary[s.zip].cities.add(s.city)
    }
    const zipRows = Object.entries(zipSummary)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([zip, d]) => ({
        zip,
        stops: d.count,
        cold_chain: d.cold,
        pharmacy: d.pharmacy,
        cities: [...d.cities].join(', '),
      }))

    const userPrompt = `Assign drivers for ${dayOfWeek}, ${dateStr}.

TODAY'S STOPS BY ZIP (${stops.length} total):
${JSON.stringify(zipRows, null, 2)}

ACTIVE DRIVERS:
${JSON.stringify(driverList, null, 2)}

ROUTING RULES FOR ${dayOfWeek.toUpperCase()}:
${JSON.stringify(dayRules, null, 2)}

HISTORICAL ${dayOfWeek.toUpperCase()} PATTERNS (last 90 days, ZIP → top drivers):
${JSON.stringify(histPatterns, null, 2)}

Return ONE object per driver (not per stop). Each driver gets a list of ZIPs they should cover. Return this exact JSON format:
{
  "assignments": [
    {
      "driver_name": "<name>",
      "driver_number": "<number>",
      "zips": ["44203", "44270"],
      "stop_count": <total stops across those ZIPs>,
      "cold_chain_count": <cold chain stops across those ZIPs>,
      "confidence": "high" | "medium" | "low",
      "reasoning": "<one-line explanation>"
    }
  ],
  "flags": [
    {
      "zip": "<ZIP or null>",
      "reason": "<description of issue>"
    }
  ],
  "summary": "<2-3 sentence overview of assignments and any concerns>",
  "stats": {
    "total_stops": ${stops.length},
    "total_drivers": <count of drivers assigned>,
    "flagged": <count of flags>
  }
}

Every ZIP must be assigned to exactly one driver. Every stop must be covered. Do not leave any ZIP unassigned.`

    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16384,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = response.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('')

    // Parse JSON — handle markdown code fences and truncation
    let result
    try {
      let jsonStr = text.replace(/^```json?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim()
      result = JSON.parse(jsonStr)
    } catch (parseErr) {
      // If truncated mid-JSON, try to salvage by closing open structures
      try {
        let jsonStr = text.replace(/^```json?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim()
        // Find last complete assignment object (ends with })
        const lastBrace = jsonStr.lastIndexOf('}')
        if (lastBrace > 0) {
          // Truncate to last complete object, close arrays + root
          let truncated = jsonStr.slice(0, lastBrace + 1)
          // Count open brackets to close them
          const opens = (truncated.match(/\[/g) || []).length
          const closes = (truncated.match(/\]/g) || []).length
          for (let i = 0; i < opens - closes; i++) truncated += ']'
          if (!truncated.endsWith('}')) truncated += '}'
          result = JSON.parse(truncated)
          result._truncated = true
        } else {
          throw parseErr
        }
      } catch {
        return res.status(200).json({
          assignments: [],
          flags: [],
          summary: 'AI response was too large to parse. Retry with fewer stops.',
          stats: { total_stops: stops.length, assigned: 0, flagged: 0, high_confidence: 0 },
          _raw: text.slice(0, 2000),
          _parseError: parseErr.message,
        })
      }
    }

    return res.status(200).json(result)

  } catch (err) {
    console.error('[ai-dispatch]', err)
    return res.status(500).json({ error: err.message })
  }
}
