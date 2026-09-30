// ══════════════════════════════════════════════════════
// ZEN — Stato di avanzamento rendering video
// GET /.netlify/functions/video-status?jobId=...
// Risponde { state:'pending'|'working'|'done'|'error', ... }.
// A lavoro finito il job viene cancellato dallo store.
// ══════════════════════════════════════════════════════
const { getStore, connectLambda } = require('@netlify/blobs');
const { jsonResponse } = require('./_session');

exports.handler = async (event) => {
  connectLambda(event);

  const jobId = String((event.queryStringParameters || {}).jobId || '');
  if (!jobId) return jsonResponse(400, { error: 'Serve jobId.' });

  const store = getStore('video-jobs');
  let job = null;
  try { job = await store.get(jobId, { type: 'json' }); } catch (_) { job = null; }
  if (!job) return jsonResponse(200, { state: 'pending' });

  if (job.state === 'done' || job.state === 'error') {
    try { await store.delete(jobId); } catch (_) {}
  }
  return jsonResponse(200, job);
};
