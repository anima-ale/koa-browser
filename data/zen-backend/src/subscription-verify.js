const { getAccount, setAccount } = require('./_db');
const { verifyToken, getTokenFromReq, cors, CREATOR_HANDLE, CREATOR_USERNAME, ensureCreatorHandle } = require('./_zchat');

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_ENV = process.env.PAYPAL_ENV || 'sandbox';

const PAYPAL_API_BASE = PAYPAL_ENV === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

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

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non permesso.' });

  const token = getTokenFromReq(req);
  const payload = verifyToken(token);
  const username = payload?.username;

  const body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.body || '{}');
  const { orderID, subscriptionID, tier } = body;
  const paymentId = orderID || subscriptionID;

  if (!paymentId || !tier || !['plus', 'pro', 'unreal'].includes(tier)) {
    return res.status(400).json({ error: 'paymentId (orderID o subscriptionID) e tier validi sono obbligatori.' });
  }

  try {
    let paymentVerified = false;
    let expiresDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    if (PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET) {
      if (orderID) {
        const orderData = await verifyPayPalOrder(orderID);
        const status = orderData.status?.toUpperCase();
        if (status !== 'COMPLETED' && status !== 'APPROVED') {
          return res.status(400).json({ error: `Stato ordine PayPal (${status}) non valido. Pagamento non completato.` });
        }
        paymentVerified = true;
      } else if (subscriptionID) {
        const subData = await verifyPayPalSubscription(subscriptionID);
        const status = subData.status?.toUpperCase();
        if (status !== 'ACTIVE' && status !== 'APPROVED') {
          return res.status(400).json({ error: `Stato abbonamento PayPal non attivo (${status}). Pagamento non verificato.` });
        }
        if (subData.billing_info?.next_billing_time) {
          expiresDate = new Date(subData.billing_info.next_billing_time);
        }
        paymentVerified = true;
      }
    } else {
      // Se le credenziali segrete non sono ancora configurate, registriamo l'ordine del client
      paymentVerified = true;
    }

    if (!paymentVerified) {
      return res.status(400).json({ error: 'Impossibile verificare il pagamento PayPal.' });
    }

    if (username) {
      const account = await getAccount(username);
      if (account) {
        const wasUnreal = account.plan === 'unreal';
        const isUnreal = tier === 'unreal';

        account.plan = tier;
        account.paypalPaymentId = paymentId;
        if (subscriptionID) account.paypalSubscriptionId = subscriptionID;
        account.subscriptionExpiresAt = expiresDate.toISOString();
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
        } else if (wasUnreal) {
          if (account.zchatContacts) {
            account.zchatContacts = account.zchatContacts.filter(c => c.handle !== CREATOR_HANDLE);
          }
          if (account.zchatAcceptedChats) {
            account.zchatAcceptedChats = account.zchatAcceptedChats.filter(h => h !== CREATOR_HANDLE);
          }
        }

        await setAccount(username, account);
        const { passwordHash: _omit, ...safeAccount } = account;
        return res.status(200).json({ success: true, account: safeAccount, tier, expiresAt: expiresDate.toISOString() });
      }
    }

    return res.status(200).json({ success: true, tier, expiresAt: expiresDate.toISOString() });
  } catch (e) {
    console.error('PayPal verification error:', e);
    return res.status(502).json({ error: e.message || 'Verifica PayPal fallita.' });
  }
};
