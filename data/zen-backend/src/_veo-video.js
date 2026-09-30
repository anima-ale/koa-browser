// ══════════════════════════════════════════════════════
// ZEN — Proxy verso Google Veo 3.1 (video con audio nativo)
// POST /veo-video
//   start:  { action:'start', model, prompt, aspectRatio, durationSeconds, resolution }
//   status: { action:'status', model, operation }
// La chiave resta SOLO nel secret Netlify google_ultrasecret_potentissimo_api,
// mai nel browser. Senza secret risponde 500 e il client usa il motore gratis.
// ══════════════════════════════════════════════════════
const { cors, parseBody } = require('./_zchat');

const ALLOWED_MODELS = [
  'veo-3.1-lite-generate-preview',
  'veo-3.1-fast-generate-preview',
  'veo-3.1-generate-preview'
];

function getKey() {
  return process.env.google_ultrasecret_potentissimo_api || '';
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non permesso.' });

  const KEY = getKey();
  if (!KEY) return res.status(500).json({ error: 'google_ultrasecret_potentissimo_api non configurato nei secret di Netlify (Environment variables).' });

  const body = parseBody(req);
  if (!body || (body.action !== 'start' && body.action !== 'status')) {
    return res.status(400).json({ error: 'Serve "action": "start" oppure "status".' });
  }
  const model = ALLOWED_MODELS.includes(body.model) ? body.model : ALLOWED_MODELS[0];

  try {
    if (body.action === 'start') {
      const prompt = String(body.prompt || '').slice(0, 2000);
      if (!prompt.trim()) return res.status(400).json({ error: 'Serve "prompt".' });
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
        return res.status(r.status).json({ error: `Veo start ${r.status}: ${t.slice(0, 300)}` });
      }
      const data = await r.json();
      if (!data.name) return res.status(502).json({ error: 'Veo: operazione non avviata.' });
      return res.status(200).json({ operation: data.name });
    }

    // action === 'status'
    if (!body.operation) return res.status(400).json({ error: 'Serve "operation".' });
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:fetchPredictOperation?key=${encodeURIComponent(KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationName: body.operation })
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return res.status(r.status).json({ error: `Veo status ${r.status}: ${t.slice(0, 300)}` });
    }
    const data = await r.json();
    if (data.error) return res.status(200).json({ done: true, error: data.error.message || 'Errore Veo' });
    if (!data.done) return res.status(200).json({ done: false });

    const uri = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
    if (!uri) return res.status(200).json({ done: true, error: 'Video vuoto' });

    const sep = uri.includes('?') ? '&' : '?';
    const dl = await fetch(`${uri}${sep}key=${encodeURIComponent(KEY)}`);
    if (!dl.ok) return res.status(200).json({ done: true, error: `Download video ${dl.status}` });
    const buf = Buffer.from(await dl.arrayBuffer());
    if (buf.length < 2000) return res.status(200).json({ done: true, error: 'Video non valido' });

    return res.status(200).json({
      done: true,
      videoBase64: buf.toString('base64'),
      mimeType: dl.headers.get('content-type') || 'video/mp4'
    });
  } catch (e) {
    return res.status(502).json({ error: 'Errore chiamando Veo.', details: e.message });
  }
};
