import { config } from 'dotenv'
import { createSign } from 'crypto'
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

config()

// --- Google Sheets auth (native JWT) ---
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'
const TOKEN_URI = 'https://oauth2.googleapis.com/token'

function base64url(data) { return Buffer.from(data).toString('base64url') }

async function getAccessToken() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
  const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    iss: clientEmail, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: TOKEN_URI, iat: now, exp: now + 3600,
  }))
  const sign = createSign('RSA-SHA256')
  sign.update(`${header}.${payload}`)
  const signature = sign.sign(privateKey, 'base64url')
  const jwt = `${header}.${payload}.${signature}`

  const res = await fetch(TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })
  const data = await res.json()
  return data.access_token
}

async function fetchSheetTabs(token, sheetId) {
  const res = await fetch(`${SHEETS_BASE}/${sheetId}?fields=sheets.properties`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  return data.sheets?.map(s => s.properties) || []
}

async function fetchBatchRanges(token, sheetId, ranges) {
  const params = ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&')
  const res = await fetch(`${SHEETS_BASE}/${sheetId}/values:batchGet?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  return data.valueRanges || []
}

// --- Supabase ---
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// --- Main ---
const DAILY_SHEETS = {
  Monday: process.env.SHEET_MONDAY,
  Tuesday: process.env.SHEET_TUESDAY,
  Wednesday: process.env.SHEET_WEDNESDAY,
  Thursday: process.env.SHEET_THURSDAY,
  Friday: process.env.SHEET_FRIDAY,
}

async function main() {
  console.log('=== Backfill Daily Stops → Supabase ===\n')

  const token = await getAccessToken()
  console.log('Google auth OK\n')

  // Figure out this week's dates
  const now = new Date()
  const dayOfWeek = now.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(now)
  monday.setDate(now.getDate() + mondayOffset)

  const dayDates = {}
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  dayNames.forEach((name, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    dayDates[name] = d.toISOString().split('T')[0]
  })

  let totalInserted = 0

  for (const [dayName, sheetId] of Object.entries(DAILY_SHEETS)) {
    if (!sheetId) { console.log(`  ${dayName}: no sheet ID, skipping`); continue }

    const deliveryDate = dayDates[dayName]
    console.log(`--- ${dayName} (${deliveryDate}) ---`)

    try {
      const tabs = await fetchSheetTabs(token, sheetId)
      const driverTabs = tabs.filter(t => {
        const title = t.title || ''
        return title.includes(' - ') && !['SHSP Sort', 'Aultman Sort', 'Summary', 'Unassigned'].includes(title)
      })

      if (driverTabs.length === 0) {
        console.log('  No driver tabs found')
        continue
      }

      const ranges = driverTabs.map(t => `'${t.title}'!A1:I200`)
      const results = await fetchBatchRanges(token, sheetId, ranges)

      const rows = []
      driverTabs.forEach((tab, i) => {
        const data = results[i]?.values || []
        if (data.length < 2) return

        const headers = data[0].map(h => h.trim())
        const driverName = tab.title.split(' - ')[0].trim()
        const driverNumber = tab.title.split(' - ')[1]?.trim() || ''

        const orderIdIdx = headers.indexOf('Order ID')
        const nameIdx = headers.indexOf('Name')
        const addrIdx = headers.indexOf('Address')
        const cityIdx = headers.indexOf('City')
        const zipIdx = headers.indexOf('ZIP')
        const pharmaIdx = headers.indexOf('Pharmacy')
        const ccIdx = headers.indexOf('Cold Chain')
        const dispatchIdx = headers.indexOf('Dispatch Driver #')
        const assignedIdx = headers.indexOf('Assigned Driver #')

        data.slice(1).forEach(row => {
          if (!row.some(c => c?.trim())) return
          const ccVal = (ccIdx >= 0 ? (row[ccIdx] || '') : '').trim().toLowerCase()

          rows.push({
            delivery_date: deliveryDate,
            delivery_day: dayName,
            driver_name: driverName,
            driver_number: driverNumber,
            order_id: orderIdIdx >= 0 ? (row[orderIdIdx] || '') : '',
            patient_name: nameIdx >= 0 ? (row[nameIdx] || '') : '',
            address: addrIdx >= 0 ? (row[addrIdx] || '') : '',
            city: cityIdx >= 0 ? (row[cityIdx] || '') : '',
            zip: zipIdx >= 0 ? (row[zipIdx] || '') : '',
            pharmacy: pharmaIdx >= 0 ? (row[pharmaIdx] || '') : '',
            cold_chain: ccVal !== '' && ccVal !== 'no' && ccVal !== 'n',
            dispatch_driver_number: dispatchIdx >= 0 ? (row[dispatchIdx] || '') : '',
            assigned_driver_number: assignedIdx >= 0 ? (row[assignedIdx] || '') : '',
          })
        })
      })

      if (rows.length > 0) {
        // Delete existing rows for this date first
        await supabase.from('daily_stops').delete().eq('delivery_date', deliveryDate)

        // Insert in batches
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await supabase.from('daily_stops').insert(rows.slice(i, i + 500))
          if (error) console.error(`  Error: ${error.message}`)
        }
        console.log(`  ${rows.length} stops inserted (${driverTabs.length} drivers)`)
        totalInserted += rows.length
      } else {
        console.log('  No stops found')
      }
    } catch (err) {
      console.error(`  Error on ${dayName}: ${err.message}`)
    }
  }

  console.log(`\n=== DONE — ${totalInserted} total stops imported ===`)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
