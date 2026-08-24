const crypto = require('crypto');

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
    return res.status(405).send('Method not allowed');
  }

  const supplied = req.query && req.query.token;
  const expected = process.env.MAP_ACCESS_TOKEN;

  if (!expected || !safeEqual(supplied, expected)) {
    return res.status(401).send('Unauthorized');
  }

  const isProduction = process.env.VERCEL_ENV === 'production';
  const cookie = [
    `k12_map_session=${encodeURIComponent(expected)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    isProduction ? 'Secure' : '',
    'Max-Age=2592000'
  ].filter(Boolean).join('; ');

  res.setHeader('Set-Cookie', cookie);
  return res.redirect(302, '/secure.html');
};