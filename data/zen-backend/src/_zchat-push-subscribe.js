const { requireAuth, cors, parseBody } = require('./_zchat');
const { getStore } = require('./_db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { payload } = auth;
  const body = parseBody(req);
  if (!body) return res.status(400).json({ error: 'JSON non valido.' });
  if (!body.subscription) return res.status(400).json({ error: 'Subscription mancante.' });
  const store = getStore('zchat-push-subs');
  await store.setJSON(`sub:${payload.username}`, body.subscription);
  res.status(200).json({ ok: true });
};
