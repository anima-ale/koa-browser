// ══════════════════════════════════════════════════════
// Z-CHAT — Gestione @handle pubblico
// GET  ?handle=xxx  → verifica disponibilità
// POST { handle } → riserva handle (auth)
// ══════════════════════════════════════════════════════
const {
  normalizeHandle, validateHandle, requireAuth,
  getHandleIndex, setHandleIndex, removeHandleIndex, jsonResponse, connectLambda
} = require('./_zchat');

exports.handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});

  if (event.httpMethod === 'GET') {
    const handle = normalizeHandle(event.queryStringParameters?.handle || '');
    if (!handle) return jsonResponse(400, { error: 'Parametro handle mancante.' });
    const err = validateHandle(handle);
    if (err) return jsonResponse(400, { error: err });
    const existing = await getHandleIndex(handle);
    return jsonResponse(200, { handle, available: !existing });
  }

  if (event.httpMethod === 'POST') {
    const auth = await requireAuth(event);
    if (auth.error) return auth.error;

    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch (e) { return jsonResponse(400, { error: 'JSON non valido.' }); }

    const handle = normalizeHandle(body.handle);
    const err = validateHandle(handle);
    if (err) return jsonResponse(400, { error: err });

    const { account, store, key } = auth;

    if (account.zchatHandle && account.zchatHandle !== handle) {
      return jsonResponse(409, { error: 'Hai già un handle registrato: @' + account.zchatHandle });
    }

    const existing = await getHandleIndex(handle);
    if (existing && existing.username !== account.username) {
      return jsonResponse(409, { error: 'Questo @handle è già in uso.' });
    }

    const profile = {
      handle,
      username: account.username,
      name: account.name || handle,
      avatar: account.avatar || { type: 'initial', content: (account.name || handle)[0].toUpperCase() },
      createdAt: account.zchatHandleCreatedAt || new Date().toISOString()
    };

    await setHandleIndex(handle, profile);

    const updated = {
      ...account,
      zchatHandle: handle,
      zchatHandleCreatedAt: profile.createdAt,
      updatedAt: new Date().toISOString()
    };
    if (!updated.zchatContacts) updated.zchatContacts = [];
    if (!updated.zchatAiChat) updated.zchatAiChat = [];
    if (!updated.zchatSettings) updated.zchatSettings = {};

    await store.setJSON(key, updated);
    const { passwordHash: _omit, ...safeAccount } = updated;
    return jsonResponse(200, { handle, account: safeAccount });
  }

  return jsonResponse(405, { error: 'Metodo non permesso.' });
};
