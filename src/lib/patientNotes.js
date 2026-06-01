// Per-patient notes shared across drivers. Keyed by a normalized name
// so "Joel E Huey" and "Huey, Joel E" collapse to one row. Mirrors the
// normalizeKey() in src/pages/portal/PortalPatients.jsx so a name shown
// there resolves to the same note row as a name shown in dispatch.

import { supabase } from './supabase'
import { dbUpsert, dbDelete } from './db'

export function normalizePatientKey(name) {
  if (!name) return ''
  return String(name)
    .toLowerCase()
    .replace(/[,.:]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ')
}

// Bulk fetch — pass a list of patient names, get back a Map keyed by
// patient_key. Callers should normalize the lookup name with
// normalizePatientKey() before reading from the map.
export async function fetchPatientNotes(patientNames) {
  const keys = [...new Set(
    (patientNames || []).map(normalizePatientKey).filter(Boolean)
  )]
  if (keys.length === 0) return new Map()
  const { data, error } = await supabase
    .from('patient_notes')
    .select('patient_key, patient_name, note, updated_at, updated_by')
    .in('patient_key', keys)
  if (error) return new Map()
  const out = new Map()
  for (const row of data || []) out.set(row.patient_key, row)
  return out
}

export async function savePatientNote(patientName, note, editorEmail) {
  const patient_key = normalizePatientKey(patientName)
  if (!patient_key) throw new Error('Patient name required')
  const trimmed = (note || '').trim()
  if (!trimmed) {
    // Empty note → delete the row so the indicator goes away.
    await dbDelete('patient_notes', { patient_key })
    return null
  }
  const payload = {
    patient_key,
    patient_name: patientName,
    note: trimmed,
    updated_by: editorEmail || null,
    updated_at: new Date().toISOString(),
  }
  const rows = await dbUpsert('patient_notes', payload, 'tenant_id,patient_key')
  return rows?.[0] || null
}

export async function deletePatientNote(patientName) {
  const patient_key = normalizePatientKey(patientName)
  if (!patient_key) return
  await dbDelete('patient_notes', { patient_key })
}
