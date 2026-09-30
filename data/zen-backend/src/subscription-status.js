const { getAccount } = require('./_db');
const { verifyToken, getTokenFromReq, cors } = require('./_zchat');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo non permesso.' });

  const token = getTokenFromReq(req);
  const payload = verifyToken(token);
  if (!payload || !payload.username) return res.status(401).json({ error: 'Sessione non valida. Accedi di nuovo.' });

  const account = await getAccount(payload.username);
  if (!account) return res.status(404).json({ error: 'Account non trovato.' });

  const { sessionId } = req.query;

  if (STRIPE_SECRET_KEY && sessionId) {
    try {
      const Stripe = require('stripe');
      const stripe = Stripe(STRIPE_SECRET_KEY);
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status === 'paid' && session.metadata?.username === payload.username) {
        return res.status(200).json({ status: 'completed', tier: session.metadata.tier, sessionId });
      }
      return res.status(200).json({ status: session.payment_status, sessionId });
    } catch (e) {
      console.error('Stripe session retrieve error:', e);
    }
  }

  return res.status(200).json({ status: 'pending', tier: account.plan || 'free', accountPlan: account.plan || 'free' });
};