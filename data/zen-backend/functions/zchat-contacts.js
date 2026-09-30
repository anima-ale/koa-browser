// Z-CHAT — Contatti: add/remove/update/deleteMultiple
const {
  normalizeHandle, validateHandle, requireAuth,
  getHandleIndex, setHandleIndex, jsonResponse, connectLambda
} = require('./_zchat');

exports.handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Metodo non permesso.' });

  const auth = await requireAuth(event);
  if (auth.error) return auth.error;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return jsonResponse(400, { error: 'JSON non valido.' }); }

  const { account, store, key } = auth;
  if (!account.zchatHandle) return jsonResponse(400, { error: 'Handle mancante.' });

  const action = body.action;
  let contacts = Array.isArray(account.zchatContacts) ? [...account.zchatContacts] : [];
  let accepted = [...(account.zchatAcceptedChats || [])];

  if (action === 'add') {
    const handle = normalizeHandle(body.handle);
    const err = validateHandle(handle);
    if (err) return jsonResponse(400, { error: err });
    if (handle === account.zchatHandle) return jsonResponse(400, { error: 'Non puoi aggiungere te stesso.' });
    if (handle === 'thez3ncreator' && account.plan !== 'unreal') {
      return jsonResponse(403, { error: 'Contatto esclusivo ZEN UNREAL. Passa a ZEN UNREAL per sbloccare il contatto diretto con @theZ3Ncreator.', needsUpgrade: true, tier: 'unreal' });
    }
    const entry = await getHandleIndex(handle);
    if (!entry) return jsonResponse(404, { error: 'Utente non trovato.' });
    if (!contacts.some(c => normalizeHandle(c.handle) === handle)) {
      contacts.push({
        handle,
        username: entry.username,
        name: entry.name || handle,
        nickname: '',
        labels: [],
        avatar: entry.avatar || { type: 'initial', content: (entry.name || handle)[0].toUpperCase() },
        addedAt: new Date().toISOString()
      });
    }
    if (!accepted.includes(handle)) accepted.push(handle);
  } else if (action === 'remove') {
    const handle = normalizeHandle(body.handle);
    contacts = contacts.filter(c => normalizeHandle(c.handle) !== handle);
    accepted = accepted.filter(h => h !== handle);
  } else if (action === 'removeMultiple') {
    const handles = (body.handles || []).map(normalizeHandle);
    contacts = contacts.filter(c => !handles.includes(normalizeHandle(c.handle)));
    accepted = accepted.filter(h => !handles.includes(h));
  } else if (action === 'update') {
    const handle = normalizeHandle(body.handle);
    const idx = contacts.findIndex(c => normalizeHandle(c.handle) === handle);
    if (idx < 0) return jsonResponse(404, { error: 'Contatto non trovato.' });
    if (body.nickname !== undefined) contacts[idx].nickname = body.nickname.slice(0, 40);
    if (body.labels !== undefined) contacts[idx].labels = body.labels.slice(0, 8);
    if (body.name !== undefined) contacts[idx].name = body.name.slice(0, 40);
  } else {
    return jsonResponse(400, { error: 'Azione non valida.' });
  }

  const updated = {
    ...account,
    zchatContacts: contacts,
    zchatAcceptedChats: accepted,
    updatedAt: new Date().toISOString()
  };
  await store.setJSON(key, updated);
  const { passwordHash: _omit, ...safeAccount } = updated;
  return jsonResponse(200, { contacts, account: safeAccount });
};
