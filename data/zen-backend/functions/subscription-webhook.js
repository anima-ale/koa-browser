const { getStore, connectLambda } = require('@netlify/blobs');
const { jsonResponse } = require('./_session');

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_ENV = process.env.PAYPAL_ENV || 'sandbox';

const PAYPAL_API_BASE = PAYPAL_ENV === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

const CREATOR_HANDLE = 'theZ3Ncreator';
const CREATOR_USERNAME = 'theZ3Ncreator';

async function getPayPalAccessToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) return null;
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token;
}

async function verifySubscriptionDetails(subscriptionId) {
  const token = await getPayPalAccessToken();
  if (!token) return null;
  const res = await fetch(`${PAYPAL_API_BASE}/v1/billing/subscriptions/${subscriptionId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) return null;
  return await res.json();
}

exports.handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Metodo non permesso.' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}

  const eventType = body.event_type;
  const resource = body.resource || {};

  if (!eventType) {
    return jsonResponse(400, { error: 'Event type mancante nel webhook PayPal.' });
  }

  let username = resource.custom_id || resource.subscriber?.custom_id;
  let subscriptionId = resource.id || resource.billing_agreement_id;

  if (subscriptionId && !username) {
    const subDetails = await verifySubscriptionDetails(subscriptionId);
    if (subDetails) {
      username = subDetails.custom_id || subDetails.subscriber?.custom_id;
    }
  }

  if (!username) {
    console.log(`PayPal webhook [${eventType}]: nessun username identificato.`);
    return jsonResponse(200, { received: true, ignored: true });
  }

  const store = getStore('user_account_blob');
  const key = `user:${username}`;
  let account = await store.get(key, { type: 'json' });
  if (!account) {
    const legacyStore = getStore('zen-accounts');
    account = await legacyStore.get(key, { type: 'json' });
  }

  if (!account) {
    return jsonResponse(404, { error: 'Account non trovato per webhook PayPal.' });
  }

  let newTier = account.plan || 'free';

  if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED' || eventType === 'PAYMENT.SALE.COMPLETED') {
    const planId = resource.plan_id;
    if (planId === process.env.PAYPAL_PLAN_UNREAL) newTier = 'unreal';
    else if (planId === process.env.PAYPAL_PLAN_PRO) newTier = 'pro';
    else if (planId === process.env.PAYPAL_PLAN_PLUS) newTier = 'plus';
  } else if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED' || eventType === 'BILLING.SUBSCRIPTION.EXPIRED' || eventType === 'BILLING.SUBSCRIPTION.SUSPENDED') {
    newTier = 'free';
  }

  const wasUnreal = account.plan === 'unreal';
  const isUnreal = newTier === 'unreal';

  account.plan = newTier;
  account.updatedAt = new Date().toISOString();

  if (isUnreal) {
    account.zchatContacts = account.zchatContacts || [];
    if (!account.zchatContacts.some(c => c.handle === CREATOR_HANDLE)) {
      account.zchatContacts.push({
        handle: CREATOR_HANDLE,
        username: CREATOR_USERNAME,
        name: '@theZ3Ncreator',
        nickname: 'Creatore ZEN',
        labels: ['creator', 'priority'],
        avatar: { type: 'initial', content: '@' },
        addedAt: new Date().toISOString()
      });
    }
    account.zchatAcceptedChats = account.zchatAcceptedChats || [];
    if (!account.zchatAcceptedChats.includes(CREATOR_HANDLE)) {
      account.zchatAcceptedChats.push(CREATOR_HANDLE);
    }
  } else if (wasUnreal && !isUnreal) {
    if (account.zchatContacts) {
      account.zchatContacts = account.zchatContacts.filter(c => c.handle !== CREATOR_HANDLE);
    }
    if (account.zchatAcceptedChats) {
      account.zchatAcceptedChats = account.zchatAcceptedChats.filter(h => h !== CREATOR_HANDLE);
    }
  }

  await store.setJSON(key, account);
  return jsonResponse(200, { received: true, eventType, username, tier: newTier });
};
