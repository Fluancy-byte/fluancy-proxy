// /api/flights.js
export const config = { runtime: 'edge' };

const AM_ENV = (process.env.AMADEUS_ENV || 'test').toLowerCase();
const BASE   = AM_ENV === 'production'
  ? 'https://api.amadeus.com'
  : 'https://test.api.amadeus.com';

async function getToken() {
  const id  = process.env.AMADEUS_CLIENT_ID;
  const sec = process.env.AMADEUS_CLIENT_SECRET;
  if (!id || !sec) {
    return { error: 'Missing AMADEUS_CLIENT_ID/AMADEUS_CLIENT_SECRET in env' };
  }

  const res = await fetch(`${BASE}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: id,
      client_secret: sec
    })
  });

  if (!res.ok) {
    const msg = await res.text();
    return { error: 'Amadeus token error', detail: msg };
  }
  return res.json();
}

function toISO(d) {
  // allow YYYY-MM-DD, or something date-like; Amadeus expects YYYY-MM-DD
  if (!d) return '';
  return String(d).slice(0, 10);
}

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const origin = (searchParams.get('origin') || '').trim().toUpperCase();
    const destination = (searchParams.get('destination') || '').trim().toUpperCase();
    const depart = toISO(searchParams.get('depart'));
    const ret    = toISO(searchParams.get('ret'));
    const adults = Math.max(1, Number(searchParams.get('adults') || '1'));
    const cabin  = (searchParams.get('cabin') || 'ECONOMY').toUpperCase();

    if (!origin || !destination || !depart || !ret) {
      return new Response(JSON.stringify({ error:'Missing required params' }), { status: 400 });
    }

    const token = await getToken();
    if (token.error) {
      return new Response(JSON.stringify(token), { status: 401 });
    }

    // Amadeus Flight Offers Search v2
    const qs = new URLSearchParams({
      originLocationCode: origin,
      destinationLocationCode: destination,
      departureDate: depart,
      returnDate: ret,
      adults: String(adults),
      travelClass: cabin,
      currencyCode: 'USD',
      max: '20'                   // get enough to choose top 3–4
    });

    const r = await fetch(`${BASE}/v2/shopping/flight-offers?${qs}`, {
      headers: { Authorization: `Bearer ${token.access_token}` }
    });

    const data = await r.json();
    if (!r.ok) {
      return new Response(JSON.stringify({ error:'Amadeus search error', detail: data }), { status: r.status });
    }

    // Map to a compact shape our front-end expects
    const offers = (data.data || []).map((o, idx) => {
      const price = Number(o.price?.grandTotal || o.price?.total || 0);
      const validating = (o.validatingAirlineCodes && o.validatingAirlineCodes[0]) || null;

      // Human-friendly out/back stops and durations
      const segsOut = o.itineraries?.[0]?.segments || [];
      const segsRet = o.itineraries?.[1]?.segments || [];

      const outStops = Math.max(0, segsOut.length - 1);
      const retStops = Math.max(0, segsRet.length - 1);
      const outDur   = o.itineraries?.[0]?.duration || '';
      const retDur   = o.itineraries?.[1]?.duration || '';

      return {
        id: String(idx + 1),
        airline: validating || 'Mixed carriers',
        price,
        outStops,
        retStops,
        outDuration: outDur.replace('PT','').toLowerCase(),  // e.g. 6H15M → 6h15m
        retDuration: retDur.replace('PT','').toLowerCase(),
      };
    }).filter(x => x.price > 0);

    // Sort by price low→high
    offers.sort((a,b)=>a.price - b.price);

    return new Response(JSON.stringify({ ok: true, offers }), {
      headers: { 'Content-Type':'application/json', 'Cache-Control':'no-store' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error:'Server error', detail: String(err) }), { status: 500 });
  }
}
