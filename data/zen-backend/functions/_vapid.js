const webpush = require('web-push');
const { getStore } = require('@netlify/blobs');

const SUB_EMAIL = 'mailto:zen@zchat.app';
let cachedKeys = null;

async function getVapidKeys() {
  if (cachedKeys) return cachedKeys;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (pub && priv) {
    cachedKeys = { publicKey: pub, privateKey: priv };
    return cachedKeys;
  }
  const store = getStore('zchat-push-vapid');
  const stored = await store.get('keys', { type: 'json' });
  if (stored?.publicKey && stored?.privateKey) {
    cachedKeys = stored;
    return stored;
  }
  const generated = webpush.generateVAPIDKeys();
  await store.setJSON('keys', generated);
  cachedKeys = generated;
  return generated;
}

async function initWebPush() {
  const keys = await getVapidKeys();
  webpush.setVapidDetails(SUB_EMAIL, keys.publicKey, keys.privateKey);
  return keys;
}

module.exports = { getVapidKeys, initWebPush };
