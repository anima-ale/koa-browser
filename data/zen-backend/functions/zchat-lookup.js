// ══════════════════════════════════════════════════════
// Z-CHAT — Lookup profilo pubblico da @handle
// GET ?handle=xxx
// ══════════════════════════════════════════════════════
const {
  normalizeHandle, validateHandle, getHandleIndex, getAccountByUsername,
  publicProfile, jsonResponse, connectLambda
} = require('./_zchat');

exports.handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});
  if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'Metodo non permesso.' });

  const handle = normalizeHandle(event.queryStringParameters?.handle || '');
  if (!handle) return jsonResponse(400, { error: 'Parametro handle mancante.' });
  const err = validateHandle(handle);
  if (err) return jsonResponse(400, { error: err });

  const entry = await getHandleIndex(handle);
  if (!entry) return jsonResponse(404, { error: 'Utente non trovato.' });

  const acc = await getAccountByUsername(entry.username);
  const profile = publicProfile({ ...entry, handle });
  if (acc?.zchatE2ePublicKey) profile.e2ePublicKey = acc.zchatE2ePublicKey;
  if (acc?.zchatStatus) profile.status = acc.zchatStatus;

  return jsonResponse(200, { profile });
};
