// ══════════════════════════════════════════════════════
// Z-CHAT — Lista conversazioni utente
// GET → conversazioni con lastMessage e unreadCount
// ══════════════════════════════════════════════════════
const { getStore } = require('@netlify/blobs');
const {
  normalizeHandle, requireAuth, getHandleIndex,
  publicProfile, jsonResponse, connectLambda
} = require('./_zchat');

exports.handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});
  if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'Metodo non permesso.' });

  const auth = await requireAuth(event);
  if (auth.error) return auth.error;
  const { account } = auth;

  if (!account.zchatHandle) {
    return jsonResponse(200, { conversations: [] });
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

  return jsonResponse(200, { conversations });
};
