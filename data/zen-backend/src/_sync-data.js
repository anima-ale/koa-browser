const { getAccount, setAccount } = require('./_db');
const { verifyToken, getTokenFromReq } = require('./_session');
const { cors, parseBody } = require('./_zchat');
const { getTierConfig } = require('./_tiers');

const UPDATABLE_FIELDS = ['name', 'avatar', 'chats', 'usage', 'designs', 'designInbox', 'koaMemory', 'zchatHandle', 'zchatHandleCreatedAt', 'zchatContacts', 'zchatAiChat', 'zchatSettings', 'zchatE2ePublicKey', 'zchatAcceptedChats', 'zchatBlocks', 'zchatIncomingRequests', 'zchatStatus', 'zchatCallHistory', 'zchatPin', 'zchatKnownDevices'];

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = getTokenFromReq(req);
  const payload = verifyToken(token);
  if (!payload || !payload.username) return res.status(401).json({ error: 'Sessione non valida. Accedi di nuovo.' });

  const account = await getAccount(payload.username);
  if (!account) return res.status(404).json({ error: 'Account non trovato.' });

  if (req.method === 'GET') {
    const { passwordHash: _omit, ...safeAccount } = account;
    return res.status(200).json({ account: safeAccount, tierConfig: getTierConfig(account.plan || 'free') });
  }

  if (req.method === 'POST') {
    const body = parseBody(req);
    if (!body) return res.status(400).json({ error: 'JSON non valido.' });

    const updated = { ...account };
    for (const field of UPDATABLE_FIELDS) {
      if (body[field] !== undefined) updated[field] = body[field];
    }
    updated.updatedAt = new Date().toISOString();

    await setAccount(payload.username, updated);
    const { passwordHash: _omit2, ...safeAccount } = updated;
    return res.status(200).json({ account: safeAccount });
  }

  res.status(405).json({ error: 'Metodo non permesso.' });
};