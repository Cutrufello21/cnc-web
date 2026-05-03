// Get the current delivery date — advances to next business day at 6 PM ET
// Matches the driver app's getDD() logic exactly
export function getDeliveryDate() {
  const n = new Date()
  // Convert to Eastern Time
  const et = new Date(n.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const d = et.getDay()
  const h = et.getHours()

  if (d === 6) et.setDate(et.getDate() + 2)       // Saturday → Monday
  else if (d === 0) et.setDate(et.getDate() + 1)   // Sunday → Monday
  else if (h >= 18) et.setDate(et.getDate() + (d === 5 ? 3 : 1)) // After 6 PM → next business day

  return `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}-${String(et.getDate()).padStart(2, '0')}`
}
