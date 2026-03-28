import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function DriverSortList({ driverName, pharmacy }) {
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const myPharmacy = pharmacy === 'Aultman' ? 'Aultman' : 'SHSP'

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data: latest } = await supabase.from('sort_list').select('delivery_date')
      .eq('pharmacy', myPharmacy).order('delivery_date', { ascending: false }).limit(1)
    const dateStr = latest?.[0]?.delivery_date || new Date().toISOString().split('T')[0]

    const { data } = await supabase.from('sort_list')
      .select('*').eq('delivery_date', dateStr).eq('pharmacy', myPharmacy)
      .order('sort_order', { ascending: true })
    setLines(data || [])
    setLoading(false)
  }

  function handleCopy() {
    const text = lines.map(l => {
      let line = l.display_text
      if (l.late_start) line += ' [9 AM]'
      return line
    }).join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Loading sort list...</div>

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: myPharmacy === 'Aultman' ? '#16a34a' : '#3b82f6' }}>
          {myPharmacy === 'SHSP' ? '💊' : '🏥'} {myPharmacy} Sort List
        </h3>
        <button onClick={handleCopy} style={{
          padding: '4px 12px', fontSize: 11, fontWeight: 600, border: '1px solid var(--gray-200)',
          borderRadius: 4, background: copied ? '#dcfce7' : 'white', color: copied ? '#16a34a' : '#6b7280', cursor: 'pointer',
        }}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      {lines.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Sort list not posted yet</div>
      )}
      {lines.map(l => {
        const isMe = l.display_text.toLowerCase().includes(driverName.toLowerCase())
        const isLate = !!l.late_start
        return (
          <div key={l.id} style={{
            padding: '10px 16px', borderBottom: '1px solid var(--gray-100)',
            fontSize: 14, fontWeight: 600, color: 'var(--gray-900)', letterSpacing: 0.3,
            display: 'flex', alignItems: 'center', gap: 8,
            background: isLate ? '#fff7ed' : isMe ? '#eef4ff' : 'transparent',
            borderLeft: isLate ? '3px solid #f97316' : isMe ? '3px solid #3b82f6' : '3px solid transparent',
          }}>
            <span style={{ flex: 1 }}>{l.display_text}</span>
            {isLate && (
              <span style={{
                padding: '2px 8px', fontSize: 10, fontWeight: 700,
                color: '#f97316', background: '#ffedd5', borderRadius: 4,
              }}>
                9 AM
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
