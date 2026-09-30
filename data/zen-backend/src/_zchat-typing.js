const { getStore } = require('./_db');
const { requireAuth, normalizeHandle, makeConvId, cors, parseBody } = require('./_zchat');

const TYPING_TTL_MS = 5000;

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { account } = auth;
  if (!account.zchatHandle) return res.status(400).json({ error: 'Handle mancante.' });

  const myHandle = normalizeHandle(account.zchatHandle);
  const store = getStore('zchat-typing');

  if (req.method === 'POST') {
    const body = parseBody(req);
    if (!body) return res.status(400).json({ error: 'JSON non valido.' });

    const toHandle = normalizeHandle(body.toHandle);
    const typing = !!body.typing;
    const convId = makeConvId(myHandle, toHandle);
    const key = `typing:${convId}:${myHandle}`;

    if (typing) {
      await store.setJSON(key, { handle: myHandle, convId, at: new Date().toISOString() });
    } else {
      await store.delete(key);
    }
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {
    const convId = req.query.convId || '';
    if (!convId) return res.status(400).json({ error: 'convId mancante.' });

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

    return res.status(200).json({ typing });
  }

  res.status(405).json({ error: 'Metodo non permesso.' });
};
