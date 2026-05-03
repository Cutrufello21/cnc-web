import { supabase } from './_lib/supabase.js'
import { parseBody } from './_lib/sheets.js'

// Logs dispatch decisions for the learning engine
// Every manual move, optimize accept/reject, and initial vs final state
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const data = await parseBody(req)

  try {
    if (data.action === 'log_move') {
      // Log a manual stop reassignment
      await supabase.from('dispatch_decisions').insert({
        delivery_date: data.deliveryDate,
        delivery_day: data.deliveryDay,
        order_id: data.orderId,
        zip: data.zip,
        city: data.city,
        pharmacy: data.pharmacy,
        from_driver: data.fromDriver,
        to_driver: data.toDriver,
        decision_type: 'manual_move',
        context: data.context || null, // e.g. "driver_off", "load_balance", "preference"
      })
      return res.status(200).json({ success: true })
    }

    if (data.action === 'log_optimize') {
      // Log an optimize preview acceptance or rejection
      const rows = (data.changes || []).map(c => ({
        delivery_date: data.deliveryDate,
        delivery_day: data.deliveryDay,
        order_id: c.orderId,
        zip: c.zip,
        city: c.city,
        from_driver: c.from,
        to_driver: c.to,
        decision_type: data.accepted ? 'optimize_accepted' : 'optimize_rejected',
        context: c.reason,
      }))
      if (rows.length > 0) {
        await supabase.from('dispatch_decisions').insert(rows)
      }
      return res.status(200).json({ success: true })
    }

    if (data.action === 'snapshot') {
      // Snapshot the final state of daily_stops for a date (called when routes are sent)
      const { data: stops } = await supabase.from('daily_stops')
        .select('order_id, driver_name, zip, city, pharmacy')
        .eq('delivery_date', data.deliveryDate)

      const rows = (stops || []).map(s => ({
        delivery_date: data.deliveryDate,
        delivery_day: data.deliveryDay,
        order_id: s.order_id,
        zip: s.zip,
        city: s.city,
        pharmacy: s.pharmacy,
        from_driver: s.driver_name, // final assignment
        to_driver: s.driver_name,
        decision_type: 'final_state',
        context: null,
      }))
      if (rows.length > 0) {
        // Delete any existing final_state for this date first
        await supabase.from('dispatch_decisions').delete()
          .eq('delivery_date', data.deliveryDate).eq('decision_type', 'final_state')
        await supabase.from('dispatch_decisions').insert(rows)
      }
      return res.status(200).json({ success: true, logged: rows.length })
    }

    if (data.action === 'get_patterns') {
      // Analyze historical decisions and return learned patterns
      // Include initial→final diffs alongside manual moves
      const [movesRes, snapshotsRes] = await Promise.all([
        supabase.from('dispatch_decisions').select('*')
          .in('decision_type', ['manual_move', 'optimize_accepted'])
          .order('created_at', { ascending: false }).limit(5000),
        supabase.from('dispatch_decisions').select('*')
          .in('decision_type', ['initial_state', 'final_state'])
          .order('created_at', { ascending: false }).limit(10000),
      ])

      // Build diff from initial vs final snapshots
      const snapshots = snapshotsRes.data || []
      const byDateType = {}
      snapshots.forEach(s => {
        const key = `${s.delivery_date}|${s.decision_type}`
        if (!byDateType[key]) byDateType[key] = {}
        byDateType[key][s.order_id] = s
      })

      // Find dates that have both initial and final
      const dates = new Set(snapshots.map(s => s.delivery_date))
      const diffDecisions = []
      for (const date of dates) {
        const initial = byDateType[`${date}|initial_state`] || {}
        const final = byDateType[`${date}|final_state`] || {}
        for (const [orderId, finalRow] of Object.entries(final)) {
          const initialRow = initial[orderId]
          if (initialRow && initialRow.from_driver !== finalRow.from_driver) {
            diffDecisions.push({
              delivery_date: date,
              delivery_day: finalRow.delivery_day,
              order_id: orderId,
              zip: finalRow.zip,
              city: finalRow.city,
              pharmacy: finalRow.pharmacy,
              from_driver: initialRow.from_driver,
              to_driver: finalRow.from_driver,
              decision_type: 'snapshot_diff',
            })
          }
        }
      }

      const decisions = [...(movesRes.data || []), ...diffDecisions]
        .limit(5000)

      if (!decisions || decisions.length < 10) {
        return res.status(200).json({ patterns: [], message: 'Not enough data yet. Keep dispatching — patterns emerge after 2-4 weeks.' })
      }

      // Pattern 1: When driver X is off, where do their ZIPs go?
      const driverOffPatterns = {}
      decisions.forEach(d => {
        if (!d.from_driver || !d.to_driver || d.from_driver === d.to_driver) return
        const key = `${d.from_driver}|${d.zip}`
        if (!driverOffPatterns[key]) driverOffPatterns[key] = {}
        driverOffPatterns[key][d.to_driver] = (driverOffPatterns[key][d.to_driver] || 0) + 1
      })

      const zipPreferences = []
      for (const [key, targets] of Object.entries(driverOffPatterns)) {
        const [fromDriver, zip] = key.split('|')
        const total = Object.values(targets).reduce((s, v) => s + v, 0)
        if (total < 3) continue // need at least 3 data points

        const sorted = Object.entries(targets).sort((a, b) => b[1] - a[1])
        const [topDriver, topCount] = sorted[0]
        const confidence = Math.round((topCount / total) * 100)

        if (confidence >= 60) {
          zipPreferences.push({
            type: 'zip_preference',
            fromDriver, zip, toDriver: topDriver,
            confidence, occurrences: total,
            description: `When ${fromDriver}'s ZIP ${zip} needs reassignment, you send it to ${topDriver} (${confidence}% of the time, ${topCount}/${total})`,
          })
        }
      }

      // Pattern 2: Load balance thresholds — at what point do you start moving stops?
      const movesByLoad = decisions.filter(d => d.context?.includes('balance') || d.context?.includes('Rebalance'))

      // Pattern 3: Day-of-week preferences
      const dayPatterns = {}
      decisions.forEach(d => {
        if (!d.delivery_day || !d.to_driver || !d.zip) return
        const key = `${d.delivery_day}|${d.zip}`
        if (!dayPatterns[key]) dayPatterns[key] = {}
        dayPatterns[key][d.to_driver] = (dayPatterns[key][d.to_driver] || 0) + 1
      })

      const dayPreferences = []
      for (const [key, targets] of Object.entries(dayPatterns)) {
        const [day, zip] = key.split('|')
        const total = Object.values(targets).reduce((s, v) => s + v, 0)
        if (total < 3) continue

        const sorted = Object.entries(targets).sort((a, b) => b[1] - a[1])
        const [topDriver, topCount] = sorted[0]
        const confidence = Math.round((topCount / total) * 100)

        if (confidence >= 70) {
          dayPreferences.push({
            type: 'day_preference',
            day, zip, toDriver: topDriver,
            confidence, occurrences: total,
            description: `On ${day}s, ZIP ${zip} goes to ${topDriver} (${confidence}%, ${topCount}/${total})`,
          })
        }
      }

      const allPatterns = [...zipPreferences, ...dayPreferences]
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 50)

      return res.status(200).json({
        patterns: allPatterns,
        totalDecisions: decisions.length,
        message: allPatterns.length > 0
          ? `Found ${allPatterns.length} patterns from ${decisions.length} decisions.`
          : `${decisions.length} decisions logged. Patterns will emerge with more data.`,
      })
    }

    if (data.action === 'snapshot_initial') {
      // Only save if no initial snapshot exists for this date
      const { count } = await supabase.from('dispatch_decisions')
        .select('id', { count: 'exact', head: true })
        .eq('delivery_date', data.deliveryDate)
        .eq('decision_type', 'initial_state')

      if (count > 0) {
        return res.status(200).json({ success: true, message: 'Initial snapshot already exists' })
      }

      const { data: stops } = await supabase.from('daily_stops')
        .select('order_id, driver_name, zip, city, pharmacy')
        .eq('delivery_date', data.deliveryDate)

      const rows = (stops || []).map(s => ({
        delivery_date: data.deliveryDate,
        delivery_day: data.deliveryDay || null,
        order_id: s.order_id,
        zip: s.zip,
        city: s.city,
        pharmacy: s.pharmacy,
        from_driver: s.driver_name,
        to_driver: s.driver_name,
        decision_type: 'initial_state',
        context: null,
      }))

      if (rows.length > 0) {
        await supabase.from('dispatch_decisions').insert(rows)
      }
      return res.status(200).json({ success: true, logged: rows.length })
    }

    if (data.action === 'auto_log') {
      // Auto-generate dispatch_logs entry from daily_stops data
      const { data: stops } = await supabase.from('daily_stops')
        .select('driver_name, pharmacy, cold_chain')
        .eq('delivery_date', data.deliveryDate)
        .not('status', 'eq', 'DELETED')

      if (!stops || stops.length === 0) {
        return res.status(200).json({ success: true, message: 'No stops found for date' })
      }

      const totalOrders = stops.length
      const coldChain = stops.filter(s => s.cold_chain === true).length
      const shspOrders = stops.filter(s => s.pharmacy === 'SHSP').length
      const aultmanOrders = totalOrders - shspOrders
      const unassigned = stops.filter(s => !s.driver_name || s.driver_name === '').length

      // Find top driver by stop count
      const driverCounts = {}
      stops.forEach(s => {
        if (s.driver_name) driverCounts[s.driver_name] = (driverCounts[s.driver_name] || 0) + 1
      })
      const topDriver = Object.entries(driverCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null

      const logEntry = {
        date: data.deliveryDate,
        delivery_day: data.deliveryDay,
        status: 'routes_sent',
        orders_processed: totalOrders,
        cold_chain: coldChain,
        unassigned_count: unassigned,
        corrections: 0,
        shsp_orders: shspOrders,
        aultman_orders: aultmanOrders,
        top_driver: topDriver,
      }
      if (data.session_corrections != null) logEntry.session_corrections = data.session_corrections
      if (data.session_duration_minutes != null) logEntry.session_duration_minutes = data.session_duration_minutes
      await supabase.from('dispatch_logs').upsert(logEntry, { onConflict: 'date' })

      return res.status(200).json({ success: true, totalOrders, topDriver })
    }

    if (data.action === 'log_sort_list') {
      await supabase.from('dispatch_decisions').insert({
        delivery_date: data.deliveryDate,
        delivery_day: data.deliveryDay || null,
        order_id: null,
        zip: null,
        city: null,
        pharmacy: data.pharmacy || null,
        from_driver: data.driverName || null,
        to_driver: null,
        decision_type: `sort_${data.sortAction}`, // sort_edit, sort_add, sort_delete, sort_late_start, sort_check
        context: data.detail || null,
      })
      return res.status(200).json({ success: true })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (err) {
    console.error('[dispatch-decisions]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
