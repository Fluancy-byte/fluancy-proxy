import fetch from 'node-fetch';

const HOST = process.env.AMADEUS_HOST || 'https://test.api.amadeus.com';
const ALLOW_ORIGINS = [ 'https://fluancy.com', 'https://www.fluancy.com', 'http://localhost:3000' ];

function setCors(res, origin) {
  if (ALLOW_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function getToken() {
  const id = process.env.AMADEUS_CLIENT_ID;
  const secret = process.env.AMADEUS_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Missing AMADEUS_CLIENT_ID or AMADEUS_CLIENT_SECRET');

  const tokenResp = await fetch(`${HOST}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: id,
      client_secret: secret,
    }),
  });
  const json = await tokenResp.json();
  if (!json.access_token) throw new Error('Token request failed');
  return json.access_token;
}

export default async function handler(req, res) {
  setCors(res, req.headers.origin || '');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // accept either origin/destination/ret or from/to/return
    const origin = req.query.origin || req.query.from;
    const destination = req.query.destination || req.query.to;
    const depart = req.query.depart;
    const ret = req.query.ret || req.query.return;
    const adults = req.query.adults || '1';
    const cabin = (req.query.cabin || 'ECONOMY').toUpperCase();

    if (!origin || !destination || !depart || !ret) {
      return res.status(400).json({ error: 'Missing required query parameters: origin, destination, depart, ret' });
    }

    const token = await getToken();
    const response = await fetch(
      `${HOST}/v2/shopping/flight-offers?originLocationCode=${origin}&destinationLocationCode=${destination}&departureDate=${depart}&returnDate=${ret}&adults=${adults}&travelClass=${cabin}&max=10`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    const data = await response.json();
    const offers = data.data || [];
    // return offers in a property the page expects
    return res.status(200).json({ offers });
  } catch (err) {
    console.error('Flight fetch error:', err);
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
}
