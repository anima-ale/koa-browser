// ══════════════════════════════════════════════════════
// ZEN — Proxy verso Hugging Face, specialista CODING (chat completions)
// POST /.netlify/functions/hf-code
// body: { messages, model, temperature, max_tokens }
// La chiave resta SOLO nel secret Netlify hf_coder_ultrasecret_potentissimo_api,
// mai nel browser. Senza secret risponde 500 e il client salta al ramo successivo.
// Prendi un token gratuito (basta "read") su https://huggingface.co/settings/tokens
// e incollalo in Netlify → Site settings → Environment variables con nome:
// hf_coder_ultrasecret_potentissimo_api
// Free tier 2026 ≈ $0.10/mese di crediti: perfetto per coder medio-piccoli,
// i mostri 400B+ lo bruciano in poche risposte lunghe.
// ══════════════════════════════════════════════════════
const { jsonResponse } = require('./_session');

const ALLOWED_CODE_MODELS = [
  'Qwen/Qwen3-Coder-30B-A8B-Instruct',
  'Qwen/Qwen2.5-Coder-32B-Instruct',
  'Qwen/Qwen3-Coder-480B-A35B-Instruct'
];
const DEFAULT_CODE_MODEL = 'Qwen/Qwen3-Coder-30B-A8B-Instruct';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Metodo non permesso.' });

  const HF_CODER_KEY = process.env.hf_coder_ultrasecret_potentissimo_api;
  if (!HF_CODER_KEY) return jsonResponse(500, { error: 'hf_coder_ultrasecret_potentissimo_api non configurato nei secret di Netlify (Environment variables).' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return jsonResponse(400, { error: 'JSON non valido.' }); }

  if (!body || !Array.isArray(body.messages) || !body.messages.length) {
    return jsonResponse(400, { error: 'Servono "messages" (array non vuoto).' });
  }

  const model = ALLOWED_CODE_MODELS.includes(body.model) ? body.model : DEFAULT_CODE_MODEL;
  const temperature = Math.min(2, Math.max(0, Number(body.temperature) || 0.4));
  const max_tokens = Math.min(16384, Math.max(256, parseInt(body.max_tokens, 10) || 8192));

  try {
    const r = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${HF_CODER_KEY}`
      },
      body: JSON.stringify({ model, messages: body.messages, temperature, max_tokens, stream: false })
    });

    // Modello in cold-start: rigira stima al client che può ritentare una volta
    if (r.status === 503) {
      const info = await r.json().catch(() => ({}));
      return jsonResponse(503, { loading: true, estimated_time: info.estimated_time || 20 });
    }

    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      return jsonResponse(r.status, { error: `HF ${r.status}: ${errText.slice(0, 300)}` });
    }

    const data = await r.json();
    const text = data.choices?.[0]?.message?.content || '';
    return jsonResponse(200, { text, model });
  } catch (e) {
    return jsonResponse(502, { error: 'Errore chiamando Hugging Face.', details: e.message });
  }
};
