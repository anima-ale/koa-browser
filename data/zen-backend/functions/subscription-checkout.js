const { getStore, connectLambda } = require('@netlify/blobs');
const { verifyToken, getTokenFromEvent, jsonResponse } = require('./_session');

const TIER_PRICES = {
  plus: 4.99,
  pro: 19.99,
  unreal: 99.99,
};

exports.handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Metodo non permesso.' });

  const token = getTokenFromEvent(event);
  const payload = verifyToken(token);

  const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
  const PAYPAL_PLAN_IDS = {
    plus: process.env.PAYPAL_PLAN_PLUS || '',
    pro: process.env.PAYPAL_PLAN_PRO || '',
    unreal: process.env.PAYPAL_PLAN_UNREAL || '',
  };

  if (!payload || !payload.username) {
    return jsonResponse(200, {
      paypalClientId: PAYPAL_CLIENT_ID,
      currency: 'EUR',
      guest: true
    });
  }

  const store = getStore('user_account_blob');
  const key = `user:${payload.username}`;
  let account = await store.get(key, { type: 'json' });
  if (!account) {
    const legacyStore = getStore('zen-accounts');
    account = await legacyStore.get(key, { type: 'json' });
  }
  if (!account) return jsonResponse(404, { error: 'Account non trovato.' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}

  const { tier } = body;
  if (!tier || !['plus', 'pro', 'unreal'].includes(tier)) {
    return jsonResponse(400, { error: 'Tier non valido.' });
  }

  if (account.plan === tier) {
    return jsonResponse(400, { error: 'Hai già questo piano attivo.' });
  }

  return jsonResponse(200, {
    paypalClientId: PAYPAL_CLIENT_ID,
    planId: PAYPAL_PLAN_IDS[tier],
    tier,
    price: TIER_PRICES[tier],
    currency: 'EUR',
    username: payload.username,
  });
};
