import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import './Revenue.css'

const OUTLIER_ZIPS = new Set([
  '43450','43986','43988','44230','44270','44273','44276','44281',
  '44314','44606','44608','44612','44613','44624','44626','44627',
  '44651','44675','44678','44681','44683','44691',
])

const FIRST_ORDER_RATE = 11.00
const ADDITIONAL_RATE = 9.40
const OUTLIER_FIRST_RATE = 32.50
const AULTMAN_DAILY_MIN = 220.00
const MILEAGE_RATE = 1.32
const MILEAGE_MIN_MILES = 10
const MILEAGE_MIN_CHARGE = 13.25

export default function Revenue({ weekOf, driverPayroll }) {
  const [stops, setStops] = useState([])
  const [loading, setLoading] = useState(true)
  const [willCallMiles, setWillCallMiles] = useState(0)
  const [willCallCount, setWillCallCount] = useState(0)

  useEffect(() => { loadStops() }, [weekOf])

  async function loadStops() {
    if (!weekOf) return
    setLoading(true)
    // Get all stops for this week (Mon-Fri)
    const monday = new Date(weekOf + 'T12:00:00')
    const friday = new Date(monday)
    friday.setDate(friday.getDate() + 4)
    const monStr = weekOf
    const friStr = `${friday.getFullYear()}-${String(friday.getMonth()+1).padStart(2,'0')}-${String(friday.getDate()).padStart(2,'0')}`

    // Fetch all stops for the week (may exceed 1000 default limit)
    let allStops = []
    let page = 0
    const pageSize = 1000
    while (true) {
      const { data } = await supabase.from('daily_stops')
        .select('delivery_date, zip, pharmacy')
        .gte('delivery_date', monStr)
        .lte('delivery_date', friStr)
        .range(page * pageSize, (page + 1) * pageSize - 1)
      allStops = allStops.concat(data || [])
      if (!data || data.length < pageSize) break
      page++
    }

    setStops(allStops)

    // Load afternoon deliveries from all drivers → sum into will call trips
    const { data: reconData } = await supabase.from('stop_reconciliation')
      .select('afternoon_stops')
      .eq('week_of', weekOf)
      .not('afternoon_stops', 'is', null)
    const totalAfternoon = (reconData || []).reduce((s, r) => s + (r.afternoon_stops || 0), 0)
    if (totalAfternoon > 0) setWillCallCount(totalAfternoon)

    setLoading(false)
  }

  const revenue = useMemo(() => {
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    const days = {}

    // Group by date
    const byDate = {}
    stops.forEach(s => {
      if (!byDate[s.delivery_date]) byDate[s.delivery_date] = []
      byDate[s.delivery_date].push(s)
    })

    const sortedDates = Object.keys(byDate).sort()
    let weekShsp = 0
    let weekAultman = 0
    let weekTotal = 0

    const dailyBreakdown = sortedDates.map((date, idx) => {
      const dayStops = byDate[date]
      const dayName = dayNames[idx] || date.slice(5)

      // Calculate per-pharmacy revenue
      const calc = (pharmacy) => {
        const pharmaStops = dayStops.filter(s => s.pharmacy === pharmacy)
        if (pharmaStops.length === 0) return 0

        // Group by ZIP
        const zipCounts = {}
        pharmaStops.forEach(s => {
          zipCounts[s.zip] = (zipCounts[s.zip] || 0) + 1
        })

        let total = 0
        for (const [zip, count] of Object.entries(zipCounts)) {
          const firstRate = OUTLIER_ZIPS.has(zip) ? OUTLIER_FIRST_RATE : FIRST_ORDER_RATE
          total += firstRate + (count - 1) * ADDITIONAL_RATE
        }

        return total
      }

      let shsp = calc('SHSP')
      let aultman = calc('Aultman')

      // Aultman daily minimum
      if (aultman > 0 && aultman < AULTMAN_DAILY_MIN) {
        aultman = AULTMAN_DAILY_MIN
      }

      weekShsp += shsp
      weekAultman += aultman

      return {
        day: dayName, date,
        shsp: Math.round(shsp * 100) / 100,
        aultman: Math.round(aultman * 100) / 100,
        total: Math.round((shsp + aultman) * 100) / 100,
        shspStops: dayStops.filter(s => s.pharmacy === 'SHSP').length,
        aultmanStops: dayStops.filter(s => s.pharmacy === 'Aultman').length,
      }
    })

    // Will call / return charges
    const willCallCharge = willCallMiles > 0
      ? Math.max(willCallMiles * MILEAGE_RATE, willCallCount * MILEAGE_MIN_CHARGE)
      : 0

    weekTotal = weekShsp + weekAultman + willCallCharge

    return {
      daily: dailyBreakdown,
      weekShsp: Math.round(weekShsp * 100) / 100,
      weekAultman: Math.round(weekAultman * 100) / 100,
      willCallCharge: Math.round(willCallCharge * 100) / 100,
      weekTotal: Math.round(weekTotal * 100) / 100,
    }
  }, [stops, willCallMiles, willCallCount])

  const grossProfit = revenue.weekTotal - (driverPayroll || 0)

  if (loading) return <div className="rev__loading">Loading revenue...</div>

  return (
    <div className="rev">
      <h3 className="rev__title">Revenue</h3>
      <p className="rev__sub">What Lab Logistics pays CNC Delivery</p>

      <div className="rev__table-wrap">
        <table className="rev__table">
          <thead>
            <tr>
              <th>Day</th>
              <th className="rev__th-num">SHSP Stops</th>
              <th className="rev__th-num">SHSP Rev</th>
              <th className="rev__th-num">Aultman Stops</th>
              <th className="rev__th-num">Aultman Rev</th>
              <th className="rev__th-num">Day Total</th>
            </tr>
          </thead>
          <tbody>
            {revenue.daily.map(d => (
              <tr key={d.date}>
                <td className="rev__cell-day">{d.day}</td>
                <td className="rev__cell-num">{d.shspStops || '—'}</td>
                <td className="rev__cell-num">${d.shsp.toFixed(2)}</td>
                <td className="rev__cell-num">{d.aultmanStops || '—'}</td>
                <td className="rev__cell-num">${d.aultman.toFixed(2)}</td>
                <td className="rev__cell-num rev__cell-total">${d.total.toFixed(2)}</td>
              </tr>
            ))}
            {revenue.daily.length === 0 && (
              <tr><td colSpan={6} className="rev__empty">No stops this week</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="rev__subtotal">
              <td>Subtotal</td>
              <td></td>
              <td className="rev__cell-num">${revenue.weekShsp.toFixed(2)}</td>
              <td></td>
              <td className="rev__cell-num">${revenue.weekAultman.toFixed(2)}</td>
              <td className="rev__cell-num rev__cell-total">${(revenue.weekShsp + revenue.weekAultman).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Will Calls / Returns */}
      <div className="rev__willcall">
        <h4 className="rev__willcall-title">Will Calls & Returns</h4>
        <p className="rev__willcall-sub">$1.32/mile, minimum 10 miles or $13.25 per trip</p>
        <div className="rev__willcall-inputs">
          <div className="rev__willcall-field">
            <label>Trips</label>
            <input type="number" min="0" value={willCallCount || ''} placeholder="0"
              onChange={e => setWillCallCount(parseInt(e.target.value) || 0)} />
          </div>
          <div className="rev__willcall-field">
            <label>Total Miles</label>
            <input type="number" min="0" step="0.1" value={willCallMiles || ''} placeholder="0"
              onChange={e => setWillCallMiles(parseFloat(e.target.value) || 0)} />
          </div>
          <div className="rev__willcall-field">
            <label>Charge</label>
            <span className="rev__willcall-amount">${revenue.willCallCharge.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="rev__summary">
        <div className="rev__summary-row">
          <span>SHSP Revenue</span>
          <span>${revenue.weekShsp.toFixed(2)}</span>
        </div>
        <div className="rev__summary-row">
          <span>Aultman Revenue</span>
          <span>${revenue.weekAultman.toFixed(2)}</span>
        </div>
        {revenue.willCallCharge > 0 && (
          <div className="rev__summary-row">
            <span>Will Calls / Returns</span>
            <span>${revenue.willCallCharge.toFixed(2)}</span>
          </div>
        )}
        <div className="rev__summary-row rev__summary-row--total">
          <span>Total Revenue</span>
          <span>${revenue.weekTotal.toFixed(2)}</span>
        </div>
        <div className="rev__summary-row">
          <span>Driver Payroll</span>
          <span className="rev__negative">-${(driverPayroll || 0).toFixed(2)}</span>
        </div>
        <div className={`rev__summary-row rev__summary-row--profit ${grossProfit < 0 ? 'rev__summary-row--loss' : ''}`}>
          <span>Gross Profit</span>
          <span>${grossProfit.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}
