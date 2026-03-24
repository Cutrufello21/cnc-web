import { GoogleAuth } from 'google-auth-library'
import { readFileSync } from 'fs'

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

function createAuth() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_PATH) {
    const creds = JSON.parse(readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_PATH, 'utf8'))
    return new GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    let raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim()
    // Strip wrapping quotes if Vercel added them
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      raw = raw.slice(1, -1)
    }
    raw = raw.replace(/\\"/g, '"')
    const creds = JSON.parse(raw)
    if (typeof creds.private_key === 'string') {
      creds.private_key = creds.private_key.replace(/\\n/g, '\n')
    }
    return new GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
  }
  // Individual env vars approach (Vercel-friendly)
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return new GoogleAuth({
      credentials: {
        type: 'service_account',
        project_id: process.env.GOOGLE_PROJECT_ID || 'cnc-dispatch',
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
  }
  throw new Error('No Google credentials configured')
}

let authInstance = null

async function getHeaders() {
  if (!authInstance) {
    authInstance = createAuth()
  }
  const client = await authInstance.getClient()
  const token = await client.getAccessToken()
  return { Authorization: `Bearer ${token.token || token}`, 'Content-Type': 'application/json' }
}

export async function fetchRange(spreadsheetId, range) {
  const headers = await getHeaders()
  const url = `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`Sheets API error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.values || []
}

export async function fetchMultipleRanges(spreadsheetId, ranges) {
  const headers = await getHeaders()
  const params = ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&')
  const url = `${SHEETS_BASE}/${spreadsheetId}/values:batchGet?${params}`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`Sheets API error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.valueRanges || []
}

export async function appendRows(spreadsheetId, range, values) {
  const headers = await getHeaders()
  const url = `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ values }) })
  if (!res.ok) throw new Error(`Sheets API error ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function deleteRow(spreadsheetId, sheetId, rowIndex) {
  const headers = await getHeaders()
  const url = `${SHEETS_BASE}/${spreadsheetId}:batchUpdate`
  const body = {
    requests: [{
      deleteDimension: {
        range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 },
      },
    }],
  }
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`Sheets API error ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function updateCell(spreadsheetId, range, value) {
  const headers = await getHeaders()
  const url = `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`
  const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify({ values: [[value]] }) })
  if (!res.ok) throw new Error(`Sheets API error ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function getSheetTabs(spreadsheetId) {
  const headers = await getHeaders()
  const url = `${SHEETS_BASE}/${spreadsheetId}?fields=sheets.properties`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`Sheets API error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.sheets.map((s) => s.properties)
}

export function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (req.body && typeof req.body === 'string') return JSON.parse(req.body)
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => resolve(JSON.parse(body)))
  })
}

export const MASTER_SHEET_ID = process.env.MASTER_SHEET_ID
export const DAILY_SHEETS = {
  Monday: process.env.SHEET_MONDAY,
  Tuesday: process.env.SHEET_TUESDAY,
  Wednesday: process.env.SHEET_WEDNESDAY,
  Thursday: process.env.SHEET_THURSDAY,
  Friday: process.env.SHEET_FRIDAY,
}
