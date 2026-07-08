// Shared address normalizer for geocode cache keys.
// Collapses formatting variance so "123 Main St" and "123 Main Street" hit the same cache row.

const STREET_TYPE_MAP = {
  street: 'st',
  avenue: 'ave',
  boulevard: 'blvd',
  drive: 'dr',
  road: 'rd',
  lane: 'ln',
  court: 'ct',
  place: 'pl',
  circle: 'cir',
  trail: 'trl',
  parkway: 'pkwy',
  highway: 'hwy',
  terrace: 'ter',
  square: 'sq',
  route: 'rte',
}

const DIRECTIONAL_MAP = {
  northwest: 'nw',
  northeast: 'ne',
  southwest: 'sw',
  southeast: 'se',
  north: 'n',
  south: 's',
  east: 'e',
  west: 'w',
}

// Strip unit / apt / suite / # tokens — pharmacy delivery is building-level.
const UNIT_REGEX = /\s+(?:apt|apartment|unit|suite|ste|#)\s*[\w\-\/]+/gi

export function normalizeAddress(address) {
  if (!address) return ''
  let s = String(address).toLowerCase().trim()
  s = s.replace(/[.,]/g, ' ')
  s = s.replace(UNIT_REGEX, '')
  s = s.replace(/\s+/g, ' ').trim()
  const words = s.split(' ')
  const mapped = words.map(w => STREET_TYPE_MAP[w] || DIRECTIONAL_MAP[w] || w)
  return mapped.join(' ').trim()
}

export function normalizeCity(city) {
  if (!city) return ''
  return String(city).toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function normalizeZip(zip) {
  if (!zip) return ''
  const s = String(zip).trim()
  const match = s.match(/^\d{5}/)
  return match ? match[0] : s.slice(0, 5)
}

export function buildCacheKey(address, city, zip) {
  return `${normalizeAddress(address)}|${normalizeCity(city)}|${normalizeZip(zip)}`
}
