const {
  normalizeHandle, validateHandle, requireAuth,
  getHandleIndex, cors, parseBody, canAccessFeature, CREATOR_HANDLE
} = require('./_zchat');
const { getTierConfig } = require('./_tiers');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non permesso.' });

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const body = parseBody(req);
  if (!body) return res.status(400).json({ error: 'JSON non valido.' });

  const { account, store, key } = auth;
  if (!account.zchatHandle) return res.status(400).json({ error: 'Handle mancante.' });

  const action = body.action;
  let contacts = Array.isArray(account.zchatContacts) ? [...account.zchatContacts] : [];
  let accepted = [...(account.zchatAcceptedChats || [])];

  if (action === 'add') {
    const handle = normalizeHandle(body.handle);
    const err = validateHandle(handle);
    if (err) return res.status(400).json({ error: err });
    if (handle === account.zchatHandle) return res.status(400).json({ error: 'Non puoi aggiungere te stesso.' });

    if (handle === CREATOR_HANDLE && !canAccessFeature(account.plan || 'free', 'creatorContact')) {
      return res.status(403).json({ error: 'Contatto esclusivo ZEN UNREAL. Passa a ZEN UNREAL per sbloccare il contatto diretto con @theZ3Ncreator.', needsUpgrade: true, tier: 'unreal' });
    }

    const entry = await getHandleIndex(handle);
    if (!entry) return res.status(404).json({ error: 'Utente non trovato.' });
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
    if (idx < 0) return res.status(404).json({ error: 'Contatto non trovato.' });
    if (body.nickname !== undefined) contacts[idx].nickname = body.nickname.slice(0, 40);
    if (body.labels !== undefined) contacts[idx].labels = body.labels.slice(0, 8);
    if (body.name !== undefined) contacts[idx].name = body.name.slice(0, 40);
  } else {
    return res.status(400).json({ error: 'Azione non valida.' });
  }

  const updated = {
    ...account,
    zchatContacts: contacts,
    zchatAcceptedChats: accepted,
    updatedAt: new Date().toISOString()
  };
  await store.setJSON(key, updated);
  const { passwordHash: _omit, ...safeAccount } = updated;
  res.status(200).json({ contacts, account: safeAccount });
};