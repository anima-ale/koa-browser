const crypto = require('crypto');

const SECRET = process.env.ZEN_SECRET || 'zen-lab-dev-secret-CAMBIAMI-su-vercel';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(input) {
  input = input.replace(/-/g, '+').replace(/_/g, '/');
  while (input.length % 4) input += '=';
  return Buffer.from(input, 'base64').toString('utf8');
}

function createToken(payload) {
  const body = { ...payload, exp: Date.now() + TOKEN_TTL_MS };
  const encoded = base64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', SECRET).update(encoded).digest('hex');
  return `${encoded}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', SECRET).update(encoded).digest('hex');
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

function getTokenFromReq(req) {
  const auth = req.headers?.authorization || req.headers?.Authorization || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function send(res, statusCode, data) {
  res.status(statusCode).json(data);
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS'
  };
}

module.exports = { createToken, verifyToken, getTokenFromEvent, getTokenFromReq, jsonResponse, send, corsHeaders };
