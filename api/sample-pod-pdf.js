// Generates a sample POD PDF with fake data for preview purposes
// GET /api/sample-pod-pdf → returns PDF file

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // Dynamically import jspdf (server-side)
  // Actually, we'll generate this client-side instead
  // This endpoint just returns the sample data
  res.status(200).json({
    stop: {
      patient_name: 'Sample Patient A',
      address: '123 Main St',
      city: 'Akron',
      zip: '44306',
      order_id: '#13257256',
      driver_name: 'Theresa',
      delivery_date: '2026-04-20',
      delivered_at: '2026-04-20T13:41:00Z',
      status: 'delivered',
      delivery_lat: 41.06803,
      delivery_lng: -81.50108,
      cold_chain: true,
      delivery_note: 'Left with front desk per patient request.',
      photo_url: null,
      photo_urls: null,
      signature_url: null,
    },
    confirmation: {
      gps_distance_feet: 42,
      geofence_overridden: false,
      barcode_scanned: true,
      barcode_value: 'RX-0049281',
    },
  })
}
