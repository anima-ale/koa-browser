const {
  normalizeHandle, validateHandle, getHandleIndex, getAccountByUsername,
  publicProfile, cors
} = require('./_zchat');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo non permesso.' });

  const handle = normalizeHandle(req.query.handle || '');
  if (!handle) return res.status(400).json({ error: 'Parametro handle mancante.' });
  const err = validateHandle(handle);
  if (err) return res.status(400).json({ error: err });

  const entry = await getHandleIndex(handle);
  if (!entry) return res.status(404).json({ error: 'Utente non trovato.' });

  const acc = await getAccountByUsername(entry.username);
  const profile = publicProfile({ ...entry, handle });
  if (acc?.zchatE2ePublicKey) profile.e2ePublicKey = acc.zchatE2ePublicKey;
  if (acc?.zchatStatus) profile.status = acc.zchatStatus;

  res.status(200).json({ profile });
};
