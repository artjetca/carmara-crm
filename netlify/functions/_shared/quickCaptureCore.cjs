/**
 * Hands-free quick capture: work out which customer a dictated note belongs
 * to when the salesperson is driving and cannot look at the screen.
 *
 * Two independent signals are combined:
 *   - where the phone was when the note was recorded (GPS)
 *   - the customer name the salesperson said out loud
 *
 * Agreeing signals give a confident match. Disagreeing or weak signals leave
 * the note unassigned rather than filing it under the wrong client: a note in
 * the wrong customer's history is worse than one waiting to be sorted out.
 */

const { matchRouteCustomer } = require('./visitNotesCore.cjs')

/** Metres between two coordinates (haversine). */
function distanceMeters(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY
  const toRad = value => (Number(value) * Math.PI) / 180
  const earthRadius = 6371000

  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * earthRadius * Math.asin(Math.sqrt(h))
}

function hasCoordinates(customer) {
  return (
    customer &&
    Number.isFinite(Number(customer.latitude)) &&
    Number.isFinite(Number(customer.longitude))
  )
}

// Driving away from a shop, the phone is usually within a couple of hundred
// metres. Beyond ~500 m we stop treating proximity as evidence.
const NEAR_METERS = 150
const PLAUSIBLE_METERS = 500

/**
 * Closest customers to a point, nearest first.
 */
function customersByProximity(coords, customers, limit = 5) {
  if (!coords || !Array.isArray(customers)) return []

  return customers
    .filter(hasCoordinates)
    .map(customer => ({
      customer,
      meters: distanceMeters(coords, {
        lat: Number(customer.latitude),
        lng: Number(customer.longitude),
      }),
    }))
    .filter(entry => Number.isFinite(entry.meters))
    .sort((a, b) => a.meters - b.meters)
    .slice(0, limit)
}

/**
 * Decide which customer the note belongs to.
 *
 * Returns the customer plus how we got there, so the review screen can show
 * the salesperson why this client was chosen.
 */
function resolveCaptureCustomer({ coords, spokenName, customers }) {
  const nearby = customersByProximity(coords, customers)
  const nearest = nearby[0] || null
  const spokenMatch = spokenName ? matchRouteCustomer(spokenName, customers) : null

  const nearbyNames = nearby.map(entry => ({
    id: entry.customer.id,
    name: entry.customer.name,
    meters: Math.round(entry.meters),
  }))

  // Both signals agree: the strongest evidence we can get.
  if (spokenMatch && nearest && nearest.customer.id === spokenMatch.id && nearest.meters <= PLAUSIBLE_METERS) {
    return {
      customer: spokenMatch,
      method: 'voice+gps',
      confidence: 'high',
      meters: Math.round(nearest.meters),
      nearby: nearbyNames,
    }
  }

  // The salesperson named a real customer. Trust the name: they know where
  // they were, and GPS may be stale or the address may be geocoded roughly.
  if (spokenMatch) {
    // Confidence must reflect how close we are to the customer they NAMED,
    // not to whichever shop happens to be nearest. Standing next to a
    // different client is exactly the case that needs a second look.
    const spokenEntry = nearby.find(entry => entry.customer.id === spokenMatch.id)
    const spokenMeters =
      spokenEntry
        ? spokenEntry.meters
        : hasCoordinates(spokenMatch) && coords
          ? distanceMeters(coords, {
              lat: Number(spokenMatch.latitude),
              lng: Number(spokenMatch.longitude),
            })
          : null

    return {
      customer: spokenMatch,
      method: 'voice',
      confidence:
        spokenMeters !== null && spokenMeters <= PLAUSIBLE_METERS ? 'medium' : 'low',
      meters: spokenMeters !== null ? Math.round(spokenMeters) : null,
      nearby: nearbyNames,
    }
  }

  // No usable name, but we are parked right on top of exactly one customer.
  if (nearest && nearest.meters <= NEAR_METERS) {
    const second = nearby[1]
    // Two shops in the same building would make this a coin flip.
    const isolated = !second || second.meters > NEAR_METERS * 2
    if (isolated) {
      return {
        customer: nearest.customer,
        method: 'gps',
        confidence: 'medium',
        meters: Math.round(nearest.meters),
        nearby: nearbyNames,
      }
    }
  }

  return {
    customer: null,
    method: 'none',
    confidence: 'none',
    meters: nearest ? Math.round(nearest.meters) : null,
    nearby: nearbyNames,
  }
}

/**
 * Strip the leading "acabo de salir de X" style phrase so the summary reads
 * as a note, not as an instruction to the app.
 */
const LEAD_IN_PATTERNS = [
  /^\s*(acabo de salir de|vengo de|he estado en|estuve en|salgo de|visita a|visitando)\s+/i,
  /^\s*(剛|剛剛|剛從|拜訪完|離開)\s*/,
]

function stripLeadIn(text) {
  let result = String(text || '').trim()
  for (const pattern of LEAD_IN_PATTERNS) {
    result = result.replace(pattern, '')
  }
  return result.trim()
}

module.exports = {
  distanceMeters,
  customersByProximity,
  resolveCaptureCustomer,
  stripLeadIn,
  NEAR_METERS,
  PLAUSIBLE_METERS,
}
