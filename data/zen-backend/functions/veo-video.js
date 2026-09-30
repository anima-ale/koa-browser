// ══════════════════════════════════════════════════════
// ZEN — Proxy verso Google Veo 3.1 (video con audio nativo)
// POST /.netlify/functions/veo-video
//   start:  { action:'start', model, prompt, aspectRatio, durationSeconds, resolution }
//   status: { action:'status', model, operation }
// La chiave resta SOLO nel secret Netlify google_ultrasecret_potentissimo_api,
// mai nel browser. Senza secret risponde 500 e il client usa il motore gratis.
// ══════════════════════════════════════════════════════
const { jsonResponse } = require('./_session');

const ALLOWED_MODELS = [
  'veo-3.1-lite-generate-preview',
  'veo-3.1-fast-generate-preview',
  'veo-3.1-generate-preview'
];

function getKey() {
  return process.env.google_ultrasecret_potentissimo_api || '';
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Metodo non permesso.' });

  const KEY = getKey();
  if (!KEY) return jsonResponse(500, { error: 'google_ultrasecret_potentissimo_api non configurato nei secret di Netlify (Environment variables).' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return jsonResponse(400, { error: 'JSON non valido.' }); }

  if (!body || (body.action !== 'start' && body.action !== 'status')) {
    return jsonResponse(400, { error: 'Serve "action": "start" oppure "status".' });
  }
  const model = ALLOWED_MODELS.includes(body.model) ? body.model : ALLOWED_MODELS[0];

  try {
    if (body.action === 'start') {
      const prompt = String(body.prompt || '').slice(0, 2000);
      if (!prompt.trim()) return jsonResponse(400, { error: 'Serve "prompt".' });
      const aspectRatio = body.aspectRatio === '9:16' ? '9:16' : '16:9';
      const d = parseInt(body.durationSeconds, 10) || 8;
      const durationSeconds = d <= 4 ? 4 : (d <= 6 ? 6 : 8);
      const resolution = body.resolution === '1080p' ? '1080p' : '720p';

      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning?key=${encodeURIComponent(KEY)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            aspectRatio,
            durationSeconds,
            resolution,
            personGeneration: 'allow_adult',
            generateAudio: true
          }
        })
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        return jsonResponse(r.status, { error: `Veo start ${r.status}: ${t.slice(0, 300)}` });
      }
      const data = await r.json();
      if (!data.name) return jsonResponse(502, { error: 'Veo: operazione non avviata.' });
      return jsonResponse(200, { operation: data.name });
    }

    // action === 'status'
    if (!body.operation) return jsonResponse(400, { error: 'Serve "operation".' });
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:fetchPredictOperation?key=${encodeURIComponent(KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationName: body.operation })
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return jsonResponse(r.status, { error: `Veo status ${r.status}: ${t.slice(0, 300)}` });
    }
    const data = await r.json();
    if (data.error) return jsonResponse(200, { done: true, error: data.error.message || 'Errore Veo' });
    if (!data.done) return jsonResponse(200, { done: false });

    const uri = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
    if (!uri) return jsonResponse(200, { done: true, error: 'Video vuoto' });

    const sep = uri.includes('?') ? '&' : '?';
    const dl = await fetch(`${uri}${sep}key=${encodeURIComponent(KEY)}`);
    if (!dl.ok) return jsonResponse(200, { done: true, error: `Download video ${dl.status}` });
    const buf = Buffer.from(await dl.arrayBuffer());
    if (buf.length < 2000) return jsonResponse(200, { done: true, error: 'Video non valido' });

    return jsonResponse(200, {
      done: true,
      videoBase64: buf.toString('base64'),
      mimeType: dl.headers.get('content-type') || 'video/mp4'
    });
  } catch (e) {
    return jsonResponse(502, { error: 'Errore chiamando Veo.', details: e.message });
  }
};
