// server.js
const http = require('http');
const https = require('https');
const url = require('url');

const {
  AMADEUS_API_KEY,
  AMADEUS_API_SECRET,
  AMADEUS_ENV = 'test',
} = process.env;

const AM_BASE =
  AMADEUS_ENV === 'production'
    ? 'https://api.amadeus.com'
    : 'https://test.api.amadeus.com';

let cachedToken = null;
let tokenExpiry = 0;

// Fetch and cache OAuth token
async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry - 30_000) return cachedToken;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: AMADEUS_API_KEY,
    client_secret: AMADEUS_API_SECRET,
  }).toString();

  const res = await fetch(AM_BASE + '/v1/security/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token error: ${res.status} ${err}`);
  }
  const json = await res.json();
  cachedToken = json.access_token;
  tokenExpiry = Date.now() + json.expires_in * 1000;
  return cachedToken;
}

// Simple helper
function send(res, code, data, headers = {}) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    ...headers,
  });
  res.end(payload);
}

// Minimal fetch using Node 18+ global fetch
async function proxyFlightOffers(query) {
  const token = await getAccessToken();
  const u = new URL(AM_BASE + '/v2/shopping/flight-offers');
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== '') u.searchParams.set(k, v);
  });

  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  if (!res.ok) throw { status: res.status, body: json };
  return json;
}

// Router
const server = http.createServer(async (req, res) => {
  const { pathname, query } = url.parse(req.url, true);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  try {
    if (pathname === '/api/health') {
      return send(res, 200, { ok: true, env: AMADEUS_ENV });
    }

    if (pathname === '/api/flight-offers') {
      // Expect IATA + ISO dates
      // required: originLocationCode, destinationLocationCode, departureDate, adults
      // optional: returnDate, travelClass, currencyCode, nonStop, max
      if (!query.originLocationCode || !query.destinationLocationCode || !query.departureDate || !query.adults) {
        return send(res, 400, { error: 'Missing required parameters.' });
      }
      const data = await proxyFlightOffers(query);
      return send(res, 200, data);
    }

    // default
    return send(res, 404, { error: 'NOT_FOUND' });
  } catch (err) {
    const status = err?.status || 500;
    return send(res, status, { error: 'Proxy error', detail: err?.body || String(err) });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Proxy listening on', PORT));

export default server; // for Vercel Node runtime
