// Z-CHAT — Indicatore digitazione
const { getStore } = require('@netlify/blobs');
const { requireAuth, normalizeHandle, makeConvId, jsonResponse, connectLambda } = require('./_zchat');

const TYPING_TTL_MS = 5000;

exports.handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});

  const auth = await requireAuth(event);
  if (auth.error) return auth.error;
  const { account } = auth;
  if (!account.zchatHandle) return jsonResponse(400, { error: 'Handle mancante.' });

  const myHandle = normalizeHandle(account.zchatHandle);
  const store = getStore('zchat-typing');

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch (e) { return jsonResponse(400, { error: 'JSON non valido.' }); }

    const toHandle = normalizeHandle(body.toHandle);
    const typing = !!body.typing;
    const convId = makeConvId(myHandle, toHandle);
    const key = `typing:${convId}:${myHandle}`;

    if (typing) {
      await store.setJSON(key, { handle: myHandle, convId, at: new Date().toISOString() });
    } else {
      await store.delete(key);
    }
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod === 'GET') {
    const convId = event.queryStringParameters?.convId || '';
    if (!convId) return jsonResponse(400, { error: 'convId mancante.' });

    const { blobs } = await store.list({ prefix: `typing:${convId}:` });
    const now = Date.now();
    const typing = [];

    for (const blob of blobs) {
      const t = await store.get(blob.key, { type: 'json' });
      if (!t || t.handle === myHandle) continue;
      if (now - new Date(t.at).getTime() < TYPING_TTL_MS) {
        typing.push(t.handle);
      } else {
        await store.delete(blob.key);
      }
    }

    return jsonResponse(200, { typing });
  }

  return jsonResponse(405, { error: 'Metodo non permesso.' });
};
