const { getAccount } = require('./_db');
const { verifyToken, getTokenFromReq, cors } = require('./_zchat');
const { getTierConfig } = require('./_tiers');

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_PLAN_IDS = {
  plus: process.env.PAYPAL_PLAN_PLUS || '',
  pro: process.env.PAYPAL_PLAN_PRO || '',
  unreal: process.env.PAYPAL_PLAN_UNREAL || '',
};

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non permesso.' });

  const token = getTokenFromReq(req);
  const payload = verifyToken(token);
  if (!payload || !payload.username) {
    return res.status(200).json({
      paypalClientId: PAYPAL_CLIENT_ID,
      currency: 'EUR',
      guest: true
    });
  }

  const account = await getAccount(payload.username);
  if (!account) return res.status(404).json({ error: 'Account non trovato.' });

  const body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.body || '{}');
  const { tier } = body;
  if (!tier || !['plus', 'pro', 'unreal'].includes(tier)) {
    return res.status(400).json({ error: 'Tier non valido.' });
  }

  if (account.plan === tier) {
    return res.status(400).json({ error: 'Hai già questo piano attivo.' });
  }

  const config = getTierConfig(tier);
  const planId = PAYPAL_PLAN_IDS[tier];

  return res.status(200).json({
    paypalClientId: PAYPAL_CLIENT_ID,
    planId,
    tier,
    price: config.price,
    currency: 'EUR',
    username: payload.username,
  });
};