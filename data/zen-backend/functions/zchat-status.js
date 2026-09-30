// Z-CHAT — Stati (stories)
const { requireAuth, normalizeHandle, getHandleIndex, setHandleIndex, jsonResponse, connectLambda } = require('./_zchat');

exports.handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});

  if (event.httpMethod === 'GET') {
    const handle = normalizeHandle(event.queryStringParameters?.handle || '');
    if (!handle) return jsonResponse(400, { error: 'handle mancante.' });
    const entry = await getHandleIndex(handle);
    if (!entry) return jsonResponse(404, { error: 'Utente non trovato.' });
    return jsonResponse(200, { status: entry.status || null });
  }

  if (event.httpMethod === 'POST') {
    const auth = await requireAuth(event);
    if (auth.error) return auth.error;
    const { account, store, key } = auth;
    if (!account.zchatHandle) return jsonResponse(400, { error: 'Handle mancante.' });

    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch (e) { return jsonResponse(400, { error: 'JSON non valido.' }); }

    const status = {
      text: (body.text || '').slice(0, 200),
      mediaUrl: body.mediaUrl || null,
      mediaType: body.mediaType || 'text',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };

    const handle = normalizeHandle(account.zchatHandle);
    const entry = await getHandleIndex(handle);
    if (entry) {
      entry.status = status;
      await setHandleIndex(handle, entry);
    }

    const updated = { ...account, zchatStatus: status };
    await store.setJSON(key, updated);
    const { passwordHash: _o, ...safe } = updated;
    return jsonResponse(200, { status, account: safe });
  }

  return jsonResponse(405, { error: 'Metodo non permesso.' });
};
