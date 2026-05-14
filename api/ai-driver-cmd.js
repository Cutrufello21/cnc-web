// AI Driver Command — natural-language route reorder fallback.
// POST /api/ai-driver-cmd
//
// Reads:  nothing
// Writes: nothing
// Returns: { newOrder, moves, summary } or { error, examples }
//
// The driver app tries a local regex parser first (utils/cmdParser.js). When
// that returns `unknown`, the app POSTs here. We hand the command to Claude
// Haiku with the current stop list, validate the response is a true
// permutation of the input IDs, and return the same shape the local parser
// would have. The diff preview on the client is the safety net — we never
// auto-apply.

import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-haiku-4-5-20251001'
const EXAMPLES = [
  'make 5 after 2',
  'all Canton to the end',
  'group Massillon stops',
  'Cutlip after Ulrich',
  'reverse last 5',
]

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })

  const { command, stops } = req.body || {}
  if (typeof command !== 'string' || !command.trim()) {
    return res.status(400).json({ error: 'command is required', examples: EXAMPLES })
  }
  if (!Array.isArray(stops) || stops.length < 2) {
    return res.status(400).json({ error: 'stops array is required', examples: EXAMPLES })
  }
  // Reject anything that looks like prompt-injection bait. Driver commands are
  // short by nature; if it's huge, drop it before paying for an inference.
  if (command.length > 400) {
    return res.status(400).json({ error: 'Command too long', examples: EXAMPLES })
  }

  // Build a compact numbered list for the model. Strip everything we don't
  // need to keep token cost low and reduce the chance of the model hallucinating
  // fields back at us.
  const stopList = stops.map((s, i) => {
    const id = String(s.id || s.order_id)
    const addr = s.address || ''
    const city = s.city || ''
    const name = s.patient_name || ''
    const cold = s.cold_chain ? ' [COLD]' : ''
    return `${i + 1}. id=${id} | ${addr} | ${city} | ${name}${cold}`
  }).join('\n')

  const inputIds = new Set(stops.map(s => String(s.id || s.order_id)))

  const system = `You reorder a delivery driver's route based on a short command.
Return ONLY valid JSON, no prose, no markdown.

Schema (success):
{ "newOrder": ["<id>", "<id>", ...], "summary": "<one short sentence>" }

Schema (cannot honor):
{ "error": "<short reason>" }

Rules:
- newOrder MUST be a permutation of the provided ids — same length, same set, no duplicates, no foreign ids.
- Preserve relative order of stops the driver did not reference.
- "next" / "now" / "first" mean position 1 (or position 2 if there is an in-progress next stop — assume not unless told).
- "end" / "last" / "after my route" means the final position.
- "Canton" / "Akron" etc refer to all stops whose city matches.
- Patient-name or address fragments refer to the matching stop. If ambiguous, use the first match.
- If the command is unrelated to reordering (delivery status, navigation, notes, questions), return an error.`

  const user = `Current route:
${stopList}

Driver said: "${command.trim()}"

Return JSON only.`

  try {
    const client = new Anthropic({ apiKey })
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
    })

    // Extract text content. The SDK returns a content array.
    const text = (resp.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()

    // The model may wrap JSON in code fences despite the instruction — strip them.
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()

    let parsed
    try { parsed = JSON.parse(cleaned) }
    catch { return res.status(200).json({ error: 'Model did not return valid JSON', examples: EXAMPLES }) }

    if (parsed && typeof parsed.error === 'string') {
      return res.status(200).json({ error: parsed.error, examples: EXAMPLES })
    }

    const newOrder = Array.isArray(parsed?.newOrder) ? parsed.newOrder.map(String) : null
    if (!newOrder) return res.status(200).json({ error: 'No newOrder returned', examples: EXAMPLES })

    // Validate: same length, same set, no dupes, no foreign ids.
    if (newOrder.length !== stops.length) {
      return res.status(200).json({ error: 'Length mismatch in proposed order', examples: EXAMPLES })
    }
    const newSet = new Set(newOrder)
    if (newSet.size !== newOrder.length) {
      return res.status(200).json({ error: 'Duplicate ids in proposed order', examples: EXAMPLES })
    }
    for (const id of newOrder) {
      if (!inputIds.has(id)) {
        return res.status(200).json({ error: 'Unknown id in proposed order', examples: EXAMPLES })
      }
    }

    // Build the moves diff so the client doesn't have to.
    const byId = new Map()
    stops.forEach((s, i) => byId.set(String(s.id || s.order_id), { ...s, _oldPos: i + 1 }))
    const moves = []
    newOrder.forEach((id, newIdx) => {
      const s = byId.get(id)
      const newPos = newIdx + 1
      if (s && s._oldPos !== newPos) {
        const labelParts = []
        if (s.patient_name) labelParts.push(s.patient_name)
        if (s.city) labelParts.push(s.city)
        moves.push({ id, from: s._oldPos, to: newPos, label: labelParts.join(' · ') })
      }
    })

    if (moves.length === 0) {
      return res.status(200).json({ error: 'Command would not change the route', examples: EXAMPLES })
    }

    return res.status(200).json({
      newOrder,
      moves,
      summary: typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : 'Reorder',
      source: 'llm',
    })
  } catch (e) {
    return res.status(200).json({ error: e.message || 'AI request failed', examples: EXAMPLES })
  }
}
