const { getAccount, setAccount } = require('./_db');
const { cors, CREATOR_HANDLE, CREATOR_USERNAME, ensureCreatorHandle } = require('./_zchat');

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_ENV = process.env.PAYPAL_ENV || 'sandbox';

const PAYPAL_API_BASE = PAYPAL_ENV === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

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

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non permesso.' });

  const body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.body || '{}');
  const eventType = body.event_type;
  const resource = body.resource || {};

  if (!eventType) {
    return res.status(400).json({ error: 'Event type mancante nel webhook PayPal.' });
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
    return res.status(200).json({ received: true, ignored: true });
  }

  const account = await getAccount(username);
  if (!account) {
    return res.status(404).json({ error: 'Account non trovato per webhook PayPal.' });
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
    await ensureCreatorHandle();
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

  await setAccount(username, account);
  return res.status(200).json({ received: true, eventType, username, tier: newTier });
};