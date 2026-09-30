// ══════════════════════════════════════════════════════
// ZEN — Memoria condivisa: tutti i dispositivi si aiutano a vicenda.
// GET  /zen-cache?key=<hash>  → { hit, value, at, model }
// POST /zen-cache { key, value, model } → salva per gli altri dispositivi.
// La chiave è un hash: il testo del prompt non viaggia mai in chiaro in GET.
// Store Netlify Blobs 'zen-shared-cache'. Mai bloccare la generazione per la cache.
// ══════════════════════════════════════════════════════
const { getStore, connectLambda } = require('@netlify/blobs');
const { jsonResponse } = require('./_session');

const KEY_RE = /^[a-f0-9]{16,64}$/;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});
  connectLambda(event);
  const store = getStore('zen-shared-cache');

  if (event.httpMethod === 'GET') {
    const key = String(event.queryStringParameters?.key || '').toLowerCase();
    if (!KEY_RE.test(key)) return jsonResponse(400, { error: 'key non valida.' });
    try {
      const raw = await store.get(key);
      if (!raw) return jsonResponse(200, { hit: false });
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch (_) { return jsonResponse(200, { hit: false }); }
      if (!parsed || typeof parsed.value !== 'string' || !parsed.value.trim()) {
        return jsonResponse(200, { hit: false });
      }
      return jsonResponse(200, { hit: true, value: parsed.value, at: parsed.at || 0, model: parsed.model || '' });
    } catch (e) {
      return jsonResponse(502, { error: 'Lettura cache fallita.' });
    }
  }

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch (e) { return jsonResponse(400, { error: 'JSON non valido.' }); }
    const key = String(body.key || '').toLowerCase();
    const value = String(body.value || '');
    if (!KEY_RE.test(key) || value.length < 200 || value.length > 150000) {
      return jsonResponse(400, { error: 'key/value non validi.' });
    }
    try {
      await store.set(key, JSON.stringify({
        value,
        at: Date.now(),
        model: String(body.model || '').slice(0, 32)
      }));
      return jsonResponse(200, { ok: true });
    } catch (e) {
      return jsonResponse(502, { error: 'Scrittura cache fallita.' });
    }
  }

  return jsonResponse(405, { error: 'Metodo non permesso.' });
};
