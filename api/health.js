// ESM health check
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    ok: true,
    node: process.version,
    env: {
      AMADEUS_CLIENT_ID: Boolean(process.env.AMADEUS_CLIENT_ID),
      AMADEUS_CLIENT_SECRET: Boolean(process.env.AMADEUS_CLIENT_SECRET),
      AMADEUS_HOST: process.env.AMADEUS_HOST || 'https://test.api.amadeus.com',
    },
    now: new Date().toISOString(),
  });
}
