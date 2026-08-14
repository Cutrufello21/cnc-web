const ABBREV = {
  'NEW PHILA': 'New Philadelphia',
  'N CANTON': 'North Canton',
  'N. CANTON': 'North Canton',
  'NO CANTON': 'North Canton',
  'E CANTON': 'East Canton',
  'E. CANTON': 'East Canton',
  'W CANTON': 'West Canton',
  'W. CANTON': 'West Canton',
  'S CANTON': 'South Canton',
  'S. CANTON': 'South Canton',
  'CUY FALLS': 'Cuyahoga Falls',
  'CUYA FALLS': 'Cuyahoga Falls',
  'CUYAHOGA FLS': 'Cuyahoga Falls',
  'C FALLS': 'Cuyahoga Falls',
  'MUN FALLS': 'Munroe Falls',
  'SILVER LK': 'Silver Lake',
  'FAIR LAWN': 'Fairlawn',
  'BATH TWP': 'Bath',
  'COPLEY TWP': 'Copley',
  'NEW FRANK': 'New Franklin',
  'BOSTON HTS': 'Boston Heights',
}

const LOWER = new Set(['of', 'the', 'and', 'a', 'an', 'in', 'on'])

function titleCase(str) {
  return str.toLowerCase().replace(/[\p{L}\p{N}']+/gu, (word, idx, full) => {
    if (idx > 0 && LOWER.has(word)) return word
    return word.charAt(0).toUpperCase() + word.slice(1)
  })
}

export function normalizeCity(raw) {
  if (!raw) return ''
  const trimmed = String(raw).trim().replace(/\s+/g, ' ')
  if (!trimmed) return ''
  const upper = trimmed.toUpperCase()
  if (ABBREV[upper]) return ABBREV[upper]
  return titleCase(trimmed)
}

export function normalizeCityKey(raw) {
  return normalizeCity(raw).toUpperCase()
}
