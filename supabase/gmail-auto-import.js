/**
 * Google Apps Script — CNC Delivery Auto-Import
 *
 * Watches Gmail for Trellis order emails, parses the CSV attachment,
 * routes orders using Supabase routing_rules, and inserts into
 * daily_stops + orders tables.
 *
 * SETUP:
 * 1. Go to https://script.google.com
 * 2. Create a new project named "CNC Auto-Import"
 * 3. Paste this entire file into Code.gs
 * 4. Set the SUPABASE constants below
 * 5. Run setupTrigger() once to install the auto-check
 * 6. Authorize when prompted
 */

// ============================================
// CONFIG — update these
// ============================================
const SUPABASE_URL = 'https://tefpguuyfjsynnhmbgdu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlZnBndXV5ZmpzeW5uaG1iZ2R1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI2OTI1NSwiZXhwIjoyMDg5ODQ1MjU1fQ.JmiO1UCT_8pCihbMbGgH-8BF8UT6jk_n7NqEaVHqCzk';
const ORDER_EMAIL_SUBJECT = 'OH Trellis Order Assignments';
const NOTIFY_EMAIL = 'dom@cncdeliveryservice.com';

// Driver ID → Name mapping
const DRIVERS = {
  '55493': 'Bobby', '55509': 'Jake', '57104': 'Adam',
  '55541': 'Theresa', '55540': 'Nick', '21143': 'Rob',
  '55903': 'Josh', '55535': 'Alex', '55500': 'Dom',
  '55532': 'Mark', '57096': 'Mike', '59195': 'Tara',
  '21549': 'Nicholas', '59192': 'Laura', '59170': 'Kasey',
  '59197': 'Brad',
};
const FLOATING_DRIVERS = new Set(['59197', '59170']); // Brad, Kasey

// ============================================
// MAIN — runs on schedule
// ============================================
function checkForNewOrders() {
  const label = GmailApp.getUserLabelByName('CNC-Processed');
  if (!label) GmailApp.createLabel('CNC-Processed');

  // Search for unprocessed Trellis emails from today
  const query = `subject:"${ORDER_EMAIL_SUBJECT}" has:attachment newer_than:1d -label:CNC-Processed`;
  const threads = GmailApp.search(query, 0, 5);

  if (threads.length === 0) {
    Logger.log('No new Trellis emails found');
    return;
  }

  Logger.log(`Found ${threads.length} new Trellis email(s)`);

  for (const thread of threads) {
    try {
      processThread(thread);
      // Mark as processed
      const processedLabel = GmailApp.getUserLabelByName('CNC-Processed');
      thread.addLabel(processedLabel);
    } catch (err) {
      Logger.log(`Error processing thread: ${err.message}`);
      // Send error notification
      MailApp.sendEmail(NOTIFY_EMAIL, 'CNC Auto-Import Error',
        `Failed to process Trellis email: ${err.message}\n\nCheck Apps Script logs for details.`);
    }
  }
}

function processThread(thread) {
  const messages = thread.getMessages();
  const message = messages[messages.length - 1]; // Latest message
  const attachments = message.getAttachments();

  // Find CSV attachment
  const csv = attachments.find(a =>
    a.getContentType().includes('csv') || a.getName().endsWith('.csv')
  );
  if (!csv) {
    Logger.log('No CSV attachment found');
    return;
  }

  const csvText = csv.getDataAsString();
  Logger.log(`CSV attachment: ${csv.getName()} (${csvText.length} chars)`);

  // Parse CSV
  const orders = parseCSV(csvText);
  Logger.log(`Parsed ${orders.length} orders`);

  if (orders.length === 0) return;

  // Load routing rules from Supabase
  const routingRules = loadRoutingRules();
  Logger.log(`Loaded ${Object.keys(routingRules).length} routing rules`);

  // Determine delivery day (dispatch runs evening before delivery)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let deliveryDay;
  if (dayOfWeek === 5) deliveryDay = 'Monday';      // Friday → Monday
  else if (dayOfWeek === 6) deliveryDay = 'Monday';  // Saturday → Monday
  else deliveryDay = dayNames[dayOfWeek + 1];        // Weeknight → tomorrow

  const dayAbbrev = { Monday: 'mon', Tuesday: 'tue', Wednesday: 'wed', Thursday: 'thu', Friday: 'fri' };
  const dayCol = dayAbbrev[deliveryDay] || 'mon';

  // Calculate delivery date
  const delivery = new Date(now);
  const daysAhead = dayOfWeek === 5 ? 3 : dayOfWeek === 6 ? 2 : 1;
  delivery.setDate(delivery.getDate() + daysAhead);
  const deliveryDate = Utilities.formatDate(delivery, 'America/New_York', 'yyyy-MM-dd');

  // Route orders
  const { assigned, unassigned } = routeOrders(orders, routingRules, dayCol);

  const totalAssigned = Object.values(assigned).reduce((s, arr) => s + arr.length, 0);
  Logger.log(`Routed: ${totalAssigned} assigned, ${unassigned.length} unassigned`);

  // Write to Supabase
  writeDailyStops(deliveryDay, deliveryDate, assigned);
  writeOrders(deliveryDate, assigned);
  writeDispatchLog(deliveryDay, deliveryDate, assigned, unassigned);
  updatePayroll(deliveryDay, deliveryDate, assigned);

  // Send confirmation
  const driverSummary = Object.entries(assigned)
    .map(([id, orders]) => `${DRIVERS[id] || id}: ${orders.length} stops`)
    .sort()
    .join('\n');

  const [yr, mo, dy] = deliveryDate.split('-');
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const fmtDate = `${monthNames[+mo - 1]} ${+dy}, ${yr}`;

  MailApp.sendEmail(NOTIFY_EMAIL,
    `${deliveryDay}'s Orders — ${fmtDate}`,
    `${totalAssigned} orders ready for ${deliveryDay}, ${fmtDate}.\n\n` +
    `Driver Breakdown:\n${driverSummary}\n\n` +
    (unassigned.length > 0 ? `Unassigned: ${unassigned.length} (ZIPs: ${unassigned.map(u => u.zip).join(', ')})\n\n` : '') +
    `View at: https://cncdelivery.com`
  );

  Logger.log('Import complete');
}

// ============================================
// CSV PARSER
// ============================================
function parseCSV(text) {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"/, '').replace(/"$/, ''));
  const col = (name) => headers.indexOf(name);

  const orders = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (!row || row.length < 3) continue;

    const zip = normalizeZip(row[col('DestZip')] || '');
    if (!zip || zip === '00000') continue;

    const address = (row[col('DestAddress')] || '').trim();
    if (address.toUpperCase().includes('2600 6TH') && address.toUpperCase().includes('ALTMAN')) continue;

    const comments = (row[col('DestComments')] || '').toLowerCase();
    const coldChain = comments.includes('cold chain');
    const sigRequired = comments.includes('sig') && comments.includes('req');

    const notes = [coldChain && 'Cold Chain', sigRequired && 'Signature Required'].filter(Boolean).join(' + ') || '';

    orders.push({
      order_id: (row[col('OrderID')] || '').trim(),
      name: (row[col('DestName')] || '').trim(),
      address: address,
      city: (row[col('DestCity')] || '').trim(),
      zip: zip,
      cold_chain: coldChain,
      sig_required: sigRequired,
      notes: notes,
      pharmacy: normalizePharmacy(row[col('OriginName')] || ''),
      trellis_driver: (row[col('DriverID')] || '').trim(),
    });
  }

  return orders;
}

function parseCSVLine(line) {
  if (!line || !line.trim()) return null;
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuotes = !inQuotes; continue; }
    if (c === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
    current += c;
  }
  result.push(current.trim());
  return result;
}

function normalizeZip(z) {
  return (z || '').trim().split('-')[0].padStart(5, '0');
}

function normalizePharmacy(name) {
  const n = name.toUpperCase();
  if (n.includes('AULTMAN') || n.includes('SUMMA')) return 'Aultman';
  if (n.includes('SHSP') || n.includes('ARCH')) return 'SHSP';
  return name;
}

// ============================================
// ROUTING
// ============================================
function loadRoutingRules() {
  const data = supabaseGet('routing_rules', 'select=*');
  const rules = {};
  for (const row of data) {
    rules[`${row.zip_code}|${row.pharmacy}`] = {
      mon: row.mon, tue: row.tue, wed: row.wed, thu: row.thu, fri: row.fri,
    };
  }
  return rules;
}

function routeOrders(orders, rules, dayCol) {
  const assigned = {};
  const unassigned = [];

  for (const o of orders) {
    // Try exact match first, then try without pharmacy
    let rule = rules[`${o.zip}|${o.pharmacy}`];
    if (!rule) {
      // Try other pharmacy
      const altPharmacy = o.pharmacy === 'SHSP' ? 'Aultman' : 'SHSP';
      rule = rules[`${o.zip}|${altPharmacy}`];
    }
    if (!rule) {
      // Try empty pharmacy
      rule = rules[`${o.zip}|`];
    }

    if (!rule) {
      unassigned.push(o);
      continue;
    }

    const rawDriver = (rule[dayCol] || '').trim();
    // Handle "Name/ID" format from routing_rules (e.g. "Bobby/55493")
    const driverId = rawDriver.includes('/') ? rawDriver.split('/').pop() : rawDriver;
    if (!driverId || FLOATING_DRIVERS.has(driverId)) {
      unassigned.push(o);
      continue;
    }
    if (!DRIVERS[driverId]) {
      unassigned.push(o);
      continue;
    }

    if (!assigned[driverId]) assigned[driverId] = [];
    assigned[driverId].push(o);
  }

  return { assigned, unassigned };
}

// ============================================
// SUPABASE WRITES
// ============================================
function writeDailyStops(deliveryDay, deliveryDate, assigned) {
  // Delete existing stops for this date
  supabaseDelete('daily_stops', `delivery_date=eq.${deliveryDate}`);

  const rows = [];
  for (const [driverId, orders] of Object.entries(assigned)) {
    const driverName = DRIVERS[driverId] || driverId;
    for (const o of orders) {
      rows.push({
        delivery_date: deliveryDate,
        delivery_day: deliveryDay,
        driver_name: driverName,
        driver_number: driverId,
        order_id: o.order_id,
        patient_name: o.name,
        address: o.address,
        city: o.city,
        zip: o.zip,
        pharmacy: o.pharmacy,
        cold_chain: o.cold_chain,
        notes: o.notes || '',
        dispatch_driver_number: o.trellis_driver,
        assigned_driver_number: driverId,
      });
    }
  }

  // Insert in batches
  for (let i = 0; i < rows.length; i += 500) {
    supabasePost('daily_stops', rows.slice(i, i + 500));
  }
  Logger.log(`  daily_stops: ${rows.length} rows`);
}

function writeOrders(deliveryDate, assigned) {
  const rows = [];
  for (const [driverId, orders] of Object.entries(assigned)) {
    const driverName = DRIVERS[driverId] || driverId;
    for (const o of orders) {
      rows.push({
        order_id: o.order_id,
        patient_name: o.name,
        address: o.address,
        city: o.city,
        zip: o.zip,
        pharmacy: o.pharmacy,
        driver_name: driverName,
        date_delivered: deliveryDate,
        cold_chain: o.cold_chain,
        source: 'Live',
      });
    }
  }

  for (let i = 0; i < rows.length; i += 500) {
    supabaseUpsert('orders', rows.slice(i, i + 500));
  }
  Logger.log(`  orders: ${rows.length} upserted`);
}

function writeDispatchLog(deliveryDay, deliveryDate, assigned, unassigned) {
  const allOrders = Object.values(assigned).flat();
  const total = allOrders.length;
  const cold = allOrders.filter(o => o.cold_chain).length;
  const shsp = allOrders.filter(o => o.pharmacy === 'SHSP').length;
  const aultman = allOrders.filter(o => o.pharmacy === 'Aultman').length;

  const driverCounts = {};
  for (const [id, orders] of Object.entries(assigned)) {
    driverCounts[DRIVERS[id] || id] = orders.length;
  }
  const topDriver = Object.entries(driverCounts).sort((a, b) => b[1] - a[1])[0];

  supabaseUpsert('dispatch_logs', [{
    date: deliveryDate,
    delivery_day: deliveryDay,
    status: 'Complete',
    orders_processed: total,
    cold_chain: cold,
    unassigned_count: unassigned.length,
    corrections: 0,
    shsp_orders: shsp,
    aultman_orders: aultman,
    top_driver: topDriver ? topDriver[0] : '',
  }]);
  Logger.log(`  dispatch_logs: ${total} orders logged`);
}

function updatePayroll(deliveryDay, deliveryDate, assigned) {
  // Get Monday of this week
  const d = new Date(deliveryDate + 'T12:00:00');
  const dow = d.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  const weekOf = Utilities.formatDate(monday, 'America/New_York', 'yyyy-MM-dd');

  const dayCol = { Monday: 'mon', Tuesday: 'tue', Wednesday: 'wed', Thursday: 'thu', Friday: 'fri' }[deliveryDay];
  if (!dayCol) return;

  // Count stops per driver
  for (const [driverId, orders] of Object.entries(assigned)) {
    const driverName = DRIVERS[driverId] || driverId;
    const stopCount = orders.length;

    // Check if payroll row exists
    const existing = supabaseGet('payroll', `select=*&week_of=eq.${weekOf}&driver_name=eq.${encodeURIComponent(driverName)}`);

    if (existing && existing.length > 0) {
      // Update the day column and recalculate total
      const row = existing[0];
      const update = { [dayCol]: stopCount };
      const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
      let total = 0;
      days.forEach(dd => { total += dd === dayCol ? stopCount : (row[dd] || 0); });
      update.week_total = total;

      UrlFetchApp.fetch(`${SUPABASE_URL}/rest/v1/payroll?id=eq.${row.id}`, {
        method: 'patch',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        payload: JSON.stringify(update),
        muteHttpExceptions: true,
      });
    } else {
      // Create new payroll row
      const newRow = {
        week_of: weekOf,
        driver_name: driverName,
        driver_number: driverId,
        mon: 0, tue: 0, wed: 0, thu: 0, fri: 0,
        week_total: stopCount,
        will_calls: 0,
        weekly_pay: 0,
      };
      newRow[dayCol] = stopCount;
      supabasePost('payroll', [newRow]);
    }
  }
  Logger.log(`  payroll: updated ${dayCol} for ${Object.keys(assigned).length} drivers`);
}

// ============================================
// SUPABASE HTTP HELPERS
// ============================================
function supabaseGet(table, params) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const resp = UrlFetchApp.fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    muteHttpExceptions: true,
  });
  return JSON.parse(resp.getContentText());
}

function supabasePost(table, data) {
  UrlFetchApp.fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'post',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    payload: JSON.stringify(data),
    muteHttpExceptions: true,
  });
}

function supabaseUpsert(table, data) {
  UrlFetchApp.fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'post',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    payload: JSON.stringify(data),
    muteHttpExceptions: true,
  });
}

function supabaseDelete(table, filter) {
  UrlFetchApp.fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'delete',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    muteHttpExceptions: true,
  });
}

// ============================================
// TRIGGER SETUP — run once
// ============================================
function setupTrigger() {
  // Remove existing triggers
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // Check every 15 minutes between 5 PM and 10 PM
  ScriptApp.newTrigger('checkForNewOrders')
    .timeBased()
    .everyMinutes(15)
    .create();

  Logger.log('Trigger installed: checkForNewOrders every 15 minutes');
  Logger.log('Emails matching "' + ORDER_EMAIL_SUBJECT + '" will be auto-processed');
  Logger.log('Processed emails get labeled "CNC-Processed" to avoid re-import');
}

// Manual test
function testRun() {
  checkForNewOrders();
}
