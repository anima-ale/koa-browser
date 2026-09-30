const { requireAuth, cors } = require('./_zchat');
const { getStore } = require('./_db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { payload } = auth;
  const store = getStore('zchat-push-subs');
  await store.delete(`sub:${payload.username}`);
  res.status(200).json({ ok: true });
};
