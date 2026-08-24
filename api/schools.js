module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const suppliedKey = req.headers['x-map-key'];
  const expectedKey = process.env.MAP_ACCESS_TOKEN;

  if (!expectedKey || suppliedKey !== expectedKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Server configuration is incomplete' });
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/schools?select=school_district,state,city,address,zip,member,contacted,status,latitude,longitude&latitude=not.is.null&longitude=not.is.null&order=state.asc,school_district.asc`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          Accept: 'application/json'
        }
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      console.error('Supabase schools read failed:', response.status, detail);
      return res.status(502).json({ error: 'Unable to load map data' });
    }

    const rows = await response.json();
    return res.status(200).json(rows);
  } catch (error) {
    console.error('Schools API error:', error);
    return res.status(500).json({ error: 'Unable to load map data' });
  }
};