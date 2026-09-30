const { cors } = require('./_zchat');
const { getVapidKeys } = require('./_vapid');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const keys = await getVapidKeys();
  res.status(200).json({ publicKey: keys.publicKey });
};
