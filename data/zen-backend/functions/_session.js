// ══════════════════════════════════════════════════════
// ZEN ACCOUNT — Gestione token di sessione (HMAC firmato)
// Nessuna libreria JWT esterna: usiamo crypto nativo di Node.
// ══════════════════════════════════════════════════════
const crypto = require('crypto');

// Segreto per firmare i token. In produzione va messo come Environment
// Variable su Netlify (Site settings → Environment variables → ZEN_SECRET).
// Se non è impostato, usiamo un fallback SOLO per non far crashare il primo
// deploy: cambia subito ZEN_SECRET su Netlify per una sicurezza reale.
const SECRET = process.env.ZEN_SECRET || 'zen-lab-dev-secret-CAMBIAMI-su-netlify';

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 giorni

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64urlDecode(input) {
  input = input.replace(/-/g, '+').replace(/_/g, '/');
  while (input.length % 4) input += '=';
  return Buffer.from(input, 'base64').toString('utf8');
}

// Crea un token: base64url(payload) + "." + firma HMAC-SHA256
function createToken(payload) {
  const body = { ...payload, exp: Date.now() + TOKEN_TTL_MS };
  const encoded = base64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', SECRET).update(encoded).digest('hex');
  return `${encoded}.${sig}`;
}

// Verifica un token e ritorna il payload, oppure null se non valido/scaduto
function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', SECRET).update(encoded).digest('hex');
  // Confronto a tempo costante per evitare timing attacks
  const a = Buffer.from(sig || '', 'hex');
  const b = Buffer.from(expectedSig, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(base64urlDecode(encoded));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// Estrae il token dall'header Authorization: "Bearer xxx"
function getTokenFromEvent(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS'
    },
    body: JSON.stringify(body)
  };
}

module.exports = { createToken, verifyToken, getTokenFromEvent, jsonResponse };
