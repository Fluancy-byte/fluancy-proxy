// api/flights.js
import fetch from 'node-fetch';

const HOST = process.env.AMADEUS_HOST || 'https://test.api.amadeus.com';

const ALLOW_ORIGINS = [
  'https://fluancy.com',
  'https://www.fluancy.com',
  'http://localhost:3000',
];

function setCors(res, origin) {
  if (ALLOW_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

  const json = await resp.json();
  if (!json.access_token) throw new Error('Token request failed');
  return json.access_token;
}

function mapAmadeusToLight(offers) {
  return offers.map(o => ({
    price: o.price.total,
    airline: o.validatingAirlineCodes?.[0],
    departure: o.itineraries?.[0]?.segments?.[0]?.departure,
    arrival: o.itineraries?.[0]?.segments?.slice(-1)?.[0]?.arrival,
  }));
}

export default async function handler(req, res) {
  setCors(res, req.headers.origin || '');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { from, to, depart, return: ret } = req.query;

    if (!from || !to || !depart || !ret) {
      return res.status(400).json({ error: 'Missing required query parameters: from, to, depart, return' });
    }

    const token = await getToken();

    const flightResp = await fetch(`${HOST}/v2/shopping/flight-offers?originLocationCode=${from}&destinationLocationCode=${to}&departureDate=${depart}&returnDate=${ret}&adults=1&max=5`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await flightResp.json();
    const flights = mapAmadeusToLight(data.data || []);
    return res.status(200).json({ flights });
  } catch (err) {
    console.error('Flight fetch error:', err);
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
}
