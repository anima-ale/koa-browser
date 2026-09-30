// ══════════════════════════════════════════════════════
// ZEN ACCOUNT — Sync dati (profilo + chat)
// GET  /.netlify/functions/sync-data      → scarica i dati dell'account
// POST /.netlify/functions/sync-data      → salva profilo/chat/usage
// Richiede header: Authorization: Bearer <token>
// ══════════════════════════════════════════════════════
const { getStore, connectLambda } = require('@netlify/blobs');
const { verifyToken, getTokenFromEvent, jsonResponse } = require('./_session');

exports.handler = async (event) => {
  connectLambda(event); // richiesto in Lambda compatibility mode prima di usare getStore()
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});

  const token = getTokenFromEvent(event);
  const payload = verifyToken(token);
  if (!payload || !payload.username) return jsonResponse(401, { error: 'Sessione non valida. Accedi di nuovo.' });

  const store = getStore('user_account_blob');
  const key = `user:${payload.username}`;
  let account = await store.get(key, { type: 'json' });
  if (!account) {
    const legacyStore = getStore('zen-accounts');
    account = await legacyStore.get(key, { type: 'json' });
  }
  if (!account) return jsonResponse(404, { error: 'Account non trovato.' });

  if (account.subscriptionExpiresAt && account.plan && account.plan !== 'free') {
    const expiresMs = new Date(account.subscriptionExpiresAt).getTime();
    const diffDays = Math.ceil((expiresMs - Date.now()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) {
      account.plan = 'free';
      account.zchatContacts = (account.zchatContacts || []).filter(c => c.handle !== 'theZ3Ncreator');
      account.zchatAcceptedChats = (account.zchatAcceptedChats || []).filter(h => h !== 'theZ3Ncreator');
      delete account.expiryNotice;
      await store.setJSON(key, account);
    } else if (diffDays <= 3) {
      account.expiryNotice = `⚠️ Il tuo abbonamento ZEN ${account.plan.toUpperCase()} scadrà tra ${diffDays} giorn${diffDays === 1 ? 'o' : 'i'}. Rinnova prima della scadenza per mantenere i tuoi vantaggi.`;
    } else {
      delete account.expiryNotice;
    }
  }

  if (event.httpMethod === 'GET') {
    const { passwordHash: _omit, ...safeAccount } = account;
    return jsonResponse(200, { account: safeAccount });
  }

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch (e) { return jsonResponse(400, { error: 'JSON non valido.' }); }

    // Solo questi campi possono essere aggiornati via sync — mai passwordHash o username
    const updatable = ['name', 'avatar', 'plan', 'chats', 'usage', 'designs', 'designInbox', 'koaMemory', 'zchatHandle', 'zchatHandleCreatedAt', 'zchatContacts', 'zchatAiChat', 'zchatSettings', 'zchatE2ePublicKey', 'zchatAcceptedChats', 'zchatBlocks', 'zchatIncomingRequests', 'zchatStatus', 'zchatCallHistory', 'zchatPin', 'zchatKnownDevices'];
    const updated = { ...account };
    for (const field of updatable) {
      if (body[field] !== undefined) updated[field] = body[field];
    }
    updated.updatedAt = new Date().toISOString();

    await store.setJSON(key, updated);
    const { passwordHash: _omit2, ...safeAccount } = updated;
    return jsonResponse(200, { account: safeAccount });
  }

  return jsonResponse(405, { error: 'Metodo non permesso.' });
};
