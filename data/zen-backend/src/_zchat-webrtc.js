const { getStore } = require('./_db');
const { requireAuth, normalizeHandle, getHandleIndex, cors, parseBody } = require('./_zchat');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { account } = auth;
  const myHandle = normalizeHandle(account.zchatHandle);
  const store = getStore('zchat-webrtc');

  if (req.method === 'POST') {
    const body = parseBody(req);
    if (!body) return res.status(400).json({ error: 'JSON non valido.' });

    const callId = body.callId;
    const toHandle = normalizeHandle(body.toHandle);
    const signalType = body.signalType;
    const payload = body.payload;
    const callType = body.callType || 'audio';
    const fromName = body.fromName || account.name || myHandle;

    if (!callId || !toHandle || !signalType) {
      return res.status(400).json({ error: 'Parametri mancanti.' });
    }

    const key = `signal:${callId}`;
    let session = await store.get(key, { type: 'json' }) || {
      callId, from: myHandle, to: toHandle, callType, fromName, signals: [],
      createdAt: new Date().toISOString(), status: 'ringing'
    };

    session.signals.push({
      from: myHandle, to: toHandle, signalType, payload,
      at: new Date().toISOString()
    });

    if (signalType === 'offer') {
      await store.setJSON(`ring:${toHandle}`, {
        callId, from: myHandle, fromName, callType,
        at: new Date().toISOString(), status: 'ringing'
      });
    }

    if (signalType === 'hangup' || signalType === 'reject' || signalType === 'answer') {
      await store.delete(`ring:${toHandle}`);
      session.status = signalType;
    }

    if (session.signals.length > 100) session.signals = session.signals.slice(-100);
    await store.setJSON(key, session);

    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {
    const callId = req.query.callId;
    const since = req.query.since || '';
    const mode = req.query.mode;

    if (mode === 'incoming') {
      const ring = await store.get(`ring:${myHandle}`, { type: 'json' });
      if (!ring) return res.status(200).json({ incoming: [] });
      const age = Date.now() - new Date(ring.at).getTime();
      if (age > 90000) {
        await store.delete(`ring:${myHandle}`);
        return res.status(200).json({ incoming: [] });
      }
      const entry = await getHandleIndex(ring.from);
      return res.status(200).json({
        incoming: [{
          callId: ring.callId,
          from: ring.from,
          fromName: ring.fromName || entry?.name || ring.from,
          callType: ring.callType,
          at: ring.at
        }]
      });
    }

    if (!callId) return res.status(400).json({ error: 'callId mancante.' });

    const session = await store.get(`signal:${callId}`, { type: 'json' });
    if (!session) return res.status(200).json({ signals: [], session: null });

    let signals = session.signals || [];
    const forMe = (s) => s.to === myHandle || s.from === myHandle;

    if (since) {
      const t = new Date(since).getTime();
      signals = signals.filter(s => new Date(s.at).getTime() > t && forMe(s));
    } else {
      signals = signals.filter(forMe);
    }

    return res.status(200).json({
      signals,
      session: { callId: session.callId, from: session.from, to: session.to, callType: session.callType, status: session.status }
    });
  }

  res.status(405).json({ error: 'Metodo non permesso.' });
};
