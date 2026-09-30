// Z-CHAT — WebRTC + campanello chiamate in entrata
const { getStore } = require('@netlify/blobs');
const { requireAuth, normalizeHandle, getHandleIndex, jsonResponse, connectLambda } = require('./_zchat');

exports.handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});

  const auth = await requireAuth(event);
  if (auth.error) return auth.error;
  const { account } = auth;
  const myHandle = normalizeHandle(account.zchatHandle);
  const store = getStore('zchat-webrtc');

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch (e) { return jsonResponse(400, { error: 'JSON non valido.' }); }

    const callId = body.callId;
    const toHandle = normalizeHandle(body.toHandle);
    const signalType = body.signalType;
    const payload = body.payload;
    const callType = body.callType || 'audio';
    const fromName = body.fromName || account.name || myHandle;

    if (!callId || !toHandle || !signalType) {
      return jsonResponse(400, { error: 'Parametri mancanti.' });
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

    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod === 'GET') {
    const callId = event.queryStringParameters?.callId;
    const since = event.queryStringParameters?.since || '';
    const mode = event.queryStringParameters?.mode;

    if (mode === 'incoming') {
      const ring = await store.get(`ring:${myHandle}`, { type: 'json' });
      if (!ring) return jsonResponse(200, { incoming: [] });
      const age = Date.now() - new Date(ring.at).getTime();
      if (age > 90000) {
        await store.delete(`ring:${myHandle}`);
        return jsonResponse(200, { incoming: [] });
      }
      const entry = await getHandleIndex(ring.from);
      return jsonResponse(200, {
        incoming: [{
          callId: ring.callId,
          from: ring.from,
          fromName: ring.fromName || entry?.name || ring.from,
          callType: ring.callType,
          at: ring.at
        }]
      });
    }

    if (!callId) return jsonResponse(400, { error: 'callId mancante.' });

    const session = await store.get(`signal:${callId}`, { type: 'json' });
    if (!session) return jsonResponse(200, { signals: [], session: null });

    let signals = session.signals || [];
    const forMe = (s) => s.to === myHandle || s.from === myHandle;

    if (since) {
      const t = new Date(since).getTime();
      signals = signals.filter(s => new Date(s.at).getTime() > t && forMe(s));
    } else {
      signals = signals.filter(forMe);
    }

    return jsonResponse(200, {
      signals,
      session: { callId: session.callId, from: session.from, to: session.to, callType: session.callType, status: session.status }
    });
  }

  return jsonResponse(405, { error: 'Metodo non permesso.' });
};
