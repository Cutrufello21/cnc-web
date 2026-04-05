import { supabase } from './_lib/supabase.js'

// Analyzes a driver's historical delivery patterns and returns
// a preferred ZIP ordering that the optimizer can use as a hint.
//
// GET /api/route-patterns?driver=Bobby&day=Wednesday
// Returns: { zipOrder: ['44203','44230','44270','44281'], confidence: 0.82 }

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })

  const driver = req.query.driver
  const day = req.query.day // optional: filter to specific day of week
  if (!driver) return res.status(400).json({ error: 'driver param required' })

  try {
    // Pull last 90 days of delivered stops for this driver
    const since = new Date()
    since.setDate(since.getDate() - 90)
    const sinceStr = since.toISOString().split('T')[0]

    let query = supabase
      .from('daily_stops')
      .select('zip, city, delivery_date, delivery_day, id, delivered_at')
      .eq('driver_name', driver)
      .eq('status', 'delivered')
      .gte('delivery_date', sinceStr)
      .order('delivery_date', { ascending: false })
      .order('id', { ascending: true })
      .limit(3000)

    if (day) query = query.eq('delivery_day', day)

    const { data: stops } = await query
    if (!stops?.length) return res.json({ zipOrder: [], confidence: 0, days: 0 })

    // Group by date
    const days = {}
    stops.forEach(s => {
      if (!days[s.delivery_date]) days[s.delivery_date] = []
      days[s.delivery_date].push(s)
    })

    // Sort each day's stops by delivered_at if available, otherwise by id (insertion order)
    Object.values(days).forEach(dayStops => {
      dayStops.sort((a, b) => {
        if (a.delivered_at && b.delivered_at) return a.delivered_at.localeCompare(b.delivered_at)
        return a.id - b.id
      })
    })

    const totalDays = Object.keys(days).length
    if (totalDays < 2) return res.json({ zipOrder: [], confidence: 0, days: totalDays })

    // Build ZIP transition frequency matrix
    const transitions = {} // 'A→B' → count
    const zipFirst = {}    // which ZIP starts the route
    const zipFreq = {}     // total appearances per ZIP

    Object.values(days).forEach(dayStops => {
      if (dayStops.length < 2) return

      const zipSeq = []
      let prevZip = null
      for (const s of dayStops) {
        zipFreq[s.zip] = (zipFreq[s.zip] || 0) + 1
        if (s.zip !== prevZip) {
          zipSeq.push(s.zip)
          prevZip = s.zip
        }
      }

      if (zipSeq.length === 0) return
      zipFirst[zipSeq[0]] = (zipFirst[zipSeq[0]] || 0) + 1

      for (let i = 0; i < zipSeq.length - 1; i++) {
        const pair = `${zipSeq[i]}→${zipSeq[i + 1]}`
        transitions[pair] = (transitions[pair] || 0) + 1
      }
    })

    // Find the best starting ZIP
    const startZip = Object.entries(zipFirst)
      .sort((a, b) => b[1] - a[1])[0]?.[0]

    if (!startZip) return res.json({ zipOrder: [], confidence: 0, days: totalDays })

    // Build optimal ZIP sequence using greedy walk through transition matrix
    const allZips = new Set(Object.keys(zipFreq))
    const zipOrder = [startZip]
    const visited = new Set([startZip])

    while (visited.size < allZips.size) {
      const current = zipOrder[zipOrder.length - 1]

      // Find the strongest unvisited transition from current ZIP
      let bestNext = null, bestCount = 0
      for (const [pair, count] of Object.entries(transitions)) {
        const [from, to] = pair.split('→')
        if (from === current && !visited.has(to) && count > bestCount) {
          bestNext = to
          bestCount = count
        }
      }

      if (bestNext) {
        zipOrder.push(bestNext)
        visited.add(bestNext)
      } else {
        // No transition found — add the most frequent unvisited ZIP
        const remaining = [...allZips].filter(z => !visited.has(z))
          .sort((a, b) => (zipFreq[b] || 0) - (zipFreq[a] || 0))
        if (remaining.length === 0) break
        zipOrder.push(remaining[0])
        visited.add(remaining[0])
      }
    }

    // Calculate confidence: what % of historical transitions match our sequence
    let matchedTransitions = 0, totalTransitions = 0
    for (const [pair, count] of Object.entries(transitions)) {
      const [from, to] = pair.split('→')
      const fromIdx = zipOrder.indexOf(from)
      const toIdx = zipOrder.indexOf(to)
      totalTransitions += count
      if (fromIdx >= 0 && toIdx >= 0 && toIdx > fromIdx) {
        matchedTransitions += count
      }
    }
    const confidence = totalTransitions > 0
      ? Math.round((matchedTransitions / totalTransitions) * 100) / 100
      : 0

    // Also return per-ZIP city names and stop counts for display
    const zipDetails = zipOrder.map(zip => {
      const cities = {}
      stops.filter(s => s.zip === zip).forEach(s => {
        const city = (s.city || '').trim()
        if (city) cities[city] = (cities[city] || 0) + 1
      })
      const topCity = Object.entries(cities).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
      return { zip, city: topCity, deliveries: zipFreq[zip] || 0 }
    })

    return res.json({
      zipOrder,
      zipDetails,
      startZip,
      confidence,
      days: totalDays,
      transitions: Object.entries(transitions)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([pair, count]) => ({ pair, count })),
    })
  } catch (err) {
    console.error('[route-patterns]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
