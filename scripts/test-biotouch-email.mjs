// Exercises buildBioTouchCorrectionEmail against representative scenarios
// so you can eyeball the output before sending to BioTouch.
// Run: node scripts/test-biotouch-email.mjs

import { buildBioTouchCorrectionEmail } from '../src/lib/biotouchEmail.js'

function rip(html) {
  // Strip HTML tags for terminal-readable output. The real email is HTML.
  return html
    .replace(/<\/p>/g, '\n')
    .replace(/<p[^>]*>/g, '')
    .replace(/<\/?b>/g, '')
    .replace(/<[^>]+>/g, '')
    .trim()
}

function run(label, batch) {
  console.log('\n' + '='.repeat(72))
  console.log(label)
  console.log('='.repeat(72))
  for (const driverId of Object.keys(batch)) {
    console.log(`\n--- Subject: Assign Orders to ${driverId} ---`)
    console.log(rip(buildBioTouchCorrectionEmail(driverId, batch)))
  }
}

// 1. Single driver, all unique ZIPs — should be ZIP-only.
run('Scenario 1: Single driver, three unique ZIPs', {
  '55500': {
    name: 'Dom',
    stops: [
      { orderId: '13383502', zip: '44306' },
      { orderId: '13382727', zip: '44310' },
      { orderId: '13382085', zip: '44321' },
    ],
  },
})

// 2. Two drivers, disjoint ZIPs — each gets a ZIP-only email.
run('Scenario 2: Two drivers, no overlap', {
  '55500': {
    name: 'Dom',
    stops: [
      { orderId: '13383502', zip: '44306' },
      { orderId: '13382727', zip: '44310' },
    ],
  },
  '59195': {
    name: 'Tara',
    stops: [
      { orderId: '13382164', zip: '44685' },
      { orderId: '13385280', zip: '44720' },
    ],
  },
})

// 3. Josh + Nick both have 44310 — both emails should use order numbers
//    for 44310. Josh also owns 44306 alone, so 44306 stays as a ZIP for him.
run('Scenario 3: Josh + Nick share 44310 (the screenshot case)', {
  'JOSH': {
    name: 'Josh',
    stops: [
      { orderId: '11111', zip: '44306' },
      { orderId: '22222', zip: '44310' },
      { orderId: '33333', zip: '44310' },
    ],
  },
  'NICK': {
    name: 'Nick',
    stops: [
      { orderId: '44444', zip: '44310' },
      { orderId: '55555', zip: '44720' },
    ],
  },
})

// 4. One stop missing a ZIP — that order MUST appear under Order #s.
run('Scenario 4: One stop missing ZIP', {
  '55500': {
    name: 'Dom',
    stops: [
      { orderId: '13383502', zip: '44306' },
      { orderId: '99999', zip: null },
    ],
  },
})

// 5. Two drivers, every ZIP overlaps — both emails are 100% order numbers,
//    no ZIPs listed.
run('Scenario 5: All ZIPs shared between two drivers', {
  'A': {
    name: 'Driver A',
    stops: [
      { orderId: 'A1', zip: '44306' },
      { orderId: 'A2', zip: '44310' },
    ],
  },
  'B': {
    name: 'Driver B',
    stops: [
      { orderId: 'B1', zip: '44306' },
      { orderId: 'B2', zip: '44310' },
    ],
  },
})

// 6. Mirrors the screenshot batch shape: 4 drivers, mix of overlap and
//    unique ZIPs. Uses fabricated ZIPs but real-looking driver IDs.
run('Scenario 6: 4-driver realistic batch', {
  '21549': { // Nicholas
    name: 'Nicholas',
    stops: [
      { orderId: '13385283', zip: '44685' },
      { orderId: '13384688', zip: '44720' },
      { orderId: '13384375', zip: '44685' },
    ],
  },
  '55500': { // Dom
    name: 'Dom',
    stops: [
      { orderId: '13383502', zip: '44306' },
      { orderId: '13382727', zip: '44310' },
    ],
  },
  '59195': { // Tara
    name: 'Tara',
    stops: [
      { orderId: '13382164', zip: '44310' }, // overlaps Dom on 44310
      { orderId: '13385280', zip: '44321' },
    ],
  },
  '59197': { // Brad
    name: 'Brad',
    stops: [
      { orderId: '13383305', zip: '44685' }, // overlaps Nicholas on 44685
      { orderId: '13382224', zip: '44460' },
    ],
  },
})
