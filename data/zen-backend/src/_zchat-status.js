const { requireAuth, normalizeHandle, getHandleIndex, setHandleIndex, cors, parseBody } = require('./_zchat');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const handle = normalizeHandle(req.query.handle || '');
    if (!handle) return res.status(400).json({ error: 'handle mancante.' });
    const entry = await getHandleIndex(handle);
    if (!entry) return res.status(404).json({ error: 'Utente non trovato.' });
    return res.status(200).json({ status: entry.status || null });
  }

  if (req.method === 'POST') {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const { account, store, key } = auth;
    if (!account.zchatHandle) return res.status(400).json({ error: 'Handle mancante.' });

    const body = parseBody(req);
    if (!body) return res.status(400).json({ error: 'JSON non valido.' });

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
    return res.status(200).json({ status, account: safe });
  }

  res.status(405).json({ error: 'Metodo non permesso.' });
};
