// ══════════════════════════════════════════════════════
// ZEN — Renderer video in BACKGROUND (gratis, senza key nel browser)
// POST /.netlify/functions/video-render-background
// body: { jobId, prompt, seconds }
// Risponde subito 202 e lavora fino a ~15 min (le function sincrone
// muoiono dopo ~10s: per questo i video fallivano sempre).
// Avanzamento e risultato in blob store "video-jobs" (letti da video-status).
// Il token HF_TOKEN resta SOLO nei secret Netlify, mai nel browser.
// ══════════════════════════════════════════════════════
const { getStore, connectLambda } = require('@netlify/blobs');
const { jsonResponse } = require('./_session');

const CASCADE = [
  { name: 'LTX-Video', model: 'Lightricks/LTX-Video' },
  { name: 'Wan T2V', model: 'Wan-AI/Wan2.1-T2V-1.3B-Diffusers' },
  { name: 'ModelScope T2V', model: 'damo-vilab/text-to-video-ms-1.7b' },
  { name: 'ZeroScope', model: 'cerspense/zeroscope_v2_576w' }
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

exports.handler = async (event) => {
  connectLambda(event);

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) { /* ignore */ }
  const jobId = String(body.jobId || '');
  const prompt = String(body.prompt || '').slice(0, 2000);
  const seconds = Math.max(2, Math.min(parseInt(body.seconds, 10) || 5, 10));

  const store = getStore('video-jobs');
  const fail = async (error) => {
    try { await store.setJSON(jobId, { state: 'error', error }); } catch (_) {}
    return jsonResponse(200, {});
  };
  if (!jobId || !prompt.trim()) return fail('Job non valido.');
  if (event.httpMethod !== 'POST') return fail('Metodo non permesso.');

  const HF_TOKEN = process.env.HF_TOKEN;
  if (!HF_TOKEN) return fail('HF_TOKEN non configurato nei secret di Netlify.');

  let lastErr = 'avvio';
  for (const m of CASCADE) {
    try { await store.setJSON(jobId, { state: 'working', detail: m.name }); } catch (_) {}
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`https://router.huggingface.co/hf-inference/models/${m.model}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${HF_TOKEN}`
          },
          body: JSON.stringify({ inputs: prompt, parameters: { num_frames: seconds * 8 } })
        });
        if (res.status === 503) {
          const info = await res.json().catch(() => ({}));
          await sleep(Math.min((info.estimated_time || 30), 180) * 1000);
          continue;
        }
        if (!res.ok) throw new Error(`${m.name}: HF ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf || buf.length < 2000) throw new Error(`${m.name}: risposta non valida`);
        await store.setJSON(jobId, {
          state: 'done',
          videoBase64: buf.toString('base64'),
          mimeType: res.headers.get('content-type') || 'video/mp4',
          model: m.name
        });
        return jsonResponse(200, {});
      } catch (e) { lastErr = e.message; }
    }
  }
  return fail(`Tutti i modelli video gratuiti sono occupati o offline. Ultimo errore: ${lastErr}`);
};
