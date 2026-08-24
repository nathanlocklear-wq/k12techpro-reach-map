function asBool(value) {
  return ['true', 'yes', 'y', '1'].includes(String(value ?? '').trim().toLowerCase());
}

function normalizeState(value) {
  const v = String(value ?? '').trim();
  const states = {
    MO: 'Missouri', IL: 'Illinois', IN: 'Indiana', CA: 'California',
    NE: 'Nebraska', ND: 'North Dakota', PA: 'Pennsylvania'
  };
  return states[v.toUpperCase()] || v;
}

function norm(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '');
}

function deriveStatus(row) {
  const member = asBool(row.Member ?? row['Member Status']);
  const contacted = asBool(row.Contacted ?? row['Contacted Status']);
  const category = String(row['Map Category'] ?? row['Map Category (Automatic)'] ?? '').trim().toLowerCase();
  if (member || category === 'member') return 'Member';
  if (contacted || ['contacted', 'contacted - non member', 'contacted - non-member'].includes(category)) return 'Contacted';
  return 'Not on Pro';
}

function toNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapRow(row) {
  const state = normalizeState(row.State);
  const school = String(row['School/District'] ?? row.school_district ?? '').trim();
  const city = String(row.City ?? row.city ?? '').trim();
  const address = String(row.Address ?? row['Street Address'] ?? row.address ?? '').trim();
  const zip = String(row.ZIP ?? row.Zipcode ?? row.zip ?? '').trim();
  const latitude = toNumber(row.Latitude ?? row.latitude);
  const longitude = toNumber(row.Longitude ?? row.longitude);
  const status = deriveStatus(row);
  const member = status === 'Member';
  const contacted = status === 'Contacted' || member || asBool(row.Contacted ?? row['Contacted Status']);
  const sourceKey = `${state}|${norm(school)}|${norm(city)}|${norm(address)}`;

  if (!school || !state) return null;

  return {
    school_district: school,
    state,
    city: city || null,
    address: address || null,
    zip: zip || null,
    member,
    contacted,
    status,
    latitude,
    longitude,
    source_key: sourceKey
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const suppliedToken = req.headers['x-sync-token'];
  const expectedToken = process.env.SYNC_TOKEN;
  if (!expectedToken || suppliedToken !== expectedToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Server configuration is incomplete' });
  }

  const incoming = Array.isArray(req.body) ? req.body : req.body?.rows;
  if (!Array.isArray(incoming)) {
    return res.status(400).json({ error: 'Expected an array of rows' });
  }

  const deduped = new Map();
  for (const raw of incoming) {
    const row = mapRow(raw);
    if (!row) continue;
    const existing = deduped.get(row.source_key);
    if (!existing || (row.latitude !== null && existing.latitude === null) || (row.status === 'Member' && existing.status !== 'Member')) {
      deduped.set(row.source_key, row);
    }
  }

  const rows = [...deduped.values()];
  const chunkSize = 500;

  try {
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const response = await fetch(`${supabaseUrl}/rest/v1/schools?on_conflict=source_key`, {
        method: 'POST',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(chunk)
      });

      if (!response.ok) {
        const detail = await response.text();
        console.error('Supabase sync failed:', response.status, detail);
        return res.status(502).json({ error: 'Database sync failed', detail });
      }
    }

    return res.status(200).json({ ok: true, received: incoming.length, synced: rows.length });
  } catch (error) {
    console.error('Sync API error:', error);
    return res.status(500).json({ error: 'Sync failed' });
  }
};