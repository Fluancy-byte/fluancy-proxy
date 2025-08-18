// /api/flights.js
export default async function handler(req, res) {
  try {
    const {
      origin = '',
      destination = '',
      depart = '',
      ret = '',
      adults = '1',
      cabin = 'ECONOMY'
    } = req.query;

    // Validate minimal input
    if (!origin || !destination || !depart) {
      return res.status(400).json({ error: 'Missing origin/destination/depart' });
    }

    // ---> 1) Get Amadeus OAuth token
    const tokenRes = await fetch('https://test.api.amadeus.com/v1/security/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.AMADEUS_API_KEY,
        client_secret: process.env.AMADEUS_API_SECRET
      })
    });

    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      return res.status(500).json({ error: 'Amadeus token error', detail: t });
    }

    const { access_token } = await tokenRes.json();

    // ---> 2) Search flight offers
    // NOTE: max=50 lets us get a decent set then we trim.
    const searchUrl = new URL('https://test.api.amadeus.com/v2/shopping/flight-offers');
    const params = {
      originLocationCode: origin.toUpperCase(),
      destinationLocationCode: destination.toUpperCase(),
      departureDate: depart,                // YYYY-MM-DD
      adults: String(Math.max(1, Number(adults || 1))),
      travelClass: cabin.toUpperCase(),     // ECONOMY | PREMIUM_ECONOMY | BUSINESS | FIRST
      currencyCode: 'USD',
      nonStop: 'false',
      max: '50'
    };
    if (ret) params.returnDate = ret;       // add when round-trip

    Object.entries(params).forEach(([k, v]) => searchUrl.searchParams.set(k, v));

    const offerRes = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    if (!offerRes.ok) {
      const t = await offerRes.text();
      return res.status(502).json({ error: 'Amadeus offers error', detail: t });
    }

    const json = await offerRes.json();

    // Amadeus returns { data: [ ...offers ], dictionaries: {...} }
    const offers = Array.isArray(json.data) ? json.data : [];

    // Return a simple envelope the front-end understands (it also accepts array root)
    return res.status(200).json({ offers: offers.slice(0, 8) });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error', detail: String(err) });
  }
}
