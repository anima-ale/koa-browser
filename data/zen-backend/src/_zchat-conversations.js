const { getStore } = require('./_db');
const {
  normalizeHandle, requireAuth, getHandleIndex,
  publicProfile, cors
} = require('./_zchat');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo non permesso.' });

  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { account } = auth;

  if (!account.zchatHandle) {
    return res.status(200).json({ conversations: [] });
  }

  const myHandle = normalizeHandle(account.zchatHandle);
  const store = getStore('zchat-conversations');
  const { blobs } = await store.list({ prefix: 'conv:' });

  const conversations = [];

  for (const blob of blobs) {
    const conv = await store.get(blob.key, { type: 'json' });
    if (!conv || !conv.participants || !conv.participants.includes(myHandle)) continue;

    const peerHandle = conv.participants.find(h => h !== myHandle);
    const peerEntry = peerHandle ? await getHandleIndex(peerHandle) : null;
    const messages = conv.messages || [];
    const lastMessage = messages.length ? messages[messages.length - 1] : null;
    const unreadCount = messages.filter(m =>
      m.from !== myHandle && (!m.readBy || !m.readBy.includes(account.username))
    ).length;

    conversations.push({
      convId: conv.id,
      peer: peerEntry ? publicProfile({ ...peerEntry, handle: peerHandle }) : { handle: peerHandle, name: peerHandle, avatar: { type: 'initial', content: '?' } },
      lastMessage: lastMessage ? {
        id: lastMessage.id,
        from: lastMessage.from,
        type: lastMessage.type,
        text: lastMessage.previewPlain || (lastMessage.encrypted ? '🔒 Messaggio crittografato' : (lastMessage.text || '')),
        previewPlain: lastMessage.previewPlain || null,
        timestamp: lastMessage.timestamp
      } : null,
      unreadCount,
      updatedAt: conv.updatedAt || conv.createdAt
    });
  }

  conversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  res.status(200).json({ conversations });
};
