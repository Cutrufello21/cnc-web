import { fetchRange, MASTER_SHEET_ID, DAILY_SHEETS } from './sheets.js'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Map email → driver tab name (matches Google Sheet tab names)
const EMAIL_TO_DRIVER = {
  'robert.miller315@gmail.com':   'Bobby - 55493',
  'nickpollack01@gmail.com':      'Nick - 55540',
  'jacob@cncdeliveryservice.com': 'Jake - 55509',
  'shondeladam@gmail.com':        'Adam - 57104',
  'josh@cncdeliveryservice.com':  'Josh - 55903',
  'tcabiness1@gmail.com':         'Theresa - 55541',
  'laura@cncdeliveryservice.com': 'Laura - 59192',
  'ajreed410@gmail.com':          'Alex - 55535',
  'chisnellma@gmail.com':         'Mike - 57096',
  'taraleaa3@gmail.com':          'Tara - 59195',
  'nicholaseager21@gmail.com':    'Nicholas - 21549',
  'dom@cncdeliveryservice.com':   'Dom - 55500',
  'cutrufellomark@gmail.com':     'Mark - 55532',
  'kcharvey13@gmail.com':         'Kasey - 59170',
}

export default async function handler(req, res) {
  const driverEmail = req.query.email?.toLowerCase()
  if (!driverEmail) return res.status(400).json({ error: 'Missing email' })

  const tabName = EMAIL_TO_DRIVER[driverEmail]
  if (!tabName) return res.status(403).json({ error: 'Driver not found' })

  const driverName = tabName.split(' - ')[0]
  const driverId = tabName.split(' - ')[1]

  // Determine today's delivery day
  const todayIdx = new Date().getDay()
  const todayName = DAYS[todayIdx]
  const sheetId = DAILY_SHEETS[todayName]

  // Weekends — no delivery
  if (!sheetId) {
    return res.status(200).json({
      approved: false,
      noDeliveryToday: true,
      deliveryDay: todayName,
      driverName,
      driverId,
      stops: [],
      weekTotal: 0,
    })
  }

  try {
    // Fetch in parallel: driver tab, weekly stops, dispatch log
    const [driverRows, weeklyRows, logRows] = await Promise.all([
      fetchRange(sheetId, `'${tabName}'!A1:I200`).catch(() => []),
      fetchRange(MASTER_SHEET_ID, 'Weekly Stops!A1:J20'),
      fetchRange(MASTER_SHEET_ID, 'Log!A1:M500'),
    ])

    // Determine approval status from the dispatch log
    // Dispatch runs the night before delivery — log entry date is last night
    const today = new Date()
    const todayStr = today.toLocaleDateString('en-US', {
      month: '2-digit', day: '2-digit', year: 'numeric',
    })
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toLocaleDateString('en-US', {
      month: '2-digit', day: '2-digit', year: 'numeric',
    })

    const logHeaders = logRows[0] || []
    const dateIdx = logHeaders.findIndex((h) => h.trim() === 'Date')
    const statusIdx = logHeaders.findIndex((h) => h.trim() === 'Status')
    const deliveryDayIdx = logHeaders.findIndex((h) => h.trim() === 'Delivery Day')

    let approved = false
    if (logRows.length > 1) {
      for (let i = logRows.length - 1; i >= 1; i--) {
        const row = logRows[i]
        const logDate = row[dateIdx] || ''
        const logStatus = row[statusIdx] || ''
        const logDeliveryDay = row[deliveryDayIdx] || ''

        if (logDeliveryDay === todayName && logStatus === 'Complete') {
          if (logDate === todayStr || logDate === yesterdayStr) {
            approved = true
            break
          }
        }
      }
    }

    // Parse driver stops
    let stops = []
    if (driverRows.length > 1) {
      const headers = driverRows[0].map((h) => h.trim())
      stops = driverRows.slice(1)
        .filter((row) => row.some((cell) => cell?.trim()))
        .map((row, idx) => {
          const obj = { _index: idx }
          headers.forEach((h, i) => { obj[h] = row[i] || '' })

          // Cold chain detection
          const isColdChain = Object.values(obj).some((v) =>
            typeof v === 'string' && v.toLowerCase().match(/^(yes|y|cold chain|cc)$/)
          )
          obj._coldChain = isColdChain

          return obj
        })
    }

    // Parse weekly stops for this driver
    const wsHeaders = weeklyRows[0]?.map((h) => h.trim()) || []
    const driverWeeklyRow = weeklyRows.slice(1).find((r) => r[0]?.trim() === driverName)
    let weekTotal = 0
    let dailyStops = {}
    if (driverWeeklyRow) {
      const dayAbbrevs = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
      dayAbbrevs.forEach((d) => {
        const idx = wsHeaders.indexOf(d)
        if (idx >= 0) dailyStops[d] = parseInt(driverWeeklyRow[idx]) || 0
      })
      const totalIdx = wsHeaders.indexOf('Week Total')
      if (totalIdx >= 0) weekTotal = parseInt(driverWeeklyRow[totalIdx]) || 0
    }

    return res.status(200).json({
      approved,
      deliveryDay: todayName,
      driverName,
      driverId,
      tabName,
      stops,
      stopCount: stops.length,
      coldChainCount: stops.filter((s) => s._coldChain).length,
      weekTotal,
      dailyStops,
    })
  } catch (err) {
    console.error('[driver API]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
