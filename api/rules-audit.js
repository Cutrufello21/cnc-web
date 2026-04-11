// GET /api/rules-audit
// Compares routing_rules against actual dispatch history (90 days)
// Returns: mismatches, recommendations, confidence scores

import { supabase } from './_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]

    const [rulesRes, histRes, stopsRes, schedRes, driversRes] = await Promise.all([
      supabase.from('routing_rules').select('*').limit(500),
      supabase.from('dispatch_history_import')
        .select('delivery_date, day_of_week, driver_name, zip, pharmacy')
        .gte('delivery_date', cutoff)
        .order('delivery_date', { ascending: false })
        .limit(8000),
      // Also check recent daily_stops for the freshest data
      supabase.from('daily_stops')
        .select('delivery_date, delivery_day, driver_name, zip, pharmacy')
        .gte('delivery_date', cutoff)
        .not('status', 'eq', 'DELETED')
        .limit(8000),
      supabase.from('driver_schedule').select('*'),
      supabase.from('drivers').select('driver_name, pharmacy').eq('active', true),
    ])

    const rules = rulesRes.data || []
    const history = [...(histRes.data || []), ...(stopsRes.data || [])]
    const schedules = schedRes.data || []
    const schedMap = {}
    schedules.forEach(s => { schedMap[s.driver_name] = s })

    const dayAbbrevs = { Monday: 'mon', Tuesday: 'tue', Wednesday: 'wed', Thursday: 'thu', Friday: 'fri' }
    const dayFull = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday' }

    // Build actual dispatch patterns: zip|day → { driverName: count }
    const actual = {}
    for (const h of history) {
      if (!h.zip || !h.driver_name) continue
      let dayKey = null
      if (h.day_of_week) {
        const dw = h.day_of_week.trim()
        dayKey = dayAbbrevs[dw] || dayAbbrevs[Object.keys(dayAbbrevs).find(k => k.startsWith(dw))] || null
      }
      if (!dayKey && h.delivery_date) {
        const d = new Date(h.delivery_date + 'T12:00:00')
        dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][d.getDay()]
      }
      if (!dayKey || dayKey === 'sun' || dayKey === 'sat') continue

      const key = `${h.zip}|${dayKey}`
      if (!actual[key]) actual[key] = {}
      actual[key][h.driver_name] = (actual[key][h.driver_name] || 0) + 1
    }

    // Build driver → pharmacy lookup
    const driverPharm = {}
    ;(driversRes.data || []).forEach(d => { driverPharm[d.driver_name] = d.pharmacy || 'SHSP' })

    // Helper: check if a driver can work a pharmacy
    function pharmMatch(driverName, rulePharmacy) {
      const dp = driverPharm[driverName] || 'SHSP'
      if (dp === 'Both') return true
      if (!rulePharmacy) return true
      const rp = rulePharmacy.toUpperCase().includes('AULT') ? 'Aultman' : 'SHSP'
      return dp === rp
    }

    // Analyze each rule
    const mismatches = []
    const correct = []
    const noData = []
    const recommendations = []

    for (const rule of rules) {
      const zip = rule.zip_code || rule.zip
      if (!zip) continue
      for (const day of ['mon', 'tue', 'wed', 'thu', 'fri']) {
        const ruleDriver = (rule[day] || '').trim()
        if (!ruleDriver) continue

        // Parse "Name/ID" or just "Name"
        const ruleName = ruleDriver.includes('/') ? ruleDriver.split('/')[0].trim() : ruleDriver

        const key = `${zip}|${day}`
        const rawPatterns = actual[key]
        const rulePharmacy = rule.pharmacy || ''

        if (!rawPatterns || Object.keys(rawPatterns).length === 0) {
          noData.push({ zip: zip, day: dayFull[day], ruleDriver: ruleName })
          continue
        }

        // Filter patterns to only drivers from the matching pharmacy
        const patterns = {}
        for (const [dName, count] of Object.entries(rawPatterns)) {
          if (pharmMatch(dName, rulePharmacy)) patterns[dName] = count
        }

        if (Object.keys(patterns).length === 0) {
          noData.push({ zip: zip, day: dayFull[day], ruleDriver: ruleName })
          continue
        }

        const total = Object.values(patterns).reduce((s, v) => s + v, 0)

        // Need at least 8 data points (~4 weeks) to make recommendations
        if (total < 8) {
          noData.push({ zip: zip, day: dayFull[day], ruleDriver: ruleName, reason: `Only ${total} deliveries — need 4+ weeks of data` })
          continue
        }

        const sorted = Object.entries(patterns).sort((a, b) => b[1] - a[1])
        const topDriver = sorted[0][0]
        const topCount = sorted[0][1]
        const topPct = Math.round((topCount / total) * 100)

        // Check if rule matches reality
        const ruleCount = patterns[ruleName] || 0
        const rulePct = Math.round((ruleCount / total) * 100)

        // Check if rule driver is even scheduled for this day
        const sched = schedMap[ruleName]
        const isScheduled = !sched || (sched[day] !== false && sched[day] !== 'false' && sched[day] !== 0)

        if (topDriver === ruleName && topPct >= 50) {
          correct.push({ zip: zip, day: dayFull[day], driver: ruleName, pct: rulePct, total })
        } else {
          const entry = {
            zip: zip,
            day: dayFull[day],
            currentRule: ruleName,
            currentRulePct: rulePct,
            currentRuleCount: ruleCount,
            actualTop: topDriver,
            actualTopPct: topPct,
            actualTopCount: topCount,
            totalDeliveries: total,
            isScheduled,
            alternatives: sorted.slice(0, 3).map(([name, count]) => ({
              name, count, pct: Math.round((count / total) * 100),
            })),
          }

          // Determine severity
          if (!isScheduled) {
            entry.severity = 'critical'
            entry.reason = `${ruleName} is not scheduled to work ${dayFull[day]}s`
          } else if (rulePct === 0) {
            entry.severity = 'critical'
            entry.reason = `${ruleName} has never delivered to ZIP ${zip} on ${dayFull[day]}s in the last 90 days`
          } else if (topPct - rulePct > 30) {
            entry.severity = 'high'
            entry.reason = `${topDriver} handles this ZIP ${topPct}% of the time vs ${ruleName} at ${rulePct}%`
          } else {
            entry.severity = 'medium'
            entry.reason = `Split: ${ruleName} ${rulePct}% vs ${topDriver} ${topPct}%`
          }

          mismatches.push(entry)

          // Build recommendation
          if (topPct >= 60) {
            recommendations.push({
              zip: zip,
              day,
              dayFull: dayFull[day],
              from: ruleName,
              to: topDriver,
              confidence: topPct,
              reason: entry.reason,
              severity: entry.severity,
            })
          }
        }
      }
    }

    // Find ZIPs in actual data that have NO routing rule
    const ruledZips = new Set()
    for (const rule of rules) {
      for (const day of ['mon', 'tue', 'wed', 'thu', 'fri']) {
        if (rule[day]) ruledZips.add(`${rule.zip_code || rule.zip}|${day}`)
      }
    }
    const unruled = []
    for (const [key, patterns] of Object.entries(actual)) {
      if (ruledZips.has(key)) continue
      const [zip, day] = key.split('|')
      const total = Object.values(patterns).reduce((s, v) => s + v, 0)
      if (total < 3) continue // need minimum data
      const sorted = Object.entries(patterns).sort((a, b) => b[1] - a[1])
      unruled.push({
        zip, day: dayFull[day],
        suggestedDriver: sorted[0][0],
        confidence: Math.round((sorted[0][1] / total) * 100),
        total,
      })
    }

    // Sort mismatches by severity
    const severityOrder = { critical: 0, high: 1, medium: 2 }
    mismatches.sort((a, b) => (severityOrder[a.severity] || 9) - (severityOrder[b.severity] || 9))
    recommendations.sort((a, b) => (severityOrder[a.severity] || 9) - (severityOrder[b.severity] || 9))

    return res.status(200).json({
      summary: {
        totalRules: rules.length,
        totalRuleEntries: rules.reduce((s, r) => s + ['mon','tue','wed','thu','fri'].filter(d => r[d]).length, 0),
        correct: correct.length,
        mismatches: mismatches.length,
        critical: mismatches.filter(m => m.severity === 'critical').length,
        high: mismatches.filter(m => m.severity === 'high').length,
        medium: mismatches.filter(m => m.severity === 'medium').length,
        noData: noData.length,
        unruledZips: unruled.length,
        recommendations: recommendations.length,
      },
      mismatches,
      recommendations,
      unruledZips: unruled.slice(0, 30),
      correct: correct.length,
    })
  } catch (err) {
    console.error('[rules-audit]', err)
    return res.status(500).json({ error: err.message })
  }
}
