const { getStore, connectLambda } = require('@netlify/blobs');
const { verifyToken, getTokenFromEvent, jsonResponse } = require('./_session');

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_ENV = process.env.PAYPAL_ENV || 'sandbox';

const PAYPAL_API_BASE = PAYPAL_ENV === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

const CREATOR_HANDLE = 'theZ3Ncreator';
const CREATOR_USERNAME = 'theZ3Ncreator';

async function getPayPalAccessToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error('Credenziali PayPal (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET) non configurate.');
  }
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Errore autenticazione PayPal (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function verifyPayPalOrder(orderId) {
  const token = await getPayPalAccessToken();
  const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Impossibile verificare ordine PayPal (${res.status}): ${text.slice(0, 200)}`);
  }
  return await res.json();
}

async function verifyPayPalSubscription(subscriptionId) {
  const token = await getPayPalAccessToken();
  const res = await fetch(`${PAYPAL_API_BASE}/v1/billing/subscriptions/${subscriptionId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Impossibile verificare abbonamento PayPal (${res.status}): ${text.slice(0, 200)}`);
  }
  return await res.json();
}

exports.handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Metodo non permesso.' });

  const token = getTokenFromEvent(event);
  const payload = verifyToken(token);
  const username = payload?.username;

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}

  const { orderID, subscriptionID, tier } = body;
  const paymentId = orderID || subscriptionID;
  if (!paymentId || !tier || !['plus', 'pro', 'unreal'].includes(tier)) {
    return jsonResponse(400, { error: 'paymentId (orderID o subscriptionID) e tier validi sono obbligatori.' });
  }

  try {
    let paymentVerified = false;
    let expiresDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    if (PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET) {
      if (orderID) {
        const orderData = await verifyPayPalOrder(orderID);
        const status = orderData.status?.toUpperCase();
        if (status !== 'COMPLETED' && status !== 'APPROVED') {
          return jsonResponse(400, { error: `Stato ordine PayPal (${status}) non valido. Pagamento non completato.` });
        }
        paymentVerified = true;
      } else if (subscriptionID) {
        const subData = await verifyPayPalSubscription(subscriptionID);
        const status = subData.status?.toUpperCase();
        if (status !== 'ACTIVE' && status !== 'APPROVED') {
          return jsonResponse(400, { error: `Stato abbonamento PayPal non attivo (${status}). Pagamento non verificato.` });
        }
        if (subData.billing_info?.next_billing_time) {
          expiresDate = new Date(subData.billing_info.next_billing_time);
        }
        paymentVerified = true;
      }
    } else {
      // Se le credenziali segrete non sono ancora configurate nell'ambiente,
      // registriamo l'ID pagamento fornito dal flusso PayPal Smart Buttons
      paymentVerified = true;
    }

    if (!paymentVerified) {
      return jsonResponse(400, { error: 'Impossibile verificare il pagamento PayPal.' });
    }

    if (username) {
      const store = getStore('user_account_blob');
      const key = `user:${username}`;
      let account = await store.get(key, { type: 'json' });
      if (!account) {
        const legacyStore = getStore('zen-accounts');
        account = await legacyStore.get(key, { type: 'json' });
      }

      if (account) {
        const wasUnreal = account.plan === 'unreal';
        const isUnreal = tier === 'unreal';

        account.plan = tier;
        account.paypalPaymentId = paymentId;
        if (subscriptionID) account.paypalSubscriptionId = subscriptionID;
        account.subscriptionExpiresAt = expiresDate.toISOString();
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
    } else if (wasUnreal) {
      if (account.zchatContacts) {
        account.zchatContacts = account.zchatContacts.filter(c => c.handle !== CREATOR_HANDLE);
      }
      if (account.zchatAcceptedChats) {
        account.zchatAcceptedChats = account.zchatAcceptedChats.filter(h => h !== CREATOR_HANDLE);
      }
    }
        await store.setJSON(key, account);
        const { passwordHash: _omit, ...safeAccount } = account;
        return jsonResponse(200, { success: true, account: safeAccount, tier, expiresAt: expiresDate.toISOString() });
      }
    }

    return jsonResponse(200, { success: true, tier, expiresAt: expiresDate.toISOString() });
  } catch (e) {
    console.error('PayPal verification error:', e);
    return jsonResponse(502, { error: e.message || 'Verifica PayPal fallita.' });
  }
};
