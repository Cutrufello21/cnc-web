import Anthropic from '@anthropic-ai/sdk'
import { fetchRange, MASTER_SHEET_ID } from './_lib/sheets.js'

const WEEKDAYS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })

  try {
    // Fetch data in parallel
    const [logRaw, weeklyRaw, unassignedRaw, zipRaw] = await Promise.all([
      fetchRange(MASTER_SHEET_ID, 'Log!A1:M500'),
      fetchRange(MASTER_SHEET_ID, 'Weekly Stops!A1:K25'),
      fetchRange(MASTER_SHEET_ID, 'Unassigned History!A1:F500'),
      fetchRange(MASTER_SHEET_ID, 'ZIP Analytics!A1:F30'),
    ])

    // Parse log — weekdays only
    const logHeaders = logRaw[0]?.map(h => h.trim()) || []
    const allLogs = logRaw.slice(1).map(row => {
      const obj = {}
      logHeaders.forEach((h, i) => { obj[h] = row[i] || '' })
      return obj
    }).filter(r => r.Date && WEEKDAYS.has(r['Delivery Day']))

    // This week (last 5 entries) and last 4 weeks
    const thisWeek = allLogs.slice(-5)
    const last4Weeks = allLogs.slice(-25)

    // Weekly stops
    const wsHeaders = weeklyRaw[0]?.map(h => h.trim()) || []
    const weeklyStops = weeklyRaw.slice(1).map(row => {
      const obj = {}
      wsHeaders.forEach((h, i) => { obj[h] = row[i] || '' })
      return obj
    }).filter(r => r['Driver Name'] && r['Driver Name'] !== 'TOTAL' && r['Driver Name'] !== 'Paul')

    // Recent unassigned
    const uhHeaders = unassignedRaw[0]?.map(h => h.trim()) || []
    const recentUnassigned = unassignedRaw.slice(-50).map(row => {
      const obj = {}
      uhHeaders.forEach((h, i) => { obj[h] = row[i] || '' })
      return obj
    }).filter(r => r.ZIP)

    // Top ZIPs
    const zipHeaders = zipRaw[0]?.map(h => h.trim()) || []
    const topZips = zipRaw.slice(1, 11).map(row => {
      const obj = {}
      zipHeaders.forEach((h, i) => { obj[h] = row[i] || '' })
      return obj
    })

    // Build summary for Claude
    const thisWeekTotal = thisWeek.reduce((s, r) => s + (parseInt(r['Orders Processed']) || 0), 0)
    const thisWeekSHSP = thisWeek.reduce((s, r) => s + (parseInt(r['SHSP Orders']) || 0), 0)
    const thisWeekAultman = thisWeek.reduce((s, r) => s + (parseInt(r['Aultman Orders']) || 0), 0)
    const thisWeekCC = thisWeek.reduce((s, r) => s + (parseInt(r['Cold Chain']) || 0), 0)
    const thisWeekUnassigned = thisWeek.reduce((s, r) => s + (parseInt(r['Unassigned Count']) || 0), 0)

    // Weekly breakdowns for last 4 weeks
    const weeklyBreakdowns = []
    for (let i = 0; i < 4; i++) {
      const start = last4Weeks.length - (5 * (i + 1))
      const end = last4Weeks.length - (5 * i)
      const week = last4Weeks.slice(Math.max(0, start), end)
      if (week.length === 0) continue
      weeklyBreakdowns.push({
        week: `Week ${4 - i}`,
        dates: `${week[0]?.Date || '?'} - ${week[week.length - 1]?.Date || '?'}`,
        total: week.reduce((s, r) => s + (parseInt(r['Orders Processed']) || 0), 0),
        shsp: week.reduce((s, r) => s + (parseInt(r['SHSP Orders']) || 0), 0),
        aultman: week.reduce((s, r) => s + (parseInt(r['Aultman Orders']) || 0), 0),
        coldChain: week.reduce((s, r) => s + (parseInt(r['Cold Chain']) || 0), 0),
        unassigned: week.reduce((s, r) => s + (parseInt(r['Unassigned Count']) || 0), 0),
      })
    }

    // Driver performance
    const driverSummary = weeklyStops.map(d => ({
      name: d['Driver Name'],
      weekTotal: parseInt(d['Week Total']) || 0,
      mon: parseInt(d.Mon) || 0,
      tue: parseInt(d.Tue) || 0,
      wed: parseInt(d.Wed) || 0,
      thu: parseInt(d.Thu) || 0,
      fri: parseInt(d.Fri) || 0,
    })).sort((a, b) => b.weekTotal - a.weekTotal)

    // Unassigned ZIP frequency
    const unassignedZips = {}
    recentUnassigned.forEach(r => {
      const zip = r.ZIP
      if (zip) unassignedZips[zip] = (unassignedZips[zip] || 0) + 1
    })
    const topUnassignedZips = Object.entries(unassignedZips)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([zip, count]) => `${zip} (${count}x)`)

    const prompt = `You are an operations analyst for CNC Delivery Service, a pharmacy delivery company in Northeast Ohio serving two pharmacies (SHSP in Akron, Aultman in Canton) with 16 drivers.

Analyze this week's delivery data and provide insights for the owner, Dom.

THIS WEEK SUMMARY:
- Total orders: ${thisWeekTotal}
- SHSP: ${thisWeekSHSP} | Aultman: ${thisWeekAultman}
- Cold chain: ${thisWeekCC} (${thisWeekTotal ? Math.round((thisWeekCC / thisWeekTotal) * 100) : 0}%)
- Unassigned: ${thisWeekUnassigned}
- Daily breakdown: ${thisWeek.map(d => `${d['Delivery Day']}: ${d['Orders Processed']} orders`).join(', ')}

LAST 4 WEEKS COMPARISON:
${weeklyBreakdowns.map(w => `${w.week} (${w.dates}): ${w.total} total, SHSP ${w.shsp}, Aultman ${w.aultman}, CC ${w.coldChain}, Unassigned ${w.unassigned}`).join('\n')}

DRIVER PERFORMANCE (this week):
${driverSummary.map(d => `${d.name}: ${d.weekTotal} total (M:${d.mon} T:${d.tue} W:${d.wed} Th:${d.thu} F:${d.fri})`).join('\n')}

FREQUENTLY UNASSIGNED ZIPS (last 50 entries):
${topUnassignedZips.join(', ') || 'None'}

TOP ZIPS BY VOLUME:
${topZips.map(z => Object.values(z).join(' | ')).join('\n')}

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
        thisWeekTotal,
        thisWeekSHSP,
        thisWeekAultman,
        thisWeekCC,
        thisWeekUnassigned,
        dispatches: thisWeek.length,
      },
    })
  } catch (err) {
    console.error('[ai-insights]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
