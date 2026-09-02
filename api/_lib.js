// FLINT — petites aides partagées entre les fonctions api/*.js.
// Factorisé depuis scan-meal.js (CORS, rate-limit par identité, secret d'app)
// au moment où coach-start.js/coach-continue.js en ont eu besoin aussi.

function cors(res, extraHeaders) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-flint-key, x-flint-device' + (extraHeaders ? ', ' + extraHeaders : ''));
}

// Rate-limit best-effort en mémoire (par identité, fenêtre glissante). Se
// réinitialise au cold start — cohérent avec scan-meal.js, pas un SLA.
const RL = new Map();
const RL_WINDOW = 60000;
function rateLimited(id, max) {
  const now = Date.now();
  const arr = (RL.get(id) || []).filter(t => now - t < RL_WINDOW);
  arr.push(now);
  RL.set(id, arr);
  if (RL.size > 5000) { for (const k of RL.keys()) { if (!(RL.get(k) || []).some(t => now - t < RL_WINDOW)) RL.delete(k); } }
  return arr.length > max;
}

// L'identité de rate-limit : le device anonyme si présent (plus juste que
// l'IP — plusieurs utilisateurs derrière un même NAT ne se gênent plus),
// sinon l'IP en repli.
function identiteRequete(req) {
  const dev = (req.headers['x-flint-device'] || '').toString().trim();
  if (dev) return 'dev:' + dev.slice(0, 128);
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  return 'ip:' + ip;
}

function verifierSecret(req, res) {
  const secret = process.env.FLINT_APP_SECRET;
  if (secret && req.headers['x-flint-key'] !== secret) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

function corpsJSON(req) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  return body && typeof body === 'object' ? body : {};
}

module.exports = { cors, rateLimited, identiteRequete, verifierSecret, corpsJSON };
