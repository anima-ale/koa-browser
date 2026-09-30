const { jsonResponse, connectLambda } = require('./_zchat');
const { getVapidKeys } = require('./_vapid');

exports.handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});
  const keys = await getVapidKeys();
  return jsonResponse(200, { publicKey: keys.publicKey });
};
