const {
  normalizeHandle, validateHandle, requireAuth,
  getHandleIndex, setHandleIndex, cors, parseBody
} = require('./_zchat');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const handle = normalizeHandle(req.query.handle || '');
    if (!handle) return res.status(400).json({ error: 'Parametro handle mancante.' });
    const err = validateHandle(handle);
    if (err) return res.status(400).json({ error: err });
    const existing = await getHandleIndex(handle);
    return res.status(200).json({ handle, available: !existing });
  }

  if (req.method === 'POST') {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const body = parseBody(req);
    if (!body) return res.status(400).json({ error: 'JSON non valido.' });

    const handle = normalizeHandle(body.handle);
    const err = validateHandle(handle);
    if (err) return res.status(400).json({ error: err });

    const { account, store, key } = auth;

    if (account.zchatHandle && account.zchatHandle !== handle) {
      return res.status(409).json({ error: 'Hai già un handle registrato: @' + account.zchatHandle });
    }

    const existing = await getHandleIndex(handle);
    if (existing && existing.username !== account.username) {
      return res.status(409).json({ error: 'Questo @handle è già in uso.' });
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
    return res.status(200).json({ handle, account: safeAccount });
  }

  res.status(405).json({ error: 'Metodo non permesso.' });
};
