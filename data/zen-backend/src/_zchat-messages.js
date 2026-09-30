const {
  normalizeHandle, requireAuth, getHandleIndex, getAccountByUsername, saveAccount,
  makeConvId, msgId, getConversation, saveConversation, canReceiveFrom,
  cors, parseBody
} = require('./_zchat');
const webpush = require('web-push');
const { getStore } = require('./_db');
const { initWebPush } = require('./_vapid');

const MAX_MESSAGES = 500;
const MAX_MEDIA_SIZE = 3 * 1024 * 1024;
let webPushReady = false;

async function ensureWebPush() {
  if (webPushReady) return;
  await initWebPush();
  webPushReady = true;
}

async function sendPushNotification(recipientUsername, title, body, url) {
  try {
    await ensureWebPush();
    const store = getStore('zchat-push-subs');
    const sub = await store.get(`sub:${recipientUsername}`, { type: 'json' });
    if (!sub) return;
    await webpush.sendNotification(sub, JSON.stringify({ title, body, icon: '/favicon.svg', badge: '/favicon.svg', tag: 'zchat', data: { url } }));
  } catch (err) {
    if (err && (err.statusCode === 410 || err.statusCode === 404)) {
      const store = getStore('zchat-push-subs');
      await store.delete(`sub:${recipientUsername}`);
    }
  }
}

function previewText(type, text, previewPlain, encrypted) {
  if (previewPlain) return previewPlain.slice(0, 160);
  if (encrypted) return '🔒 Messaggio crittografato';
  if (type === 'text') return (text || '').slice(0, 160);
  const map = { image: 'Foto', video: 'Video', gif: 'GIF', file: 'File', design: 'Progetto ZEN Design' };
  return map[type] || 'Messaggio';
}

function buildMessage(body, account, myHandle) {
  const type = body.type || 'text';
  const text = (body.text || '').toString().slice(0, 8000);
  const media = body.media || null;
  const encrypted = !!body.encrypted;
  const plain = body.previewPlain || (type === 'text' && !encrypted ? text : previewText(type, text, body.previewPlain, encrypted));
  return {
    id: msgId(),
    from: myHandle,
    fromUsername: account.username,
    type,
    text: text || '',
    previewPlain: previewText(type, text, plain, encrypted),
    encrypted,
    e2eIv: body.e2eIv || null,
    replyTo: body.replyTo || null,
    edited: false,
    deleted: false,
    media: media ? {
      dataUrl: media.dataUrl || null,
      url: media.url || null,
      mime: media.mime || null,
      size: media.size || null,
      fileName: media.fileName || null,
      designTitle: media.designTitle || null,
      designUrl: media.designUrl || null
    } : null,
    timestamp: new Date().toISOString(),
    readBy: [account.username]
  };
}

async function addIncomingRequest(recipientAcc, senderHandle, senderEntry, message) {
  const requests = [...(recipientAcc.zchatIncomingRequests || [])];
  const h = normalizeHandle(senderHandle);
  let req = requests.find(r => normalizeHandle(r.fromHandle) === h);
  if (!req) {
    req = {
      fromHandle: h,
      fromName: senderEntry.name || h,
      fromAvatar: senderEntry.avatar,
      preview: message.previewPlain || previewText(message.type, message.text),
      messages: [],
      timestamp: new Date().toISOString()
    };
    requests.push(req);
  }
  req.messages = req.messages || [];
  req.messages.push(message);
  req.preview = message.previewPlain || req.preview;
  req.timestamp = message.timestamp;
  await saveAccount(recipientAcc.username, { ...recipientAcc, zchatIncomingRequests: requests });
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { account } = auth;

  if (!account.zchatHandle) {
    return res.status(400).json({ error: 'Devi prima creare il tuo @handle.' });
  }

  const myHandle = normalizeHandle(account.zchatHandle);

  if (req.method === 'GET') {
    const convId = req.query.convId || '';
    const since = req.query.since || '';
    if (!convId) return res.status(400).json({ error: 'convId mancante.' });

    const conv = await getConversation(convId);
    if (!conv) return res.status(200).json({ messages: [], convId });

    if (!conv.participants.includes(myHandle)) {
      return res.status(403).json({ error: 'Non sei partecipante.' });
    }

    let messages = (conv.messages || []).filter(m => !m.deleted);
    if (since) {
      const sinceTime = new Date(since).getTime();
      messages = messages.filter(m => new Date(m.timestamp).getTime() > sinceTime);
    }

    let changed = false;
    for (const m of conv.messages || []) {
      if (!m.readBy) m.readBy = [];
      if (!m.readBy.includes(account.username)) {
        m.readBy.push(account.username);
        changed = true;
      }
    }
    if (changed) await saveConversation(convId, conv);

    return res.status(200).json({ messages, convId, updatedAt: conv.updatedAt });
  }

  if (req.method === 'PATCH') {
    const body = parseBody(req);
    if (!body) return res.status(400).json({ error: 'JSON non valido.' });

    const convId = body.convId;
    const messageId = body.msgId;
    const action = body.action;
    if (!convId || !messageId) return res.status(400).json({ error: 'convId e msgId richiesti.' });

    const conv = await getConversation(convId);
    if (!conv || !conv.participants.includes(myHandle)) {
      return res.status(403).json({ error: 'Conversazione non accessibile.' });
    }

    const idx = (conv.messages || []).findIndex(m => m.id === messageId);
    if (idx < 0) return res.status(404).json({ error: 'Messaggio non trovato.' });
    const msg = conv.messages[idx];
    if (msg.from !== myHandle) return res.status(403).json({ error: 'Puoi modificare solo i tuoi messaggi.' });

    if (action === 'delete') {
      msg.deleted = true;
      msg.text = '';
      msg.previewPlain = 'Messaggio eliminato';
    } else if (action === 'edit') {
      const newText = (body.text || '').slice(0, 8000);
      msg.text = newText;
      msg.previewPlain = newText.slice(0, 160);
      msg.edited = true;
      msg.editedAt = new Date().toISOString();
    } else {
      return res.status(400).json({ error: 'Azione non valida.' });
    }

    await saveConversation(convId, conv);
    return res.status(200).json({ message: msg });
  }

  if (req.method === 'POST') {
    const body = parseBody(req);
    if (!body) return res.status(400).json({ error: 'JSON non valido.' });

    const toHandle = normalizeHandle(body.toHandle);
    const type = body.type || 'text';
    const text = (body.text || '').toString();
    const media = body.media || null;

    if (!toHandle) return res.status(400).json({ error: 'Destinatario mancante.' });
    if (toHandle === myHandle) return res.status(400).json({ error: 'Non puoi scriverti.' });

    const recipientEntry = await getHandleIndex(toHandle);
    if (!recipientEntry) return res.status(404).json({ error: 'Destinatario non trovato.' });

    if (type === 'text' && !text.trim() && !body.encrypted) {
      return res.status(400).json({ error: 'Messaggio vuoto.' });
    }
    if (['image', 'video', 'file', 'gif', 'design'].includes(type) && !media) {
      return res.status(400).json({ error: 'Allegato mancante.' });
    }
    if (media?.dataUrl && media.dataUrl.length > MAX_MEDIA_SIZE * 1.4) {
      return res.status(400).json({ error: 'File troppo grande.' });
    }

    const recipientAcc = await getAccountByUsername(recipientEntry.username);
    if (!recipientAcc) return res.status(404).json({ error: 'Account destinatario non trovato.' });

    const access = canReceiveFrom(recipientAcc, myHandle);
    if (!access.ok && access.reason === 'blocked') {
      return res.status(403).json({ error: 'Sei stato bloccato.' });
    }

    const message = buildMessage(body, account, myHandle);

    if (!access.ok && access.reason === 'request') {
      await addIncomingRequest(recipientAcc, myHandle, {
        name: account.name || myHandle,
        avatar: account.avatar,
        handle: myHandle
      }, message);
      sendPushNotification(recipientEntry.username, 'Z-chat · Richiesta contatto', `@${myHandle} vuole contattarti`, '/');
      return res.status(202).json({ pending: true, requestMessage: message });
    }

    const convId = makeConvId(myHandle, toHandle);
    let conv = await getConversation(convId);
    if (!conv) {
      conv = {
        id: convId,
        participants: [myHandle, toHandle],
        participantUsernames: { [myHandle]: account.username, [toHandle]: recipientEntry.username },
        messages: [],
        createdAt: new Date().toISOString()
      };
    }

    conv.messages = conv.messages || [];
    conv.messages.push(message);
    if (conv.messages.length > MAX_MESSAGES) conv.messages = conv.messages.slice(-MAX_MESSAGES);
    conv.lastPreview = message.previewPlain;

    await saveConversation(convId, conv);
    const preview = message.previewPlain || (type === 'text' ? text : 'Allegato');
    sendPushNotification(recipientEntry.username, `Z-chat · @${myHandle}`, preview.slice(0, 120), '/');
    return res.status(201).json({ message, convId });
  }

  res.status(405).json({ error: 'Metodo non permesso.' });
};
