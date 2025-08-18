// /api/flights
// Accepts GET (recommended) or POST with:
// origin, destination, depart, ret (optional), adults, cabin

const allowCORS = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

export default async function handler(req, res) {
  allowCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const params = req.method === 'GET'
      ? req.query
      : (JSON.parse(req.body || '{}'));

    const {
      origin,
      destination,
      depart,
      ret = '',
      adults = 1,
      cabin = 'ECONOMY'
    } = params;

    if (!origin || !destination || !depart) {
      return res.status(400).json({ ok: false, error: 'Missing origin/destination/depart' });
    }

    const base =
      (process.env.AMADEUS_ENV || 'test') === 'production'
        ? 'https://api.amadeus.com'
        : 'https://test.api.amadeus.com';

    // 1) OAuth token
    const tokenResp = await fetch(`${base}/v1/security/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.AMADEUS_CLIENT_ID,
        client_secret: process.env.AMADEUS_CLIENT_SECRET
      }).toString()
    });

    const tokenJson = await tokenResp.json();
    const token = tokenJson.access_token;
    if (!token) {
      return res.status(502).json({ ok: false, error: 'Amadeus auth failed', details: tokenJson });
    }

    // 2) Flight offers
    const url = new URL(`${base}/v2/shopping/flight-offers`);
    url.search = new URLSearchParams({
      originLocationCode: String(origin).toUpperCase(),
      destinationLocationCode: String(destination).toUpperCase(),
      departureDate: depart,                 // YYYY-MM-DD
      ...(ret ? { returnDate: ret } : {}),
      adults: String(adults),
      travelClass: String(cabin).toUpperCase(), // ECONOMY | PREMIUM_ECONOMY | BUSINESS | FIRST
      currencyCode: 'USD',
      nonStop: 'false',
      max: '20'
    }).toString();

    const offersResp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await offersResp.json();

    // Find the cheapest total price
    const minPrice = Array.isArray(data?.data)
      ? data.data.reduce((min, o) => Math.min(min, Number(o?.price?.total || Infinity)), Infinity)
      : null;

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=60');
    res.status(200).json({
      ok: true,
      minPrice: isFinite(minPrice) ? Number(minPrice) : null,
      sample: Array.isArray(data?.data) ? data.data[0] : null // helpful while testing
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Unknown error' });
  }
}
