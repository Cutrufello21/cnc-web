import { google } from 'googleapis'
import { readFileSync } from 'fs'

function getAuth() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_PATH) {
    const creds = JSON.parse(readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_PATH, 'utf8'))
    return new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    let raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    // Handle double-escaped newlines from env var
    const creds = JSON.parse(raw)
    if (typeof creds.private_key === 'string') {
      creds.private_key = creds.private_key.replace(/\\n/g, '\n')
    }
    return new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
  }
  throw new Error('No Google credentials configured')
}

let sheetsClient = null

async function getSheets() {
  if (!sheetsClient) {
    const auth = getAuth()
    sheetsClient = google.sheets({ version: 'v4', auth })
  }
  return sheetsClient
}

export async function fetchRange(spreadsheetId, range) {
  const sheets = await getSheets()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range })
  return res.data.values || []
}

export async function fetchMultipleRanges(spreadsheetId, ranges) {
  const sheets = await getSheets()
  const res = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges })
  return res.data.valueRanges || []
}

export async function appendRows(spreadsheetId, range, values) {
  const sheets = await getSheets()
  return sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  })
}

export async function deleteRow(spreadsheetId, sheetId, rowIndex) {
  const sheets = await getSheets()
  return sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 },
        },
      }],
    },
  })
}

export async function updateCell(spreadsheetId, range, value) {
  const sheets = await getSheets()
  return sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[value]] },
  })
}

export async function getSheetTabs(spreadsheetId) {
  const sheets = await getSheets()
  const res = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' })
  return res.data.sheets.map((s) => s.properties)
}

export const MASTER_SHEET_ID = process.env.MASTER_SHEET_ID
export const DAILY_SHEETS = {
  Monday: process.env.SHEET_MONDAY,
  Tuesday: process.env.SHEET_TUESDAY,
  Wednesday: process.env.SHEET_WEDNESDAY,
  Thursday: process.env.SHEET_THURSDAY,
  Friday: process.env.SHEET_FRIDAY,
}
