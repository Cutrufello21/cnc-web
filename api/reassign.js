import { fetchRange, appendRows, deleteRow, getSheetTabs, parseBody, DAILY_SHEETS } from './_lib/sheets.js'
import { supabase } from './_lib/supabase.js'

// POST /api/reassign
// Body: { day, fromDriver, toDriver, orderIds }
// Moves stops between drivers in Google Sheets AND Supabase daily_stops

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { day, fromDriver, toDriver, orderIds } = await parseBody(req)

  if (!day || !fromDriver || !toDriver || !orderIds?.length) {
    return res.status(400).json({ error: 'Missing required fields: day, fromDriver, toDriver, orderIds' })
  }

  const sheetId = DAILY_SHEETS[day]
  if (!sheetId) {
    return res.status(400).json({ error: `No sheet for ${day}` })
  }

  try {
    // Get all tabs to find sheet IDs for deletion
    const tabs = await getSheetTabs(sheetId)
    const fromTab = tabs.find((t) => t.title === fromDriver)
    const toTab = tabs.find((t) => t.title === toDriver)

    if (!fromTab) return res.status(404).json({ error: `Tab "${fromDriver}" not found` })
    if (!toTab) return res.status(404).json({ error: `Tab "${toDriver}" not found` })

    // Read the source driver's tab
    const fromRows = await fetchRange(sheetId, `'${fromDriver}'!A1:I200`)
    if (fromRows.length < 2) {
      return res.status(400).json({ error: `No data in ${fromDriver} tab` })
    }

    const headers = fromRows[0]
    const orderIdIdx = headers.findIndex((h) => h.trim() === 'Order ID')
    const driverNumIdx = headers.findIndex((h) => h.trim() === 'Dispatch Driver #')
    const assignedIdx = headers.findIndex((h) => h.trim() === 'Assigned Driver #')

    if (orderIdIdx < 0) {
      return res.status(400).json({ error: 'Cannot find Order ID column' })
    }

    // Find matching rows to move (by Order ID)
    const orderIdSet = new Set(orderIds.map(String))
    const rowsToMove = []
    const rowIndicesToDelete = []

    fromRows.forEach((row, i) => {
      if (i === 0) return
      const oid = row[orderIdIdx]?.trim()
      if (oid && orderIdSet.has(oid)) {
        const newRow = [...row]
        const toDriverNum = toDriver.split(' - ')[1] || ''
        if (assignedIdx >= 0) newRow[assignedIdx] = toDriverNum
        if (driverNumIdx >= 0) newRow[driverNumIdx] = toDriverNum
        rowsToMove.push(newRow)
        rowIndicesToDelete.push(i)
      }
    })

    if (rowsToMove.length === 0) {
      return res.status(400).json({ error: 'No matching orders found to move' })
    }

    // 1. Append rows to destination driver tab (Google Sheets)
    await appendRows(sheetId, `'${toDriver}'!A1`, rowsToMove)

    // 2. Delete rows from source tab
    for (const rowIdx of rowIndicesToDelete.reverse()) {
      await deleteRow(sheetId, fromTab.sheetId, rowIdx)
    }

    // 3. Update Supabase daily_stops — reassign driver_name for these orders
    const toDriverName = toDriver.split(' - ')[0].trim()
    const toDriverNumber = toDriver.split(' - ')[1]?.trim() || ''
    for (const oid of orderIds) {
      await supabase.from('daily_stops')
        .update({ driver_name: toDriverName, driver_number: toDriverNumber })
        .eq('order_id', oid)
    }

    // 4. Sync orders table so historical records reflect the final driver
    try {
      await supabase.from('orders')
        .update({ driver_name: toDriverName })
        .in('order_id', orderIds)
    } catch (ordSyncErr) {
      console.error('[reassign orders sync]', ordSyncErr.message)
    }

    return res.status(200).json({
      success: true,
      moved: rowsToMove.length,
      from: fromDriver,
      to: toDriver,
      orderIds: orderIds,
    })
  } catch (err) {
    console.error('[reassign API]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
