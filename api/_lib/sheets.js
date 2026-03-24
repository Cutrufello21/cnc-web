import { createSign } from 'crypto'
import { readFileSync } from 'fs'

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'
const TOKEN_URI = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets'

// --- JWT-based auth using native crypto (no external deps) ---

function getCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_PATH) {
    return JSON.parse(readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_PATH, 'utf8'))
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    let raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim()
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      raw = raw.slice(1, -1)
    }
    raw = raw.replace(/\\"/g, '"')
    const creds = JSON.parse(raw)
    if (typeof creds.private_key === 'string') {
      creds.private_key = creds.private_key.replace(/\\n/g, '\n')
    }
    return creds
  }
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }
  }
  throw new Error('No Google credentials configured')
}

function base64url(data) {
  return Buffer.from(data).toString('base64url')
}

function createJWT(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_URI,
    iat: now,
    exp: now + 3600,
  }))
  const unsigned = `${header}.${payload}`
  const sign = createSign('RSA-SHA256')
  sign.update(unsigned)
  const signature = sign.sign(privateKey, 'base64url')
  return `${unsigned}.${signature}`
}

let cachedToken = null
let tokenExpiry = 0

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken

  const creds = getCredentials()
  const jwt = createJWT(creds.client_email, creds.private_key)

  const res = await fetch(TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })

  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`)
  const data = await res.json()
  cachedToken = data.access_token
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
  return cachedToken
}

async function getHeaders() {
  const token = await getAccessToken()
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

// --- Sheets API functions (unchanged signatures) ---

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
