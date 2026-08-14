import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import './PODRecords.css'

// Normalizer MUST match hooks/usePhotoHistory.js in the driver app.
// patient_key = "<lowercased-stripped-name>|<zip>"
function normalizePatient(n) {
  return String(n || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}
function buildPatientKey(name, zip) {
  const p = normalizePatient(name)
  const z = String(zip || '').trim()
  if (!p || !z) return null
  return `${p}|${z}`
}

function profileNameSafe(profile, user) {
  return profile?.full_name || user?.email || 'admin'
}

// Normalize city casing/spelling so the filter dropdown doesn't show
// "APPLE CREEK" + "APPLECREEK" as two rows, or "N LAWRENCE" separate from
// "North Lawrence". Returns a stable lowercased key used for grouping AND
// for comparison against each photo's city at filter time.
const CITY_ALIASES = {
  'new phila': 'new philadelphia',
  'newphila': 'new philadelphia',
  'applecreek': 'apple creek',
  'uhrichville': 'uhrichsville',   // common misspelling
  'sherodsville': 'sherrodsville',
  'mechanicstown': 'mechanicstown',
}
function normalizeCityKey(raw) {
  let s = String(raw || '').toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  // Expand leading directional abbreviations: "n lawrence" -> "north lawrence"
  s = s.replace(/^n\s+/, 'north ')
       .replace(/^s\s+/, 'south ')
       .replace(/^e\s+/, 'east ')
       .replace(/^w\s+/, 'west ')
       .replace(/^ne\s+/, 'northeast ')
       .replace(/^nw\s+/, 'northwest ')
       .replace(/^se\s+/, 'southeast ')
       .replace(/^sw\s+/, 'southwest ')
  if (CITY_ALIASES[s]) s = CITY_ALIASES[s]
  return s
}
function displayCity(raw) {
  const key = normalizeCityKey(raw)
  if (!key) return ''
  // Title Case each word; keep common lowercase joiners lowercase.
  const lower = new Set(['of', 'the', 'and'])
  return key.split(' ').map((w, i) => {
    if (i > 0 && lower.has(w)) return w
    return w.charAt(0).toUpperCase() + w.slice(1)
  }).join(' ')
}

function urlsFromRow(row) {
  const out = []
  if (row.photo_urls) {
    try {
      const raw = typeof row.photo_urls === 'string' ? JSON.parse(row.photo_urls) : row.photo_urls
      if (Array.isArray(raw)) for (const u of raw) if (u) out.push(u)
    } catch {}
  }
  if (row.photo_url && !out.includes(row.photo_url)) out.push(row.photo_url)
  return out
}

export default function PatientPodLibrary() {
  const { user, profile } = useAuth()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [patients, setPatients] = useState([])
  const [selected, setSelected] = useState(null)
  const [pins, setPins] = useState([])
  const [savingPin, setSavingPin] = useState(false)
  const [fullscreen, setFullscreen] = useState(null)
  const [pinCounts, setPinCounts] = useState(new Map())  // patient_key -> N pins
  const [viewFilter, setViewFilter] = useState('all')    // 'all' | 'pinned' | 'unpinned'
  const [cityFilter, setCityFilter] = useState('all')    // 'all' | '<lowercased city>'
  const [reloadTick, setReloadTick] = useState(0)        // bump to force a refetch
  const [reviewedSet, setReviewedSet] = useState(new Set())  // patient_keys marked reviewed
  const [reviewedTick, setReviewedTick] = useState(0)    // bump to refetch reviewed set

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('patient_pod_reviewed').select('patient_key')
      if (cancelled || !Array.isArray(data)) return
      setReviewedSet(new Set(data.map(r => r.patient_key).filter(Boolean)))
    })()
    return () => { cancelled = true }
  }, [reviewedTick])

  async function toggleReviewed(patientKey, patientName) {
    if (!patientKey) return
    if (reviewedSet.has(patientKey)) {
      await supabase.from('patient_pod_reviewed').delete().eq('patient_key', patientKey)
    } else {
      await supabase.from('patient_pod_reviewed').insert({
        patient_key: patientKey,
        patient_name: patientName || null,
        reviewed_by: profileNameSafe(profile, user),
      })
    }
    setReviewedTick(t => t + 1)
  }
  const [dismissed, setDismissed] = useState(new Set())  // dismissed photo_url set
  const [dismissedTick, setDismissedTick] = useState(0)  // bump to refetch
  const [showDismissed, setShowDismissed] = useState(false)

  // Load dismissed URL set once (and after each dismiss/undismiss).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('dismissed_pod_photos').select('photo_url')
      if (cancelled || !Array.isArray(data)) return
      setDismissed(new Set(data.map(r => r.photo_url).filter(Boolean)))
    })()
    return () => { cancelled = true }
  }, [dismissedTick])

  async function dismissPhoto(photo) {
    await supabase.from('dismissed_pod_photos').insert({
      photo_url: photo.url,
      patient_key: selected || null,
      dismissed_by: profileNameSafe(profile, user),
    })
    setDismissedTick(t => t + 1)
  }
  async function undismissPhoto(photoUrl) {
    await supabase.from('dismissed_pod_photos').delete().eq('photo_url', photoUrl)
    setDismissedTick(t => t + 1)
  }

  // Hard delete — removes the photo from storage + every table that references it.
  // Irreversible. Only exposed behind a confirm() dialog.
  async function deletePhotoForever(photoUrl) {
    // 1) Delete the underlying file from the POD bucket (best-effort — orphan is
    //    harmless if this fails).
    try {
      const marker = '/POD/'
      const idx = photoUrl.indexOf(marker)
      if (idx !== -1) {
        const path = photoUrl.slice(idx + marker.length)
        await supabase.storage.from('POD').remove([path])
      }
    } catch {}

    // 2) daily_stops — clear photo_url and filter this URL out of photo_urls array.
    const [{ data: rowsA }, { data: rowsB }] = await Promise.all([
      supabase.from('daily_stops').select('id, photo_url, photo_urls').eq('photo_url', photoUrl),
      supabase.from('daily_stops').select('id, photo_url, photo_urls').ilike('photo_urls', `%${photoUrl}%`),
    ])
    const merged = new Map()
    for (const r of [...(rowsA || []), ...(rowsB || [])]) merged.set(r.id, r)
    for (const row of merged.values()) {
      let arr = []
      if (row.photo_urls) {
        try {
          const raw = typeof row.photo_urls === 'string' ? JSON.parse(row.photo_urls) : row.photo_urls
          if (Array.isArray(raw)) arr = raw
        } catch {}
      }
      const remaining = arr.filter(u => u !== photoUrl)
      const patch = {}
      if (row.photo_url === photoUrl) patch.photo_url = remaining[0] || null
      patch.photo_urls = remaining.length ? JSON.stringify(remaining) : null
      await supabase.from('daily_stops').update(patch).eq('id', row.id)
    }

    // 3) delivery_confirmations — same URL can be either the package shot or the house shot.
    await Promise.all([
      supabase.from('delivery_confirmations').update({ photo_package_url: null }).eq('photo_package_url', photoUrl),
      supabase.from('delivery_confirmations').update({ photo_house_url:   null }).eq('photo_house_url',   photoUrl),
    ])

    // 4) Any pin or dismiss row pointing at this URL is now stale.
    await Promise.all([
      supabase.from('patient_pinned_photos').delete().eq('photo_url', photoUrl),
      supabase.from('dismissed_pod_photos').delete().eq('photo_url', photoUrl),
    ])

    // 5) Refresh UI: reload pins for this patient, bump the dismissed tick, and
    //    strip the URL from the in-memory patient photo list so the tile
    //    disappears immediately.
    await loadPins(selected)
    setDismissedTick(t => t + 1)
    setPatients(prev => prev.map(p =>
      p.key === selected ? { ...p, photos: p.photos.filter(ph => ph.url !== photoUrl) } : p
    ))
  }

  // Global pin index — one query pulls every existing pin so we can show
  // "N pinned" badges on the list without an N+1 fetch. ~thousands of rows max,
  // fine to hold in memory.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('patient_pinned_photos').select('patient_key')
      if (cancelled || !Array.isArray(data)) return
      const m = new Map()
      for (const r of data) {
        if (!r.patient_key) continue
        m.set(r.patient_key, (m.get(r.patient_key) || 0) + 1)
      }
      setPinCounts(m)
    })()
    return () => { cancelled = true }
  }, [pins])  // re-index after we pin/unpin so the list badge updates immediately

  useEffect(() => {
    const q = query.trim()
    // Empty query = show ALL patients with POD photos, alphabetical.
    // Non-empty = server-side ILIKE filter, still alphabetical.
    let cancelled = false
    setLoading(true)

    async function fetchOnce() {
      let req = supabase
        .from('daily_stops')
        .select('order_id, address, city, zip, patient_name, delivery_date, delivered_at, photo_url, photo_urls, driver_name')
        .eq('status', 'delivered')
        .or('photo_url.not.is.null,photo_urls.not.is.null')
        .order('patient_name', { ascending: true })
        .limit(2000)
      if (q.length >= 2) req = req.ilike('patient_name', `%${q}%`)
      return req
    }

    const t = setTimeout(async () => {
      let { data, error } = await fetchOnce()
      // Cold-start race: first request on a fresh page load occasionally comes
      // back empty with no error before the Supabase client fully warms up.
      // Retry once after a beat if we got nothing back.
      if (!cancelled && !error && Array.isArray(data) && data.length === 0 && q.length < 2) {
        await new Promise(r => setTimeout(r, 400))
        if (cancelled) return
        const retry = await fetchOnce()
        data = retry.data
        error = retry.error
      }
      if (cancelled) return
      setLoading(false)
      if (error || !Array.isArray(data)) { setPatients([]); return }

      const map = new Map()
      for (const r of data) {
        const key = buildPatientKey(r.patient_name, r.zip)
        if (!key) continue
        if (!map.has(key)) map.set(key, { key, name: r.patient_name, zip: r.zip, photos: [] })
        const bucket = map.get(key)
        for (const u of urlsFromRow(r)) {
          bucket.photos.push({
            url: u,
            deliveredAt: r.delivered_at || r.delivery_date,
            address: r.address, city: r.city,
            driver: r.driver_name, orderId: r.order_id,
          })
        }
      }
      // Sort by name A-Z (case-insensitive) since patient_name may vary in casing.
      const sorted = Array.from(map.values()).sort((a, b) =>
        String(a.name || '').toLowerCase().localeCompare(String(b.name || '').toLowerCase())
      )
      setPatients(sorted)
    }, q.length === 0 ? 0 : 300)  // no debounce on the initial full-list load
    return () => { cancelled = true; clearTimeout(t) }
  }, [query, reloadTick])

  const loadPins = useCallback(async (key) => {
    if (!key) { setPins([]); return }
    const { data } = await supabase
      .from('patient_pinned_photos')
      .select('*')
      .eq('patient_key', key)
      .order('position', { ascending: true })
    setPins(data || [])
  }, [])

  useEffect(() => { loadPins(selected) }, [selected, loadPins])

  const activePatient = patients.find(p => p.key === selected)
  const pinnedUrls = new Set(pins.map(p => p.photo_url))
  const pinnedBy = profile?.full_name || user?.email || 'admin'

  async function togglePin(photo) {
    if (savingPin) return
    setSavingPin(true)
    try {
      const existing = pins.find(p => p.photo_url === photo.url)
      if (existing) {
        await supabase.from('patient_pinned_photos').delete().eq('id', existing.id)
      } else {
        if (pins.length >= 3) {
          alert('Maximum 3 pinned photos per patient. Unpin one first.')
          return
        }
        const usedPositions = new Set(pins.map(p => p.position))
        const position = [1, 2, 3].find(p => !usedPositions.has(p))
        await supabase.from('patient_pinned_photos').insert({
          patient_key: selected,
          patient_name: activePatient?.name || null,
          photo_url: photo.url,
          position,
          pinned_by: pinnedBy,
        })
      }
      await loadPins(selected)
    } finally {
      setSavingPin(false)
    }
  }

  async function updateNote(pinId, note) {
    await supabase.from('patient_pinned_photos').update({ note }).eq('id', pinId)
    setPins(prev => prev.map(p => p.id === pinId ? { ...p, note } : p))
  }

  return (
    <div className="pod-records">
      <div className="pod-records__header">
        <div>
          <h2 className="pod-records__title">Patient POD Library</h2>
          <p className="pod-records__sub">Pin up to 3 reference photos per patient. Drivers see them on the stop card via the camera icon.</p>
        </div>
        <button
          onClick={() => setReloadTick(t => t + 1)}
          disabled={loading}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--gray-200)', background: 'var(--white)', color: 'var(--gray-700)', fontSize: 13, fontWeight: 600, cursor: loading ? 'wait' : 'pointer' }}
        >
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      <div style={{ padding: '0 24px' }}>
        <input
          type="text"
          placeholder="Filter by patient name…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ width: '100%', maxWidth: 480, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--gray-200)', background: 'var(--white)', color: 'var(--gray-900)', fontSize: 15 }}
          autoFocus
        />
      </div>

      <div style={{ padding: 24 }}>
        {loading ? <div style={{ color: 'var(--gray-500)' }}>Loading…</div> : null}
        {!loading && patients.length === 0 && query.trim().length >= 2 ? (
          <div style={{ color: 'var(--gray-500)' }}>No patients found with POD photos matching &ldquo;{query}&rdquo;.</div>
        ) : null}
        {!loading && patients.length === 0 && query.trim().length < 2 ? (
          <div style={{ color: 'var(--gray-500)' }}>No delivered POD photos yet.</div>
        ) : null}
        {!loading && patients.length > 0 && !selected ? (() => {
          // Build sorted, deduped city list — normalized so casing/spelling/abbrev
          // variants collapse (APPLE CREEK + APPLECREEK, N LAWRENCE + North Lawrence, etc.).
          const cityMap = new Map()  // normalized key -> display label
          for (const p of patients) {
            for (const ph of p.photos) {
              const key = normalizeCityKey(ph.city)
              if (!key) continue
              if (!cityMap.has(key)) cityMap.set(key, displayCity(ph.city))
            }
          }
          const cityOptions = Array.from(cityMap.entries()).sort((a, b) => a[1].localeCompare(b[1]))

          const filtered = patients.filter(p => {
            const pinned = pinCounts.get(p.key) || 0
            const reviewed = reviewedSet.has(p.key)
            if (viewFilter === 'pinned' && pinned === 0) return false
            if (viewFilter === 'unpinned' && pinned > 0) return false
            if (viewFilter === 'reviewed' && !reviewed) return false
            if (viewFilter === 'unreviewed' && (reviewed || pinned > 0)) return false
            if (cityFilter !== 'all') {
              const hasCity = p.photos.some(ph => normalizeCityKey(ph.city) === cityFilter)
              if (!hasCity) return false
            }
            return true
          })
          const totalPinned = patients.filter(p => (pinCounts.get(p.key) || 0) > 0).length
          const totalReviewed = patients.filter(p => reviewedSet.has(p.key)).length
          const totalUnreviewed = patients.filter(p => !reviewedSet.has(p.key) && (pinCounts.get(p.key) || 0) === 0).length
          const totalUnpinned = patients.length - totalPinned
          const btn = (key, label, count) => (
            <button
              key={key}
              onClick={() => setViewFilter(key)}
              style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', border: '1px solid ' + (viewFilter === key ? 'var(--navy)' : 'var(--gray-200)'),
                background: viewFilter === key ? 'var(--navy)' : 'transparent',
                color: viewFilter === key ? '#fff' : 'var(--gray-700)',
              }}
            >
              {label} <span style={{ opacity: 0.7, marginLeft: 4 }}>{count}</span>
            </button>
          )
          return (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                {btn('all', 'All', patients.length)}
                {btn('pinned', '★ Pinned', totalPinned)}
                {btn('unpinned', 'Unpinned', totalUnpinned)}
                {btn('reviewed', '✓ Reviewed', totalReviewed)}
                {btn('unreviewed', 'Needs review', totalUnreviewed)}
                <select
                  value={cityFilter}
                  onChange={e => setCityFilter(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--gray-200)', background: 'var(--white)', color: 'var(--gray-900)', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginLeft: 4 }}
                >
                  <option value="all">All cities ({cityOptions.length})</option>
                  {cityOptions.map(([key, display]) => (
                    <option key={key} value={key}>{display}</option>
                  ))}
                </select>
                {cityFilter !== 'all' ? (
                  <button
                    onClick={() => setCityFilter('all')}
                    style={{ padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'transparent', border: '1px solid var(--gray-200)', color: 'var(--gray-700)', cursor: 'pointer' }}
                  >Clear city</button>
                ) : null}
              </div>
              <div style={{ color: 'var(--gray-500)', fontSize: 13, marginBottom: 8 }}>
                Showing {filtered.length} of {patients.length} (A–Z){cityFilter !== 'all' ? ` · ${cityMap.get(cityFilter)}` : ''}
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {filtered.map(p => {
                  const pinned = pinCounts.get(p.key) || 0
                  const reviewed = reviewedSet.has(p.key)
                  const borderColor = pinned > 0 ? '#f59e0b' : (reviewed ? '#16a34a' : 'var(--gray-200)')
                  return (
                <button
                  key={p.key}
                  onClick={() => setSelected(p.key)}
                  style={{ textAlign: 'left', padding: 12, borderRadius: 10, border: '1px solid ' + borderColor, background: 'var(--gray-50)', color: 'var(--gray-900)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{p.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 2 }}>
                      ZIP {p.zip} · {p.photos.length} photo{p.photos.length === 1 ? '' : 's'} across deliveries
                    </div>
                  </div>
                  {pinned > 0 ? (
                    <span style={{ background: '#fef3c7', color: '#92400e', fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                      ★ {pinned} pinned
                    </span>
                  ) : reviewed ? (
                    <span style={{ background: '#dcfce7', color: '#166534', fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                      ✓ Reviewed
                    </span>
                  ) : null}
                </button>
              )
                })}
              </div>
              {filtered.length === 0 ? (
                <div style={{ color: 'var(--gray-500)', padding: '16px 4px' }}>
                  No {viewFilter} patients match your filter.
                </div>
              ) : null}
            </>
          )
        })() : null}

        {activePatient ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => setSelected(null)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--gray-200)', background: 'transparent', color: 'var(--gray-900)', cursor: 'pointer' }}>← Back</button>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{activePatient.name}</div>
                <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>ZIP {activePatient.zip} · {activePatient.photos.length} photos · {pins.length}/3 pinned</div>
              </div>
              {(() => {
                const isReviewed = reviewedSet.has(activePatient.key)
                return (
                  <button
                    onClick={() => toggleReviewed(activePatient.key, activePatient.name)}
                    style={{
                      padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                      border: '1px solid ' + (isReviewed ? '#16a34a' : 'var(--gray-200)'),
                      background: isReviewed ? '#dcfce7' : 'transparent',
                      color: isReviewed ? '#166534' : 'var(--gray-700)',
                      cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    {isReviewed ? '✓ Reviewed' : 'Mark as Reviewed'}
                  </button>
                )
              })()}
            </div>

            {pins.length > 0 ? (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-700)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Pinned for driver ({pins.length}/3)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
                  {pins.map(pin => (
                    <div key={pin.id} style={{ border: '2px solid #f59e0b', borderRadius: 10, overflow: 'hidden', background: 'var(--gray-100)' }}>
                      <img src={pin.photo_url} alt="" onClick={() => setFullscreen(pin.photo_url)} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', cursor: 'zoom-in' }} />
                      <div style={{ padding: 8 }}>
                        <input
                          type="text"
                          placeholder="Caption (e.g. front door)"
                          defaultValue={pin.note || ''}
                          onBlur={e => updateNote(pin.id, e.target.value)}
                          style={{ width: '100%', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--gray-200)', background: 'var(--white)', color: 'var(--gray-900)', fontSize: 12 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              {(() => {
                const hiddenCount = activePatient.photos.filter(p => dismissed.has(p.url) && !pinnedUrls.has(p.url)).length
                return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-700)', textTransform: 'uppercase', letterSpacing: 0.5 }}>All POD photos</div>
                    {hiddenCount > 0 ? (
                      <button
                        onClick={() => setShowDismissed(v => !v)}
                        style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--gray-200)', background: showDismissed ? 'var(--gray-100)' : 'transparent', color: 'var(--gray-700)', cursor: 'pointer' }}
                      >
                        {showDismissed ? 'Hiding dismissed' : `Show ${hiddenCount} dismissed`}
                      </button>
                    ) : null}
                  </div>
                )
              })()}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                {activePatient.photos.filter(p => showDismissed || pinnedUrls.has(p.url) || !dismissed.has(p.url)).map((photo, i) => {
                  const isPinned = pinnedUrls.has(photo.url)
                  const isDismissed = dismissed.has(photo.url)
                  const d = photo.deliveredAt ? new Date(photo.deliveredAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' }) : ''
                  const disabled = savingPin || (!isPinned && pins.length >= 3)
                  return (
                    <div key={`${photo.url}-${i}`} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: isPinned ? '2px solid #f59e0b' : '1px solid var(--gray-200)', background: 'var(--gray-100)', opacity: isDismissed && !isPinned ? 0.55 : 1 }}>
                      <img src={photo.url} alt="" onClick={() => setFullscreen(photo.url)} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', cursor: 'zoom-in' }} />
                      <div style={{ padding: '6px 8px', fontSize: 11, color: 'var(--gray-500)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{d}</span>
                        {isDismissed && !isPinned ? <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray-500)' }}>Dismissed</span> : null}
                      </div>
                      <button
                        onClick={() => togglePin(photo)}
                        disabled={disabled}
                        style={{
                          position: 'absolute', top: 6, right: 6,
                          padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          background: isPinned ? '#f59e0b' : 'rgba(0,0,0,0.75)',
                          color: '#fff', border: 'none',
                          cursor: savingPin ? 'wait' : (disabled ? 'not-allowed' : 'pointer'),
                          opacity: disabled ? 0.4 : 1,
                        }}
                      >
                        {isPinned ? '★ Pinned' : 'Pin'}
                      </button>
                      {!isPinned ? (
                        isDismissed ? (
                          <button
                            onClick={() => undismissPhoto(photo.url)}
                            style={{
                              position: 'absolute', top: 6, left: 6,
                              padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                              background: 'rgba(0,0,0,0.75)', color: '#fff', border: 'none', cursor: 'pointer',
                            }}
                          >Restore</button>
                        ) : (
                          <button
                            onClick={() => dismissPhoto(photo)}
                            title="Hide from library (reversible)"
                            style={{
                              position: 'absolute', top: 6, left: 6,
                              width: 24, height: 24, borderRadius: 12, fontSize: 14, fontWeight: 700,
                              background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                            }}
                          >×</button>
                        )
                      ) : null}
                      {!isPinned ? (
                        <button
                          onClick={() => {
                            if (window.confirm('Delete this photo forever?\n\nRemoves it from storage and every delivery record. This cannot be undone.')) {
                              deletePhotoForever(photo.url)
                            }
                          }}
                          title="Delete forever (irreversible)"
                          style={{
                            position: 'absolute', bottom: 6, right: 6,
                            width: 26, height: 26, borderRadius: 13, fontSize: 13, fontWeight: 700,
                            background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                          }}
                        >🗑</button>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {fullscreen ? (
        <div
          onClick={() => setFullscreen(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
        >
          <img src={fullscreen} alt="" style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain' }} />
        </div>
      ) : null}
    </div>
  )
}
