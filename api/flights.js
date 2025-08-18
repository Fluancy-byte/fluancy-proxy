/**
 * Serverless proxy for Amadeus Flight Offers.
 * Vercel env vars required:
 *  - AMADEUS_CLIENT_ID
 *  - AMADEUS_CLIENT_SECRET
 * Optional:
 *  - AMADEUS_HOST (default: https://test.api.amadeus.com)
 */

const HOST = process.env.AMADEUS_HOST || 'https://test.api.amadeus.com';

// --- CORS: set your exact site origins here ---
const ALLOW_ORIGINS = [
  'https://fluancy.com',
  'https://www.fluancy.com',
  'http://localhost:3000',   // dev convenience; remove if not needed
];

function setCors(res, reqOrigin = '') {
  const origin = ALLOW_ORIGINS.includes(reqOrigin) ? reqOrigin : ALLOW_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

async function getToken() {
  const id = process.env.AMADEUS_CLIENT_ID;
  const secret = process.env.AMADEUS_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Missing AMADEUS_CLIENT_ID or AMADEUS_CLIENT_SECRET');

  const r = await fetch(`${HOST}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: id,
      client_secret: secret,
    }),
  });
  if (!r.ok) throw new Error(`Amadeus token error: ${await r.text()}`);
  const j = await r.json();
  return j.access_token;
}

function mapAmadeusToLight(offers) {
  // Trim to what the frontend needs
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
  // Set CORS on every response
  setCors(res, req.headers.origin || '');

  // Handle preflight quickly
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      origin,
      destination,
      depart,
      ret,
      adults = '1',
      cabin = 'ECONOMY',
    } = req.query || {};

    if (!origin || !destination || !depart || !ret) {
      return res
        .status(400)
        .json({ error: 'Missing required query params (origin, destination, depart, ret)' });
    }

    // (Optional) light server-side validation
    if (!/^[A-Za-z]{3}$/.test(origin) || !/^[A-Za-z]{3}$/.test(destination)) {
      return res.status(400).json({ error: 'Invalid IATA codes' });
    }

    const token = await getToken();

    const url = new URL(`${HOST}/v2/shopping/flight-offers`);
    url.search = new
