const crypto = require('crypto');

function parseCookies(header = '') {
  return header.split(';').reduce((acc, part) => {
    const i = part.indexOf('=');
    if (i === -1) return acc;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a || ''));
  const bBuf = Buffer.from(String(b || ''));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cookies = parseCookies(req.headers.cookie || '');
  const suppliedKey = cookies.k12_map_session;
  const expectedKey = process.env.MAP_ACCESS_TOKEN;

  if (!expectedKey || !safeEqual(suppliedKey, expectedKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Server configuration is incomplete' });
  }

  try {
    const pageSize = 1000;
    let offset = 0;
    const rows = [];

    while (true) {
      const url = `${supabaseUrl}/rest/v1/schools?select=school_district,state,city,address,zip,member,contacted,status,latitude,longitude&latitude=not.is.null&longitude=not.is.null&order=state.asc,school_district.asc&limit=${pageSize}&offset=${offset}`;

      const response = await fetch(url, {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          Accept: 'application/json'
        }
      });

      if (!response.ok) {
        const detail = await response.text();
        console.error('Supabase schools read failed:', response.status, detail);
        return res.status(502).json({ error: 'Unable to load map data' });
      }

      const page = await response.json();
      rows.push(...page);

      if (page.length < pageSize) break;
      offset += pageSize;
    }

    return res.status(200).json(rows);
  } catch (error) {
    console.error('Schools API error:', error);
    return res.status(500).json({ error: 'Unable to load map data' });
  }
};