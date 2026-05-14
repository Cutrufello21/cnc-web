// BioTouch corrections payload: list ZIPs unique to this driver in the batch,
// and fall back to specific order IDs for ZIPs shared with another driver
// in the same batch (so BioTouch can't ambiguously reassign a ZIP that
// belongs to two drivers). Orders missing a ZIP always go by order ID.

export function getBioTouchBreakdown(driverId, allCorrections) {
  const myStops = allCorrections[driverId]?.stops || []
  const otherZips = new Set()
  for (const [otherId, info] of Object.entries(allCorrections)) {
    if (otherId === driverId) continue
    for (const s of (info.stops || [])) {
      const z = s.zip ? String(s.zip).slice(0, 5) : ''
      if (z) otherZips.add(z)
    }
  }
  const myByZip = {}
  const noZipOrders = []
  for (const s of myStops) {
    const z = s.zip ? String(s.zip).slice(0, 5) : ''
    if (!z) { noZipOrders.push(s.orderId); continue }
    if (!myByZip[z]) myByZip[z] = []
    myByZip[z].push(s.orderId)
  }
  const uniqueZips = []
  const conflictOrders = []
  for (const [z, oids] of Object.entries(myByZip)) {
    if (otherZips.has(z)) conflictOrders.push(...oids)
    else uniqueZips.push(z)
  }
  uniqueZips.sort()
  return { uniqueZips, conflictOrderIds: [...conflictOrders, ...noZipOrders] }
}

export function buildBioTouchCorrectionEmail(driverId, allCorrections) {
  const { uniqueZips, conflictOrderIds } = getBioTouchBreakdown(driverId, allCorrections)
  const parts = []
  if (uniqueZips.length) parts.push(`<p style="margin:0 0 8px 0"><b>Zip codes:</b> ${uniqueZips.join(', ')}</p>`)
  if (conflictOrderIds.length) parts.push(`<p style="margin:0"><b>Order #s:</b> ${conflictOrderIds.join(', ')}</p>`)
  return `<div style="font-family:Arial,sans-serif;font-size:14px">${parts.join('')}</div>`
}
