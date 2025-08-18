export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { origin, destination, departureDate, returnDate } = req.query;

  if (!origin || !destination || !departureDate) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const tokenRes = await fetch('https://test.api.amadeus.com/v1/security/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.AMADEUS_API_KEY,
        client_secret: process.env.AMADEUS_API_SECRET
      })
    });

    const { access_token } = await tokenRes.json();

    const flightsRes = await fetch(
      `https://test.api.amadeus.com/v2/shopping/flight-offers?originLocationCode=${origin}&destinationLocationCode=${destination}&departureDate=${departureDate}${returnDate ? `&returnDate=${returnDate}` : ''}&adults=1&currencyCode=USD&max=3`,
      {
        headers: { Authorization: `Bearer ${access_token}` }
      }
    );

    const data = await flightsRes.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch flights', details: err.message });
  }
}
