import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { dbUpdate } from '../lib/db'
import DriverCard from '../components/mobile/DriverCard'

/* ── Helper functions (exported for DriverCard) ─── */

export function isDone(s) {
  return s.status === 'delivered' || s.status === 'completed'
}

export function isCold(s) {
  const cc = s.cold_chain
  if (typeof cc === 'boolean') return cc
  if (typeof cc === 'string') return cc !== '' && cc !== '0' && cc.toLowerCase() !== 'no'
  return !!(s.is_cold_chain || s.cold || s.refrigerated)
}

export function driverStops(name, stops) {
  return stops.filter(s => s.driver_name === name)
}

export function driverDone(name, stops) {
  return driverStops(name, stops).filter(isDone).length
}

export function driverCold(name, stops) {
  return driverStops(name, stops).filter(isCold).length
}

export function driverPackages(name, stops) {
  return driverStops(name, stops).reduce((sum, s) => sum + (s.package_count || s.packages || s.pkg_count || 1), 0)
}

export function pharmTag(name, stops) {
  const ds = driverStops(name, stops)
  const set = new Set(ds.map(s => s.pharmacy).filter(Boolean))
  if (set.size === 0) return { label: 'Other', colorClass: 'bg-[#F0F2F7] text-[#9BA5B4]' }
  if (set.size > 1) return { label: 'Both', colorClass: 'bg-purple-50 text-purple-600' }
  const ph = [...set][0]
  if (/shsp/i.test(ph)) return { label: 'SHSP', colorClass: 'bg-[#E8F1FF] text-[#4A9EFF]' }
  if (/aultman/i.test(ph)) return { label: 'Aultman', colorClass: 'bg-[#E6F5EE] text-[#27AE60]' }
  return { label: ph, colorClass: 'bg-[#F0F2F7] text-[#9BA5B4]' }
}

export function checkInStatus(name, stops) {
  const ds = driverStops(name, stops)
  if (!ds.length) return 'none'
  const done = ds.filter(isDone).length
  if (done === 0) return 'none'
  if (done === ds.length) return 'done'
  return 'go'
}

export function initials(name) {
  return (name || '').split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

/* ── Helpers ────────────────────────────────────── */

function todayStr() {
  return new Date().toLocaleDateString('en-CA')
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function fmtDate() {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

/* ── Tab icons (inline SVG) ─────────────────────── */

function IconOverview({ active }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={active ? '#4A9EFF' : 'currentColor'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="6.5" height="6.5" rx="1.5" /><rect x="11.5" y="2" width="6.5" height="6.5" rx="1.5" />
      <rect x="2" y="11.5" width="6.5" height="6.5" rx="1.5" /><rect x="11.5" y="11.5" width="6.5" height="6.5" rx="1.5" />
    </svg>
  )
}
function IconDrivers({ active }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={active ? '#4A9EFF' : 'currentColor'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="6.5" r="3.5" /><path d="M3 17.5c0-3.5 3.1-5.5 7-5.5s7 2 7 5.5" />
    </svg>
  )
}
function IconMove({ active }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={active ? '#4A9EFF' : 'currentColor'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10h12M12 6l4 4-4 4" />
    </svg>
  )
}
function IconSort({ active }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={active ? '#4A9EFF' : 'currentColor'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h12M4 10h8M4 15h5" />
    </svg>
  )
}
function IconSend({ active }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={active ? '#4A9EFF' : 'currentColor'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 2L9 11M18 2l-5 16-4-7-7-4z" />
    </svg>
  )
}

const TAB_ICONS = { Overview: IconOverview, Drivers: IconDrivers, Move: IconMove, Sort: IconSort, Send: IconSend }
const TABS = ['Overview', 'Drivers', 'Move', 'Sort', 'Send']

/* ── Main Component ─────────────────────────────── */

export default function MobileDispatch() {
  const [tab, setTab] = useState('Overview')
  const [stops, setStops] = useState([])
  const [timeOff, setTimeOff] = useState([])
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateLabel, setDateLabel] = useState(todayStr())
  const intervalRef = useRef(null)

  // Drivers tab detail
  const [detailDriver, setDetailDriver] = useState(null)

  // Move state
  const [moveStep, setMoveStep] = useState(1)
  const [moveFrom, setMoveFrom] = useState(null)
  const [moveStop, setMoveStop] = useState(null)
  const [moveTo, setMoveTo] = useState(null)
  const [moveLoading, setMoveLoading] = useState(false)

  // Send state
  const [sendDriver, setSendDriver] = useState('')
  const [sendLoading, setSendLoading] = useState(false)
  const [sendMsg, setSendMsg] = useState(null)

  // Sort state
  const [sortPharmacy, setSortPharmacy] = useState(null)

  // Driver detail filters
  const [filterCity, setFilterCity] = useState('')
  const [filterZip, setFilterZip] = useState('')
  const [filterPharmacy, setFilterPharmacy] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSearch, setFilterSearch] = useState('')

  /* ── Data fetching ──────────────────────────────── */

  const fetchData = useCallback(async () => {
    const date = todayStr()
    const [stopsRes, offRes, driversRes] = await Promise.all([
      supabase.from('daily_stops').select('*').eq('delivery_date', date).order('sort_order', { ascending: true, nullsFirst: false }),
      supabase.from('time_off_requests').select('*').eq('date_off', date).eq('status', 'approved'),
      supabase.from('drivers').select('*').eq('active', true),
    ])

    let fetchedStops = stopsRes.data || []

    // Fallback to most recent date if no stops today
    if (!fetchedStops.length) {
      const { data: recent } = await supabase
        .from('daily_stops')
        .select('delivery_date')
        .order('delivery_date', { ascending: false })
        .limit(1)
      if (recent?.length) {
        const fallbackDate = recent[0].delivery_date
        const { data: fbStops } = await supabase
          .from('daily_stops')
          .select('*')
          .eq('delivery_date', fallbackDate)
          .order('sort_order', { ascending: true, nullsFirst: false })
        fetchedStops = fbStops || []
        setDateLabel(fallbackDate)
      }
    } else {
      setDateLabel(date)
    }

    setStops(fetchedStops)
    setTimeOff(offRes.data || [])
    setDrivers(driversRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Auto-refresh
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (tab === 'Overview' || tab === 'Drivers') {
      intervalRef.current = setInterval(fetchData, 30000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [tab, fetchData])

  /* ── Derived data ───────────────────────────────── */

  const driverMap = {}
  drivers.forEach(d => { driverMap[d.driver_name] = d })

  const driverNames = [...new Set(stops.map(s => s.driver_name).filter(Boolean))].sort()
  const totalStops = stops.length
  const deliveredCount = stops.filter(isDone).length
  const remainingCount = totalStops - deliveredCount
  const coldCount = stops.filter(isCold).length
  const activeDriverCount = driverNames.length
  const pct = totalStops ? Math.round((deliveredCount / totalStops) * 100) : 0

  const byPharmacy = {}
  stops.forEach(s => {
    const ph = s.pharmacy || 'Other'
    if (!byPharmacy[ph]) byPharmacy[ph] = { total: 0, done: 0, cold: 0 }
    byPharmacy[ph].total++
    if (isDone(s)) byPharmacy[ph].done++
    if (isCold(s)) byPharmacy[ph].cold++
  })
  const pharmacyNames = Object.keys(byPharmacy).sort()

  // Grouped drivers by status
  const statusGroups = { go: [], none: [], done: [] }
  driverNames.forEach(n => {
    const s = checkInStatus(n, stops)
    statusGroups[s].push(n)
  })

  const idleCt = statusGroups.none.length
  const activeCt = statusGroups.go.length
  const doneCt = statusGroups.done.length

  // Initialize sort pharmacy
  useEffect(() => {
    if (sortPharmacy === null && pharmacyNames.length) setSortPharmacy(pharmacyNames[0])
  }, [pharmacyNames.length])

  /* ── Move handlers ──────────────────────────────── */

  function resetMove() { setMoveStep(1); setMoveFrom(null); setMoveStop(null); setMoveTo(null) }

  async function confirmMove(targetDriver) {
    const target = targetDriver || moveTo
    if (!moveStop || !target) return
    setMoveTo(target)
    setMoveLoading(true)
    try {
      await dbUpdate('daily_stops', { driver_name: target }, { id: moveStop.id })
      setMoveStep(4)
      await fetchData()
    } catch (err) { alert('Move failed: ' + err.message) }
    setMoveLoading(false)
  }

  /* ── Send handlers ──────────────────────────────── */

  async function handleSend(all) {
    setSendLoading(true); setSendMsg(null)
    try {
      const body = all
        ? { action: 'email_all_routes', date: dateLabel }
        : { action: 'email_route', driver_name: sendDriver, date: dateLabel }
      const res = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      setSendMsg(json.success ? (all ? `All routes sent (${json.sent} drivers)` : `Route sent to ${sendDriver}`) : `Error: ${json.error}`)
    } catch (err) { setSendMsg('Failed: ' + err.message) }
    setSendLoading(false)
  }

  /* ── Navigate to driver detail ──────────────────── */

  function resetFilters() { setFilterCity(''); setFilterZip(''); setFilterPharmacy(''); setFilterStatus(''); setFilterSearch('') }

  function goToDriver(name) {
    resetFilters()
    setDetailDriver(name)
    setTab('Drivers')
  }

  /* ── Render ─────────────────────────────────────── */

  if (loading) {
    return (
      <div className="max-w-[390px] mx-auto min-h-dvh flex items-center justify-center bg-[#F7F8FB]">
        <div className="text-sm text-[#9BA5B4]">Loading...</div>
      </div>
    )
  }

  return (
    <div className="max-w-[390px] mx-auto min-h-dvh bg-[#F7F8FB] flex flex-col" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}>

      {/* ── Sticky Header ──────────────────────────── */}
      <header className="sticky top-0 z-20 bg-white px-4 pt-4 pb-3 border-b border-[#F0F2F7]">
        <p className="text-xs font-medium text-[#9BA5B4]">{greeting()}</p>
        <p className="text-base font-bold text-[#0B1E3D] mb-3">Dom &mdash; {fmtDate()}</p>

        {/* Hero stats */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { val: deliveredCount, label: 'Delivered', color: 'text-[#0B1E3D]' },
            { val: remainingCount, label: 'Remaining', color: 'text-[#0B1E3D]' },
            { val: coldCount, label: 'Cold Chain', color: 'text-[#4A9EFF]' },
            { val: activeDriverCount, label: 'Drivers', color: 'text-[#0B1E3D]' },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className={`text-xl font-bold ${s.color}`}>{s.val}</div>
              <div className="text-[10px] font-medium text-[#9BA5B4] uppercase tracking-wider">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Gradient progress bar */}
        <div className="h-1.5 bg-[#F0F2F7] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: 'linear-gradient(to right, #4A9EFF, #0B1E3D)' }}
          />
        </div>
      </header>

      {/* ── Content ────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-4 pt-3 pb-28">

        {/* ═══ OVERVIEW ═══ */}
        {tab === 'Overview' && (
          <div>
            {/* Pharmacy tiles */}
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              {pharmacyNames.map(ph => {
                const d = byPharmacy[ph]
                const phPct = d.total ? Math.round((d.done / d.total) * 100) : 0
                const isShsp = /shsp/i.test(ph)
                return (
                  <div key={ph} className={`rounded-2xl p-3.5 ${isShsp ? 'bg-[#0B1E3D]' : 'bg-[#4A9EFF]'} text-white`}>
                    <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70 mb-1">{ph}</div>
                    <div className="text-2xl font-bold mb-0.5">{d.total}</div>
                    <div className="text-[11px] opacity-70">{d.done} done &middot; {d.cold} cold &middot; {phPct}%</div>
                  </div>
                )
              })}
            </div>

            {/* Driver section header */}
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-[#9BA5B4] uppercase tracking-wider">Drivers</h3>
              <div className="flex gap-2 text-[10px] font-medium text-[#9BA5B4]">
                <span>{idleCt} idle</span>
                <span>&middot;</span>
                <span className="text-[#4A9EFF]">{activeCt} active</span>
                <span>&middot;</span>
                <span className="text-[#27AE60]">{doneCt} done</span>
              </div>
            </div>

            {driverNames.map(name => (
              <DriverCard
                key={name}
                name={name}
                driverNumber={driverMap[name]?.driver_number}
                stops={stops}
                onClick={() => goToDriver(name)}
              />
            ))}
          </div>
        )}

        {/* ═══ DRIVERS ═══ */}
        {tab === 'Drivers' && !detailDriver && (
          <div>
            {/* Time-off banner */}
            {timeOff.length > 0 && (
              <div className="bg-[#FFF8EC] border border-[#FFE5A0] text-[#B07D00] rounded-2xl p-3 mb-3 flex items-center gap-2">
                <div className="flex -space-x-1.5">
                  {[...new Set(timeOff.map(t => t.driver_name))].slice(0, 3).map(n => (
                    <div key={n} className="w-6 h-6 rounded-full bg-[#FFE5A0] text-[#B07D00] text-[9px] font-bold flex items-center justify-center border-2 border-[#FFF8EC]">
                      {initials(n)}
                    </div>
                  ))}
                </div>
                <span className="text-xs font-semibold">Off today: {[...new Set(timeOff.map(t => t.driver_name))].join(', ')}</span>
              </div>
            )}

            {/* Grouped by status */}
            {[
              { key: 'go', label: 'In Progress', names: statusGroups.go },
              { key: 'none', label: 'Not Started', names: statusGroups.none },
              { key: 'done', label: 'Complete', names: statusGroups.done },
            ].map(({ key, label, names }) => {
              if (!names.length) return null
              return (
                <div key={key} className="mb-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <h3 className="text-xs font-bold text-[#9BA5B4] uppercase tracking-wider">{label}</h3>
                    <span className="text-[10px] text-[#9BA5B4]">{names.length}</span>
                  </div>
                  {names.map(name => (
                    <DriverCard
                      key={name}
                      name={name}
                      driverNumber={driverMap[name]?.driver_number}
                      stops={stops}
                      onClick={() => { resetFilters(); setDetailDriver(name) }}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ DRIVER DETAIL ═══ */}
        {tab === 'Drivers' && detailDriver && (() => {
          const ds = driverStops(detailDriver, stops)
          const doneCount = driverDone(detailDriver, stops)
          const cold = driverCold(detailDriver, stops)
          const pkgs = driverPackages(detailDriver, stops)
          const status = checkInStatus(detailDriver, stops)
          const pharm = pharmTag(detailDriver, stops)
          const dn = driverMap[detailDriver]?.driver_number
          const avatarColors = { none: 'bg-[#F0F2F7] text-[#9BA5B4]', go: 'bg-[#E8F1FF] text-[#4A9EFF]', done: 'bg-[#E6F5EE] text-[#27AE60]' }
          const statusLabels = { none: 'Not started', go: 'In progress', done: 'Complete' }

          // Unique values for dropdowns
          const cities = [...new Set(ds.map(s => s.city).filter(Boolean))].sort()
          const zips = [...new Set(ds.map(s => s.zip).filter(Boolean))].sort()
          const pharmacies = [...new Set(ds.map(s => s.pharmacy).filter(Boolean))].sort()
          const statuses = [...new Set(ds.map(s => s.status || 'dispatched'))].sort()

          // Apply filters
          const filtered = ds.filter(s => {
            if (filterCity && (s.city || '') !== filterCity) return false
            if (filterZip && (s.zip || '') !== filterZip) return false
            if (filterPharmacy && (s.pharmacy || '') !== filterPharmacy) return false
            if (filterStatus && (s.status || 'dispatched') !== filterStatus) return false
            if (filterSearch) {
              const q = filterSearch.toLowerCase()
              const haystack = `${s.patient_name || ''} ${s.address || ''} ${s.order_id || ''}`.toLowerCase()
              if (!haystack.includes(q)) return false
            }
            return true
          })

          const hasFilters = filterCity || filterZip || filterPharmacy || filterStatus || filterSearch

          return (
            <div>
              <button className="text-[#4A9EFF] text-sm font-semibold mb-3" onClick={() => setDetailDriver(null)}>&larr; Back</button>

              {/* Driver header */}
              <div className="border border-[#F0F2F7] rounded-2xl bg-white p-4 mb-3">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold ${avatarColors[status]}`}>
                    {initials(detailDriver)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-[#0B1E3D]">{detailDriver}</span>
                      {dn && <span className="text-xs text-[#9BA5B4]">#{dn}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${pharm.colorClass}`}>{pharm.label}</span>
                      <span className="text-[10px] text-[#9BA5B4] font-medium">{statusLabels[status]}</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center border-t border-[#F0F2F7] pt-2.5">
                  {[
                    { v: ds.length, l: 'Stops', c: 'text-[#0B1E3D]' },
                    { v: pkgs, l: 'Packages', c: 'text-[#0B1E3D]' },
                    { v: cold, l: 'Cold', c: 'text-[#4A9EFF]' },
                    { v: doneCount, l: 'Delivered', c: 'text-[#0B1E3D]' },
                  ].map(s => (
                    <div key={s.l}>
                      <div className={`text-base font-bold ${s.c}`}>{s.v}</div>
                      <div className="text-[10px] text-[#9BA5B4] font-medium uppercase">{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Filter bar */}
              <div className="border border-[#F0F2F7] rounded-2xl bg-white p-3 mb-3">
                {/* Search */}
                <input
                  type="text"
                  placeholder="Search name, address, order..."
                  className="w-full border border-[#F0F2F7] rounded-xl px-3 py-2 text-xs text-[#0B1E3D] bg-[#F7F8FB] mb-2 outline-none focus:border-[#4A9EFF]"
                  value={filterSearch}
                  onChange={e => setFilterSearch(e.target.value)}
                />
                {/* Dropdowns row */}
                <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                  <select className="border border-[#F0F2F7] rounded-lg px-2 py-1.5 text-[11px] font-medium text-[#0B1E3D] bg-white appearance-none" value={filterCity} onChange={e => setFilterCity(e.target.value)}>
                    <option value="">All Cities</option>
                    {cities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select className="border border-[#F0F2F7] rounded-lg px-2 py-1.5 text-[11px] font-medium text-[#0B1E3D] bg-white appearance-none" value={filterZip} onChange={e => setFilterZip(e.target.value)}>
                    <option value="">All ZIPs</option>
                    {zips.map(z => <option key={z} value={z}>{z}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <select className="border border-[#F0F2F7] rounded-lg px-2 py-1.5 text-[11px] font-medium text-[#0B1E3D] bg-white appearance-none" value={filterPharmacy} onChange={e => setFilterPharmacy(e.target.value)}>
                    <option value="">All Pharmacies</option>
                    {pharmacies.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <select className="border border-[#F0F2F7] rounded-lg px-2 py-1.5 text-[11px] font-medium text-[#0B1E3D] bg-white appearance-none" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="">All Statuses</option>
                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {hasFilters && (
                  <button className="text-[11px] text-[#4A9EFF] font-semibold mt-1.5" onClick={resetFilters}>
                    Clear filters &times;
                  </button>
                )}
              </div>

              {/* Filtered count */}
              {hasFilters && (
                <div className="text-[11px] text-[#9BA5B4] font-medium mb-2">
                  Showing {filtered.length} of {ds.length} stops
                </div>
              )}

              {/* Stop list */}
              {filtered.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)).map(s => {
                const done = isDone(s)
                const coldStop = isCold(s)
                return (
                  <div key={s.id} className="flex items-start gap-2.5 py-2.5 border-b border-[#F0F2F7]">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${done ? 'bg-[#E6F5EE] text-[#27AE60]' : coldStop ? 'bg-[#E8F1FF] text-[#4A9EFF]' : 'bg-[#F0F2F7] text-[#9BA5B4]'}`}>
                      {s.sort_order ?? '—'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[#0B1E3D]">{s.patient_name}</div>
                      <div className="text-xs text-[#9BA5B4] truncate">{s.address}{s.city ? `, ${s.city}` : ''}{s.zip ? ` ${s.zip}` : ''}</div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${done ? 'bg-[#E6F5EE] text-[#27AE60]' : 'bg-[#F0F2F7] text-[#9BA5B4]'}`}>
                        {s.status || 'dispatched'}
                      </span>
                      {s.pharmacy && <span className="text-[9px] text-[#9BA5B4]">{s.pharmacy}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}

        {/* ═══ MOVE ═══ */}
        {tab === 'Move' && (
          <div>
            {/* Step 4: Success */}
            {moveStep === 4 && (
              <div className="text-center py-12">
                <div className="w-14 h-14 rounded-2xl bg-[#E6F5EE] text-[#27AE60] text-2xl font-bold flex items-center justify-center mx-auto mb-4">&#10003;</div>
                <p className="text-base font-bold text-[#0B1E3D] mb-1">Stop moved</p>
                <p className="text-sm text-[#9BA5B4] mb-6">{moveStop?.patient_name} reassigned to {moveTo}</p>
                <button className="bg-[#0B1E3D] text-white text-sm font-semibold px-8 py-2.5 rounded-xl" onClick={resetMove}>Done</button>
              </div>
            )}

            {/* Step 1: Pick source driver */}
            {moveStep === 1 && (
              <>
                <h3 className="text-xs font-bold text-[#9BA5B4] uppercase tracking-wider mb-2">Pull from which driver?</h3>
                {driverNames.filter(n => driverStops(n, stops).some(s => !isDone(s))).map(name => (
                  <DriverCard
                    key={name}
                    name={name}
                    driverNumber={driverMap[name]?.driver_number}
                    stops={stops}
                    onClick={() => { setMoveFrom(name); setMoveStep(2) }}
                  />
                ))}
              </>
            )}

            {/* Step 2: Pick stop */}
            {moveStep === 2 && (
              <>
                <button className="text-[#4A9EFF] text-sm font-semibold mb-3" onClick={() => setMoveStep(1)}>&larr; Back</button>
                <h3 className="text-xs font-bold text-[#9BA5B4] uppercase tracking-wider mb-2">Which stop from {moveFrom}?</h3>
                {driverStops(moveFrom, stops).filter(s => !isDone(s))
                  .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
                  .map(s => (
                    <div
                      key={s.id}
                      className="border border-[#F0F2F7] rounded-2xl bg-white p-3 mb-2 cursor-pointer active:bg-[#F7F8FB]"
                      onClick={() => { setMoveStop(s); setMoveStep(3) }}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${isCold(s) ? 'bg-[#E8F1FF] text-[#4A9EFF]' : 'bg-[#F0F2F7] text-[#9BA5B4]'}`}>
                          {s.sort_order ?? '—'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-[#0B1E3D]">{s.patient_name}</div>
                          <div className="text-xs text-[#9BA5B4] truncate">{s.address}</div>
                        </div>
                        {isCold(s) && <span className="bg-[#E8F1FF] text-[#4A9EFF] text-[10px] font-bold px-2 py-0.5 rounded-full">COLD</span>}
                      </div>
                    </div>
                  ))}
              </>
            )}

            {/* Step 3: Pick destination */}
            {moveStep === 3 && (
              <>
                <button className="text-[#4A9EFF] text-sm font-semibold mb-3" onClick={() => setMoveStep(2)}>&larr; Back</button>

                {/* Confirmation box */}
                <div className="bg-[#E8F1FF] border border-[#4A9EFF]/20 rounded-2xl p-3 mb-3">
                  <div className="text-[10px] text-[#4A9EFF] font-bold uppercase tracking-wider mb-0.5">Moving stop</div>
                  <div className="text-sm font-bold text-[#0B1E3D]">{moveStop?.patient_name}</div>
                  <div className="text-xs text-[#9BA5B4]">{moveStop?.address}</div>
                </div>

                <h3 className="text-xs font-bold text-[#9BA5B4] uppercase tracking-wider mb-2">Move to which driver?</h3>
                {driverNames.filter(n => n !== moveFrom).map(name => (
                  <div key={name}>
                    <DriverCard
                      name={name}
                      driverNumber={driverMap[name]?.driver_number}
                      stops={stops}
                      onClick={() => confirmMove(name)}
                    />
                  </div>
                ))}
                {moveLoading && <div className="text-center text-sm text-[#9BA5B4] mt-4">Moving...</div>}
              </>
            )}
          </div>
        )}

        {/* ═══ SORT ═══ */}
        {tab === 'Sort' && (
          <div>
            {pharmacyNames.length > 1 && (
              <div className="flex gap-1.5 mb-3 overflow-x-auto">
                {pharmacyNames.map(ph => (
                  <button
                    key={ph}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide whitespace-nowrap transition-colors ${sortPharmacy === ph ? 'bg-[#0B1E3D] text-white' : 'bg-white border border-[#F0F2F7] text-[#9BA5B4]'}`}
                    onClick={() => setSortPharmacy(ph)}
                  >{ph}</button>
                ))}
              </div>
            )}

            {driverNames.map(name => {
              const ds = driverStops(name, stops).filter(s => (s.pharmacy || 'Other') === sortPharmacy)
              if (!ds.length) return null
              const cold = ds.filter(isCold).length
              return (
                <div key={name} className="mb-4">
                  <div className="text-xs font-bold text-[#0B1E3D] mb-1.5">
                    {name} <span className="text-[#9BA5B4] font-medium">&middot; {ds.length} stops &middot; {cold} cold</span>
                  </div>
                  {ds.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)).map(s => {
                    const done = isDone(s)
                    const cold = isCold(s)
                    return (
                      <div key={s.id} className={`flex items-center gap-2 py-1.5 border-b border-[#F0F2F7] ${done ? 'opacity-40' : ''}`}>
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${done ? 'bg-[#E6F5EE] text-[#27AE60]' : cold ? 'bg-[#E8F1FF] text-[#4A9EFF]' : 'bg-[#F0F2F7] text-[#9BA5B4]'}`}>
                          {done ? '✓' : (s.sort_order ?? '—')}
                        </div>
                        <span className={`text-sm font-semibold text-[#0B1E3D] shrink-0 ${done ? 'line-through' : ''}`}>{s.patient_name}</span>
                        <span className={`text-xs text-[#9BA5B4] truncate flex-1 ${done ? 'line-through' : ''}`}>{s.address}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ SEND ═══ */}
        {tab === 'Send' && (
          <div>
            <div className="border border-[#F0F2F7] rounded-2xl bg-white p-4 mb-3">
              <label className="text-xs font-bold text-[#9BA5B4] uppercase tracking-wider block mb-1.5">Select driver</label>
              <select
                className="w-full border border-[#F0F2F7] rounded-xl px-3 py-2.5 text-sm font-medium text-[#0B1E3D] bg-white appearance-none mb-3"
                value={sendDriver}
                onChange={e => setSendDriver(e.target.value)}
              >
                <option value="">Choose...</option>
                {driverNames.map(n => {
                  const ds = driverStops(n, stops)
                  const cold = driverCold(n, stops)
                  return <option key={n} value={n}>{n} &mdash; {ds.length} stops, {cold} cold</option>
                })}
              </select>

              <button
                className="w-full bg-[#4A9EFF] text-white text-sm font-semibold py-2.5 rounded-xl mb-2 disabled:opacity-40 transition-opacity flex items-center justify-center gap-1.5"
                disabled={!sendDriver || sendLoading}
                onClick={() => handleSend(false)}
              >
                Send route <span className="text-base">&#8599;</span>
              </button>

              <button
                className="w-full bg-[#0B1E3D] text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-40 transition-opacity"
                disabled={sendLoading}
                onClick={() => handleSend(true)}
              >
                Send all routes
              </button>
            </div>

            {sendMsg && (
              <div className="bg-[#E8F1FF] text-[#4A9EFF] text-sm font-medium rounded-xl p-3 text-center">{sendMsg}</div>
            )}
          </div>
        )}
      </main>

      {/* ── Floating Tab Bar ───────────────────────── */}
      <nav className="fixed bottom-3.5 left-1/2 -translate-x-1/2 w-[calc(100%-28px)] max-w-[362px] bg-[#0B1E3D] rounded-2xl flex px-1.5 py-1.5 z-30">
        {TABS.map(t => {
          const active = tab === t
          const Icon = TAB_ICONS[t]
          return (
            <button
              key={t}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl transition-colors ${active ? 'bg-[#4A9EFF]/15' : ''}`}
              onClick={() => {
                setTab(t)
                if (t !== 'Drivers') setDetailDriver(null)
                if (t !== 'Move') resetMove()
                if (t !== 'Send') { setSendMsg(null); setSendDriver('') }
              }}
            >
              <Icon active={active} />
              <span className={`text-[10px] font-semibold ${active ? 'text-[#4A9EFF]' : 'text-white/35'}`}>{t}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
