const {
  requireAuth, normalizeHandle, getHandleIndex, getAccountByUsername, saveAccount,
  makeConvId, getConversation, saveConversation, cors, parseBody
} = require('./_zchat');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { account, store, key } = auth;

  if (req.method === 'GET') {
    return res.status(200).json({ requests: account.zchatIncomingRequests || [] });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non permesso.' });

  const body = parseBody(req);
  if (!body) return res.status(400).json({ error: 'JSON non valido.' });

  const action = body.action;
  const fromHandle = normalizeHandle(body.fromHandle);
  if (!fromHandle) return res.status(400).json({ error: 'fromHandle mancante.' });

  const requests = [...(account.zchatIncomingRequests || [])];
  const reqIdx = requests.findIndex(r => normalizeHandle(r.fromHandle) === fromHandle);
  const req = reqIdx >= 0 ? requests[reqIdx] : null;

  if (action === 'accept') {
    if (!req) return res.status(404).json({ error: 'Richiesta non trovata.' });

    const senderEntry = await getHandleIndex(fromHandle);
    if (!senderEntry) return res.status(404).json({ error: 'Mittente non trovato.' });

    let contacts = [...(account.zchatContacts || [])];
    if (!contacts.some(c => normalizeHandle(c.handle) === fromHandle)) {
      contacts.push({
        handle: fromHandle,
        username: senderEntry.username,
        name: senderEntry.name || fromHandle,
        avatar: senderEntry.avatar,
        addedAt: new Date().toISOString()
      });
    }

    const accepted = [...(account.zchatAcceptedChats || [])];
    if (!accepted.includes(fromHandle)) accepted.push(fromHandle);

    requests.splice(reqIdx, 1);

    const myHandle = normalizeHandle(account.zchatHandle);
    const convId = makeConvId(myHandle, fromHandle);
    let conv = await getConversation(convId);
    if (!conv) {
      conv = {
        id: convId,
        participants: [myHandle, fromHandle],
        participantUsernames: { [myHandle]: account.username, [fromHandle]: senderEntry.username },
        messages: [],
        createdAt: new Date().toISOString()
      };
    }
    if (req.messages && req.messages.length) {
      conv.messages = (conv.messages || []).concat(req.messages);
    }
    await saveConversation(convId, conv);

    const updated = {
      ...account,
      zchatContacts: contacts,
      zchatAcceptedChats: accepted,
      zchatIncomingRequests: requests
    };
    await store.setJSON(key, updated);

    const senderAcc = await getAccountByUsername(senderEntry.username);
    if (senderAcc) {
      let sContacts = [...(senderAcc.zchatContacts || [])];
      if (!sContacts.some(c => normalizeHandle(c.handle) === myHandle)) {
        sContacts.push({
          handle: myHandle,
          username: account.username,
          name: account.name || myHandle,
          avatar: account.avatar,
          addedAt: new Date().toISOString()
        });
      }
      const sAccepted = [...(senderAcc.zchatAcceptedChats || [])];
      if (!sAccepted.includes(myHandle)) sAccepted.push(myHandle);
      await saveAccount(senderEntry.username, {
        ...senderAcc,
        zchatContacts: sContacts,
        zchatAcceptedChats: sAccepted
      });
    }

    const { passwordHash: _o, ...safe } = updated;
    return res.status(200).json({ account: safe, convId });
  }

  if (action === 'reject') {
    if (reqIdx >= 0) requests.splice(reqIdx, 1);

    const blocks = { ...(account.zchatBlocks || {}) };
    const prev = blocks[fromHandle] || { rejectCount: 0, permanent: false };
    const rejectCount = (prev.rejectCount || 0) + 1;
    blocks[fromHandle] = {
      rejectCount,
      permanent: rejectCount >= 2,
      lastReject: new Date().toISOString()
    };

    let contacts = (account.zchatContacts || []).filter(
      c => normalizeHandle(c.handle) !== fromHandle
    );
    const accepted = (account.zchatAcceptedChats || []).filter(h => h !== fromHandle);

    const updated = {
      ...account,
      zchatContacts: contacts,
      zchatAcceptedChats: accepted,
      zchatIncomingRequests: requests,
      zchatBlocks: blocks
    };
    await store.setJSON(key, updated);

    const senderEntry = await getHandleIndex(fromHandle);
    if (senderEntry) {
      const senderAcc = await getAccountByUsername(senderEntry.username);
      if (senderAcc) {
        const myHandle = normalizeHandle(account.zchatHandle);
        const sContacts = (senderAcc.zchatContacts || []).filter(
          c => normalizeHandle(c.handle) !== myHandle
        );
        await saveAccount(senderEntry.username, { ...senderAcc, zchatContacts: sContacts });
      }
    }

    const { passwordHash: _o2, ...safe2 } = updated;
    return res.status(200).json({
      account: safe2,
      permanent: blocks[fromHandle].permanent,
      rejectCount
    });
  }

  res.status(400).json({ error: 'Azione non valida.' });
};
