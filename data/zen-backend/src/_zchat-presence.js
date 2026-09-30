const { getStore } = require('./_db');
const { requireAuth, normalizeHandle, getHandleIndex, setHandleIndex, cors } = require('./_zchat');

const ONLINE_TTL_MS = 45000;

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const { account } = auth;
    if (!account.zchatHandle) return res.status(400).json({ error: 'Handle mancante.' });

    const store = getStore('zchat-presence');
    const handle = normalizeHandle(account.zchatHandle);
    await store.setJSON(`presence:${handle}`, {
      handle,
      username: account.username,
      online: true,
      lastSeen: new Date().toISOString()
    });

    const entry = await getHandleIndex(handle);
    if (entry) {
      entry.online = true;
      entry.lastSeen = new Date().toISOString();
      await setHandleIndex(handle, entry);
    }

    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {
    const handles = (req.query.handles || '').split(',').filter(Boolean);
    const store = getStore('zchat-presence');
    const now = Date.now();
    const result = {};

    for (const h of handles) {
      const handle = normalizeHandle(h);
      const p = await store.get(`presence:${handle}`, { type: 'json' });
      const online = p && p.lastSeen && (now - new Date(p.lastSeen).getTime() < ONLINE_TTL_MS);
      result[handle] = { online: !!online, lastSeen: p?.lastSeen || null };
    }

    return res.status(200).json({ presence: result });
  }

  res.status(405).json({ error: 'Metodo non permesso.' });
};
