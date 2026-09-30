const { requireAuth, jsonResponse, connectLambda } = require('./_zchat');
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});
  const auth = await requireAuth(event);
  if (auth.error) return auth.error;
  const { payload } = auth;
  const store = getStore('zchat-push-subs');
  await store.delete(`sub:${payload.username}`);
  return jsonResponse(200, { ok: true });
};
