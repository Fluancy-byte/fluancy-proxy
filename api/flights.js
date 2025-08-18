// Amadeus Flight Offers proxy (ESM)
const HOST = process.env.AMADEUS_HOST || 'https://test.api.amadeus.com';

const ALLOW_ORIGINS = [
  'https://fluancy.com',
  'https://www.fluancy.com',
  'http://localhost:3000', // remove if not needed
];

function setCors(res, reqOrigin = '') {
  const origin = ALLOW_ORIGINS.includes(reqOrigin) ? reqOrigin : ALLOW_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
}

async function safeJson(resp) {
  const text = await resp.text();
  try { return JSON.parse(text); } catch { return { _raw: text }; }
}

async function getToken() {
  const id = process.env.AMADEUS_CLIENT_ID;
  const secret = process.env.AMADEUS_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Missing AMADEUS_CLIENT_ID or AMADEUS_CLIENT_SECRET');

  const resp = await fetch(`${HOST}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: id,
      client_secret: secret,
    }),
  });

  if (!resp.ok) {
    const body = await safeJson(resp);
    throw new Error(`Amadeus token error ${resp.status}: ${JSON.stringify(body)}`);
  }

  const j = await resp.json();
  if (!j?.access_token) throw new Error('Amadeus token missing access_token');
  return j.access_token;
}

function mapAmadeusToLight(offers) {
  return offers.map((o) => ({
    price: { total: o.price?.grandTotal || o.price?.total || null },
    validatingAirlineCodes: o.validatingAirlineCodes || [],
    itineraries: (o.itineraries || []).map((it) => ({
      duration: it.duration || '',
      segments: (it.segments || []).map((s) => ({
        carrierCode: s.carrierCode,
        number: s.number,
        departure: s.departure,
        arrival: s.arrival,
      })),
    })),
  }));
}

export default async function handler(req, res) {
  setCors(res, req.headers.origin || '');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { origin, destination, depart, ret, adults = '1', cabin = 'ECONOMY' } = req.query || {};

    if (!origin || !destination || !depart || !ret) {
      return res.status(400).json({ error: 'Missing required query params (origin, destination, depart, ret)' });
    }
    if (!/^[A-Za-z]{3}$/.test(String(origin)) || !/^[A-Za-z]{3}$/.test(String(destination))) {
      return res.status(400).json({ error: 'Invalid IATA codes' });
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
      nonStop: 'false',
    }).toString();

    const upstream = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });

    if (!upstream.ok) {
      const body = await safeJson(upstream);
      console.error('Amadeus API error', upstream.status, body);
      return res.status(upstream.status).json({ error: 'Amadeus API error', detail: body });
    }

    const raw = await safeJson(upstream);
    const offers = Array.isArray(raw?.data) ? raw.data : [];
    const trimmed = mapAmadeusToLight(offers);

    return res.status(200).json({ offers: trimmed });
  } catch (err) {
    console.error('Proxy failed:', err);
    return res.status(500).json({ error: 'Proxy failed', detail: String(err.message || err) });
  }
}
