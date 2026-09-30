const { requireAuth, jsonResponse, connectLambda } = require('./_zchat');
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});
  const auth = await requireAuth(event);
  if (auth.error) return auth.error;
  const { payload } = auth;
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return jsonResponse(400, { error: 'JSON non valido.' }); }
  if (!body.subscription) return jsonResponse(400, { error: 'Subscription mancante.' });
  const store = getStore('zchat-push-subs');
  await store.setJSON(`sub:${payload.username}`, body.subscription);
  return jsonResponse(200, { ok: true });
};
