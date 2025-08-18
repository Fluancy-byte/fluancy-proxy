/**
 * Serverless proxy for Amadeus Flight Offers.
 * Required Vercel env vars:
 *  - AMADEUS_CLIENT_ID
 *  - AMADEUS_CLIENT_SECRET
 * Optional:
 *  - AMADEUS_HOST (default: https://test.api.amadeus.com)
 */
const HOST = process.env.AMADEUS_HOST || 'https://test.api.amadeus.com';

async function getToken() {
  const id = process.env.AMADEUS_CLIENT_ID;
  const secret = process.env.AMADEUS_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error('Missing AMADEUS_CLIENT_ID or AMADEUS_CLIENT_SECRET');
  }
  const r = await fetch(`${HOST}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: id,
      client_secret: secret
    })
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Amadeus token error: ${t}`);
  }
  const j = await r.json();
  return j.access_token;
}

function mapAmadeusToLight(offers) {
  // Return a trimmed list the front-end knows how to render
  return offers.map(o => ({
    price: {
      total: o.price?.grandTotal || o.price?.total || null
    },
    validatingAirlineCodes: o.validatingAirlineCodes || [],
    itineraries: (o.itineraries || []).map(it => ({
      duration: it.duration || '',
      segments: (it.segments || []).map(s => ({
        carrierCode: s.carrierCode,
        number: s.number,
        departure: s.departure,
        arrival: s.arrival,
      }))
    }))
  }));
}

export default async function handler(req, res) {
  try {
    const { origin, destination, depart, ret, adults = '1', cabin = 'ECONOMY' } = req.query || {};

    if (!origin || !destination || !depart || !ret) {
      return res.status(400).json({ error: 'Missing required query params (origin, destination, depart, ret)' });
    }

    const token = await getToken();

    const url = new URL(`${HOST}/v2/shopping/flight-offers`);
    url.search = new URLSearchParams({
      originLocationCode: String(origin).toUpperCase(),
      destinationLocationCode: String(destination).toUpperCase(),
      departureDate: depart,
      returnDate: ret,
      adults: String(Math.max(1, Number(adults || 1))),
      travelClass: String(cabin || 'ECONOMY').toUpperCase(),
      currencyCode: 'USD',
      max: '20',
      nonStop: 'false'
    }).toString();

    const r = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(r.status).json({ error: 'Amadeus API error', detail: t });
    }

    const raw = await r.json();
    const offers = Array.isArray(raw?.data) ? raw.data : [];
    const trimmed = mapAmadeusToLight(offers);

    return res.status(200).json({ offers: trimmed });
  } catch (err) {
    return res.status(500).json({ error: 'Proxy failed', detail: String(err.message || err) });
  }
}
