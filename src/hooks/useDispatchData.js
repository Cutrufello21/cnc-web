import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { dbUpdate } from '../lib/db'

const normalizeAddr = (a) => (a || '').toLowerCase().trim().replace(/\s+/g, ' ')
  .replace(/\bboulevard\b/g, 'blvd').replace(/\bdrive\b/g, 'dr').replace(/\bstreet\b/g, 'st')
  .replace(/\bavenue\b/g, 'ave').replace(/\broad\b/g, 'rd').replace(/\blane\b/g, 'ln')
  .replace(/\bcourt\b/g, 'ct').replace(/\bplace\b/g, 'pl').replace(/\bcircle\b/g, 'cir')
  .replace(/\bparkway\b/g, 'pkwy').replace(/\bhighway\b/g, 'hwy').replace(/\bsuite\b/g, 'ste')
  .replace(/\bapartment\b/g, 'apt').replace(/\bnorth\b/g, 'n').replace(/\bsouth\b/g, 's')
  .replace(/\beast\b/g, 'e').replace(/\bwest\b/g, 'w').replace(/\bnortheast\b/g, 'ne')
  .replace(/\bnorthwest\b/g, 'nw').replace(/\bsoutheast\b/g, 'se').replace(/\bsouthwest\b/g, 'sw')
  .replace(/[.,#]/g, '').replace(/\s+/g, ' ').replace(/\b(ste|suite|unit|apt)\b\s*/g, '').trim()

function getDeliveryDay(weekOffset) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const now = new Date()
  const hour = now.getHours()
  const todayIdx = now.getDay()

  if (todayIdx === 6) return 'Monday'  // Saturday → Monday
  if (todayIdx === 0) return 'Monday'  // Sunday → Monday
  if (hour >= 18) {
    if (todayIdx === 5) return 'Monday'  // Friday 6PM → Monday
    return dayNames[todayIdx + 1]
  }
  return dayNames[todayIdx]
}

function getDeliveryDate(deliveryDay, weekOffset) {
  const now = new Date()
  const dayOfWeek = now.getDay()
  // Saturday/Sunday → advance to next Monday
  const mondayOffset = dayOfWeek === 6 ? 2 : dayOfWeek === 0 ? 1 : 1 - dayOfWeek
  const monday = new Date(now)
  monday.setDate(now.getDate() + mondayOffset + (weekOffset * 7))
  const dayIndex = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].indexOf(deliveryDay)
  const deliveryDate = new Date(monday)
  deliveryDate.setDate(monday.getDate() + (dayIndex >= 0 ? dayIndex : 0))
  const dateStr = `${deliveryDate.getFullYear()}-${String(deliveryDate.getMonth() + 1).padStart(2, '0')}-${String(deliveryDate.getDate()).padStart(2, '0')}`
  return { deliveryDate, monday, dateStr }
}

function consolidateStops(rawDetails) {
  const addrGroups = {}
  for (const stop of rawDetails) {
    const key = normalizeAddr(stop.Address)
    if (!addrGroups[key]) addrGroups[key] = []
    addrGroups[key].push(stop)
  }
  const consolidated = []
  const seen = new Set()
  for (const stop of rawDetails) {
    const key = normalizeAddr(stop.Address)
    if (seen.has(key)) continue
    seen.add(key)
    const group = addrGroups[key]
    if (group.length === 1) {
      consolidated.push({ ...group[0], _packageCount: 1, _consolidatedOrderIds: [group[0]['Order ID']] })
    } else {
      const primary = { ...group[0] }
      primary._packageCount = group.length
      primary._coldChain = group.some(s => s._coldChain)
      primary['Cold Chain'] = primary._coldChain ? 'Yes' : ''
      primary.Notes = group.map(s => s.Notes).filter(Boolean).join(' | ')
      primary._consolidatedOrderIds = group.map(s => s['Order ID'])
      primary._consolidatedNames = group.map(s => s.Name)
      consolidated.push(primary)
    }
  }
  return consolidated
}

function groupStopsByDriver(stops) {
  const driverStops = {}
  stops.forEach(s => {
    if (!driverStops[s.driver_name]) {
      driverStops[s.driver_name] = { stops: 0, coldChain: 0, totalPackages: 0, stopDetails: [] }
    }
    const ds = driverStops[s.driver_name]
    ds.stops++
    if (s.cold_chain) ds.coldChain++
    ds.stopDetails.push({
      'Order ID': s.order_id, Name: s.patient_name,
      Address: s.address, City: s.city, ZIP: s.zip,
      Pharmacy: s.pharmacy, 'Cold Chain': s.cold_chain ? 'Yes' : '',
      _coldChain: s.cold_chain, _ccEdited: s.cc_edited || false, Notes: s.notes || '',
      _status: s.status || 'dispatched', _stopId: s.id,
      lat: s.lat, lng: s.lng,
      order_id: s.order_id, patient_name: s.patient_name,
      address: s.address, city: s.city, zip: s.zip,
      cold_chain: s.cold_chain, pharmacy: s.pharmacy,
    })
  })

  for (const dName of Object.keys(driverStops)) {
    const ds = driverStops[dName]
    ds.totalPackages = ds.stops
    ds.stopDetails = consolidateStops(ds.stopDetails)
    ds.consolidatedStops = ds.stopDetails.length
  }

  return driverStops
}

function buildWarnings(driversOff, driverStops) {
  const warnings = []
  for (const offDriver of driversOff) {
    const ds = driverStops[offDriver]
    if (ds && ds.stops > 0) {
      warnings.push({
        type: 'driver-off',
        severity: 'high',
        message: `${offDriver} is OFF but has ${ds.stops} stops assigned — reassign them`,
        details: [offDriver],
      })
    }
  }
  return warnings
}

export default function useDispatchData(weekOffset) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedDay, setSelectedDay] = useState(null)
  const [pendingTimeOff, setPendingTimeOff] = useState(0)

  const fetchDispatchData = useCallback(async (day) => {
    if (!data) setLoading(true)
    setError(null)

    try {
      const deliveryDay = day || getDeliveryDay(weekOffset)
      const { deliveryDate, monday, dateStr } = getDeliveryDate(deliveryDay, weekOffset)

      const [driversRes, routingRes, logsRes, stopsRes] = await Promise.all([
        supabase.from('drivers').select('*').eq('active', true).order('driver_name'),
        supabase.from('routing_rules').select('*'),
        supabase.from('dispatch_logs').select('*').order('date', { ascending: false }).limit(7),
        supabase.from('daily_stops').select('*').eq('delivery_date', dateStr),
      ])

      const drivers = (driversRes.data || []).filter(d => d.driver_name)
      const routingRules = routingRes.data || []
      const assignedZips = new Set(routingRules.map(r => r.zip_code).filter(Boolean))
      const stops = stopsRes.data || []

      // Auto-geocode stops missing lat/lng (fire and forget — don't block)
      const ungeocodedStops = stops.filter(s => !s.lat && !s.lng && s.address && s.status !== 'DELETED')
      if (ungeocodedStops.length > 0) {
        (async () => {
          try {
            for (let i = 0; i < ungeocodedStops.length; i += 50) {
              const batch = ungeocodedStops.slice(i, i + 50)
              const addresses = batch.map(s => ({ address: s.address || '', city: s.city || '', zip: s.zip || '' }))
              const res = await fetch('/api/geocode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ addresses }) })
              const gdata = await res.json()
              const results = gdata.results || []
              for (let j = 0; j < results.length; j++) {
                if (results[j].lat && results[j].lng && batch[j].id) {
                  dbUpdate('daily_stops', { lat: results[j].lat, lng: results[j].lng }, { id: batch[j].id }).catch(() => {})
                }
              }
            }
            // Refresh data after geocoding completes
            if (ungeocodedStops.length > 10) setTimeout(() => fetchDispatchData(day), 2000)
          } catch {}
        })()
      }

      const [timeOffRes2, schedRes2, overRes2] = await Promise.all([
        supabase.from('time_off_requests').select('driver_name').eq('date_off', dateStr).in('status', ['approved', 'pending']),
        supabase.from('driver_schedule').select('*'),
        supabase.from('schedule_overrides').select('*').eq('date', dateStr),
      ])
      const driversOff = new Set((timeOffRes2.data || []).map(r => r.driver_name))
      const schedMap = {}
      ;(schedRes2.data || []).forEach(r => { schedMap[r.driver_name] = r })
      const overMap = {}
      ;(overRes2.data || []).forEach(r => { overMap[r.driver_name] = r })
      const dayCol = deliveryDay.slice(0, 3).toLowerCase()

      const scheduledToWork = new Set()
      const shiftMap = {} // driver_name → 'AM' | 'PM' | 'A+P'
      drivers.forEach(d => {
        if (driversOff.has(d.driver_name)) return
        const override = overMap[d.driver_name]
        if (override) {
          if (override.status === 'working') {
            scheduledToWork.add(d.driver_name)
            shiftMap[d.driver_name] = override.shift || d.shift || 'AM'
          }
          return
        }
        const sched = schedMap[d.driver_name]
        if (!sched || (sched[dayCol] !== false && sched[dayCol] !== 'false' && sched[dayCol] !== 0)) {
          scheduledToWork.add(d.driver_name)
          shiftMap[d.driver_name] = sched?.[`${dayCol}_shift`] || d.shift || 'AM'
        }
      })

      const driverStops = groupStopsByDriver(stops)

      const WEEKDAYS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
      const recentLogs = (logsRes.data || [])
        .filter(r => WEEKDAYS.has(r.delivery_day))
        .slice(0, 7)
        .map(r => ({
          Date: r.date, 'Delivery Day': r.delivery_day,
          'Orders Processed': r.orders_processed, 'Cold Chain': r.cold_chain,
          'Unassigned Count': r.unassigned_count, Status: r.status,
          'Top Driver': r.top_driver,
        }))

      const warnings = buildWarnings(driversOff, driverStops)

      setData({
        deliveryDay,
        deliveryDateObj: deliveryDate,
        weekMonday: monday,
        scheduledToWork,
        allDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        drivers: drivers.map(d => ({
          'Driver Name': d.driver_name,
          'Driver #': d.driver_number,
          Pharmacy: d.pharmacy || '',
          is_admin: !!d.is_admin,
          shift: shiftMap[d.driver_name] || d.shift || 'AM',
          Email: d.email,
          isOff: driversOff.has(d.driver_name),
          stops: driverStops[d.driver_name]?.consolidatedStops ?? driverStops[d.driver_name]?.stops ?? 0,
          totalPackages: driverStops[d.driver_name]?.totalPackages ?? driverStops[d.driver_name]?.stops ?? 0,
          coldChain: driverStops[d.driver_name]?.coldChain ?? 0,
          hidden: false,
          tabName: `${d.driver_name} - ${d.driver_number}`,
          stopDetails: driverStops[d.driver_name]?.stopDetails ?? [],
        })),
        summary: null,
        unassigned: (driverStops['Unassigned']?.stopDetails || []).map(s => ({
          zip: s.ZIP, pharmacy: s.Pharmacy, city: s.City,
          name: s.Name, order_id: s['Order ID'], address: s.Address,
          _stopId: s._stopId,
        })),
        warnings,
        recentLogs,
        routingRuleCount: routingRules.length,
        assignedZipCount: assignedZips.size,
      })
      setSelectedDay(deliveryDay)

      if (stops.length > 0) {
        fetch('/api/dispatch-log-decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'snapshot_initial', deliveryDate: dateStr, deliveryDay }),
        }).catch(() => {})
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [weekOffset])

  useEffect(() => {
    fetchDispatchData()
    supabase.from('time_off_requests').select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => setPendingTimeOff(count || 0))
  }, [weekOffset, fetchDispatchData])

  return { data, setData, loading, error, selectedDay, setSelectedDay, pendingTimeOff, fetchDispatchData }
}
