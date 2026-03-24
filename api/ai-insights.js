import Anthropic from '@anthropic-ai/sdk'
import { supabase } from './_lib/supabase.js'

const WEEKDAYS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])

export const config = { runtime: "nodejs" }

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })

  try {
    const [logsRes, weeklyRes, unassignedRes, zipRes] = await Promise.all([
      supabase.from('dispatch_logs').select('*').order('date', { ascending: true }),
      supabase.from('payroll').select('*').order('week_of', { ascending: false }).limit(25),
      supabase.from('unassigned_orders').select('*').order('date', { ascending: false }).limit(50),
      supabase.from('orders').select('zip').not('zip', 'is', null).not('zip', 'eq', ''),
    ])

    // Parse logs — weekdays only
    const allLogs = (logsRes.data || []).filter(r => WEEKDAYS.has(r.delivery_day))

    // This week and last 4 weeks
    const thisWeek = allLogs.slice(-5)
    const last4Weeks = allLogs.slice(-25)

    // Weekly stops (current week)
    const currentWeek = weeklyRes.data?.filter(r => r.week_of === weeklyRes.data[0]?.week_of) || []
    const weeklyStops = currentWeek.filter(r => r.driver_name !== 'Paul')

    // Recent unassigned
    const recentUnassigned = unassignedRes.data || []

    // Top ZIPs
    const zipCounts = {}
    ;(zipRes.data || []).forEach(r => { zipCounts[r.zip] = (zipCounts[r.zip] || 0) + 1 })
    const topZips = Object.entries(zipCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([zip, count]) => `${zip}: ${count} deliveries`)

    // Build summary
    const thisWeekTotal = thisWeek.reduce((s, r) => s + (r.orders_processed || 0), 0)
    const thisWeekSHSP = thisWeek.reduce((s, r) => s + (r.shsp_orders || 0), 0)
    const thisWeekAultman = thisWeek.reduce((s, r) => s + (r.aultman_orders || 0), 0)
    const thisWeekCC = thisWeek.reduce((s, r) => s + (r.cold_chain || 0), 0)
    const thisWeekUnassigned = thisWeek.reduce((s, r) => s + (r.unassigned_count || 0), 0)

    // Weekly breakdowns
    const weeklyBreakdowns = []
    for (let i = 0; i < 4; i++) {
      const start = last4Weeks.length - (5 * (i + 1))
      const end = last4Weeks.length - (5 * i)
      const week = last4Weeks.slice(Math.max(0, start), end)
      if (week.length === 0) continue
      weeklyBreakdowns.push({
        week: `Week ${4 - i}`,
        dates: `${week[0]?.date || '?'} - ${week[week.length - 1]?.date || '?'}`,
        total: week.reduce((s, r) => s + (r.orders_processed || 0), 0),
        shsp: week.reduce((s, r) => s + (r.shsp_orders || 0), 0),
        aultman: week.reduce((s, r) => s + (r.aultman_orders || 0), 0),
        coldChain: week.reduce((s, r) => s + (r.cold_chain || 0), 0),
        unassigned: week.reduce((s, r) => s + (r.unassigned_count || 0), 0),
      })
    }

    // Driver performance
    const driverSummary = weeklyStops
      .map(d => ({
        name: d.driver_name,
        weekTotal: d.week_total || 0,
        mon: d.mon || 0, tue: d.tue || 0, wed: d.wed || 0,
        thu: d.thu || 0, fri: d.fri || 0,
      }))
      .sort((a, b) => b.weekTotal - a.weekTotal)

    // Unassigned ZIP frequency
    const unassignedZips = {}
    recentUnassigned.forEach(r => {
      if (r.zip) unassignedZips[r.zip] = (unassignedZips[r.zip] || 0) + 1
    })
    const topUnassignedZips = Object.entries(unassignedZips)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([zip, count]) => `${zip} (${count}x)`)

    const prompt = `You are an operations analyst for CNC Delivery Service, a pharmacy delivery company in Northeast Ohio serving two pharmacies (SHSP in Akron, Aultman in Canton) with 16 drivers.

Analyze this week's delivery data and provide insights for the owner, Dom.

THIS WEEK SUMMARY:
- Total orders: ${thisWeekTotal}
- SHSP: ${thisWeekSHSP} | Aultman: ${thisWeekAultman}
- Cold chain: ${thisWeekCC} (${thisWeekTotal ? Math.round((thisWeekCC / thisWeekTotal) * 100) : 0}%)
- Unassigned: ${thisWeekUnassigned}
- Daily breakdown: ${thisWeek.map(d => `${d.delivery_day}: ${d.orders_processed} orders`).join(', ')}

LAST 4 WEEKS COMPARISON:
${weeklyBreakdowns.map(w => `${w.week} (${w.dates}): ${w.total} total, SHSP ${w.shsp}, Aultman ${w.aultman}, CC ${w.coldChain}, Unassigned ${w.unassigned}`).join('\n')}

DRIVER PERFORMANCE (this week):
${driverSummary.map(d => `${d.name}: ${d.weekTotal} total (M:${d.mon} T:${d.tue} W:${d.wed} Th:${d.thu} F:${d.fri})`).join('\n')}

FREQUENTLY UNASSIGNED ZIPS (last 50 entries):
${topUnassignedZips.join(', ') || 'None'}

TOP ZIPS BY VOLUME:
${topZips.join('\n')}

Respond with EXACTLY this format — no markdown, plain text only:

KEY INSIGHTS:
• [insight 1]
• [insight 2]
• [insight 3]

ANOMALIES:
• [anomaly 1]
• [anomaly 2 if applicable]

RECOMMENDATIONS:
• [recommendation 1]
• [recommendation 2]

PREDICTION:
• [one prediction based on trends]

Keep each bullet to 1-2 sentences. Be specific with numbers. This goes in a business email.`

    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })

    const insights = message.content[0]?.text || 'No insights generated.'

    return res.status(200).json({
      insights,
      summary: {
        thisWeekTotal, thisWeekSHSP, thisWeekAultman,
        thisWeekCC, thisWeekUnassigned,
        dispatches: thisWeek.length,
      },
    })
  } catch (err) {
    console.error('[ai-insights]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
