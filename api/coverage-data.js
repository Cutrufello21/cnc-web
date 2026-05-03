// GET /api/coverage-data — returns delivery density by ZIP for heat map
import { supabase } from './_lib/supabase.js'

// ZIP center coordinates
const ZIP_COORDS = {
  '44201':[-81.1936,41.0262],'44203':[-81.6057,41.0131],'44210':[-81.4404,41.1595],
  '44216':[-81.6195,40.9617],'44221':[-81.4843,41.1334],'44223':[-81.4843,41.1334],
  '44224':[-81.4404,41.1595],'44232':[-81.5388,41.0242],'44236':[-81.3457,41.1508],
  '44240':[-81.3580,41.1537],'44241':[-81.3457,41.1898],'44250':[-81.5388,41.0342],
  '44260':[-81.3900,41.0700],'44262':[-81.4404,41.1395],'44264':[-81.5388,41.0642],
  '44278':[-81.4404,41.0262],'44281':[-81.7257,41.0242],'44286':[-81.6195,41.0917],
  '44301':[-81.5190,41.0614],'44302':[-81.5390,41.0814],'44303':[-81.5390,41.0914],
  '44304':[-81.5090,41.0914],'44305':[-81.4890,41.0814],'44306':[-81.4990,41.0514],
  '44307':[-81.5390,41.0614],'44308':[-81.5190,41.0814],'44310':[-81.5090,41.1014],
  '44311':[-81.5390,41.0514],'44312':[-81.5790,41.0214],'44313':[-81.5690,41.1114],
  '44314':[-81.5590,41.0414],'44319':[-81.4690,41.0114],'44320':[-81.5590,41.0714],
  '44321':[-81.6090,41.0814],'44333':[-81.6190,41.1414],
  '44601':[-81.1076,40.9153],'44608':[-81.5960,40.6560],'44614':[-81.5815,40.8567],
  '44618':[-81.6360,40.7460],'44626':[-81.4560,40.6860],'44630':[-81.4360,40.8860],
  '44632':[-81.2960,40.9460],'44640':[-81.1560,40.8860],'44641':[-81.2260,40.8560],
  '44643':[-81.4260,40.7260],'44646':[-81.4215,40.7667],'44647':[-81.5215,40.7967],
  '44648':[-81.2360,40.7460],'44657':[-81.1460,40.7560],'44662':[-81.4060,40.6260],
  '44666':[-81.6460,40.8260],'44669':[-81.3060,40.7060],'44685':[-81.4260,40.9460],
  '44688':[-81.3360,40.6660],'44702':[-81.3784,40.7989],'44703':[-81.3884,40.8089],
  '44704':[-81.3584,40.8089],'44705':[-81.3484,40.8189],'44706':[-81.3984,40.7689],
  '44707':[-81.3484,40.7689],'44708':[-81.4184,40.8189],'44709':[-81.3884,40.8289],
  '44710':[-81.4184,40.7889],'44714':[-81.3584,40.8289],'44718':[-81.4484,40.8489],
  '44720':[-81.4084,40.8789],'44721':[-81.3184,40.8689],
  '44231':[-81.1857,41.2395],'44234':[-81.1257,41.2895],'44255':[-81.2857,41.1795],
  '44265':[-81.2657,41.1295],'44266':[-81.2424,41.1573],'44272':[-81.1857,41.1995],
  '44285':[-81.1457,41.1695],'44288':[-81.0757,41.2395],
  '44610':[-81.5748,40.5718],'44612':[-81.3548,40.5518],'44615':[-81.2348,40.5418],
  '44621':[-81.4348,40.5318],'44622':[-81.4748,40.5318],'44624':[-81.5948,40.5518],
  '44629':[-81.3548,40.4818],'44634':[-81.6148,40.6318],'44644':[-81.5148,40.6518],
  '44656':[-81.3948,40.5918],'44663':[-81.4148,40.5218],'44681':[-81.5848,40.5018],
  '44683':[-81.4548,40.5518],
}

// City names for high-volume ZIPs
const ZIP_CITY = {
  '44301':'Akron','44302':'Akron','44303':'Akron','44304':'Akron','44305':'Akron',
  '44306':'Akron','44307':'Akron','44308':'Akron','44310':'Akron','44311':'Akron',
  '44312':'Akron','44313':'Akron','44314':'Akron','44319':'Akron','44320':'Akron',
  '44321':'Akron','44333':'Akron',
  '44702':'Canton','44703':'Canton','44704':'Canton','44705':'Canton','44706':'Canton',
  '44707':'Canton','44708':'Canton','44709':'Canton','44710':'Canton','44714':'Canton',
  '44647':'Massillon','44646':'Canton','44221':'Cuyahoga Falls','44223':'Cuyahoga Falls',
  '44224':'Stow','44210':'Stow','44266':'Ravenna','44240':'Kent',
  '44601':'Alliance','44622':'Dover','44621':'New Philadelphia',
  '44203':'Barberton','44281':'Wadsworth',
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })

  try {
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const cutoff = sixMonthsAgo.toISOString().split('T')[0]

    // Paginate to get ALL orders (Supabase caps at 1000 per query)
    const zipCounts = {}
    let offset = 0
    const pageSize = 1000
    let totalRows = 0
    while (true) {
      const { data, error } = await supabase
        .from('daily_stops')
        .select('zip')
        .gte('delivery_date', cutoff)
        .not('status', 'eq', 'DELETED')
        .range(offset, offset + pageSize - 1)

      if (error) throw new Error(error.message)
      if (!data || data.length === 0) break

      data.forEach(s => {
        if (!s.zip) return
        const z = String(s.zip).trim()
        zipCounts[z] = (zipCounts[z] || 0) + 1
      })
      totalRows += data.length
      offset += pageSize
      if (data.length < pageSize) break
    }

    const maxCount = Math.max(...Object.values(zipCounts), 1)
    const hotspots = []

    for (const [zip, count] of Object.entries(zipCounts)) {
      const coords = ZIP_COORDS[zip]
      if (!coords) continue
      hotspots.push({
        coords,
        intensity: Math.min(count / maxCount, 1),
        label: count > maxCount * 0.15 ? (ZIP_CITY[zip] || null) : null,
        count,
        zip,
      })
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200')
    return res.status(200).json({ hotspots, total: totalRows, zips: Object.keys(zipCounts).length })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
