// ══════════════════════════════════════════════════════
// ZEN — Proxy verso Hugging Face Inference API
// POST /.netlify/functions/hf-proxy
// body: { model: "facebook/musicgen-melody", inputs: "...", parameters: {...} }
// Il token HF_TOKEN resta SOLO su Netlify (Environment variables), mai nel browser.
// Prendine uno gratuito su https://huggingface.co/settings/tokens (basta "read").
// ══════════════════════════════════════════════════════
const { jsonResponse } = require('./_session');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Metodo non permesso.' });

  const HF_TOKEN = process.env.HF_TOKEN;
  if (!HF_TOKEN) return jsonResponse(500, { error: 'HF_TOKEN non configurato su Netlify (Environment variables).' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return jsonResponse(400, { error: 'JSON non valido.' }); }

  const { model, inputs, parameters } = body;
  if (!model || !inputs) return jsonResponse(400, { error: 'Servono "model" e "inputs".' });

  try {
    const hfRes = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${HF_TOKEN}`
      },
      body: JSON.stringify({ inputs, parameters })
    });

    // Modello in warm-up: rigira l'informazione al client così può ritentare con countdown
    if (hfRes.status === 503) {
      const info = await hfRes.json().catch(() => ({}));
      return jsonResponse(503, { loading: true, estimated_time: info.estimated_time || 20 });
    }

    if (!hfRes.ok) {
      const errText = await hfRes.text().catch(() => '');
      return jsonResponse(hfRes.status, { error: `HF ${model} ha risposto ${hfRes.status}`, details: errText.slice(0, 300) });
    }

    const contentType = hfRes.headers.get('content-type') || 'application/octet-stream';
    const buf = Buffer.from(await hfRes.arrayBuffer());

    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      },
      body: buf.toString('base64'),
      isBase64Encoded: true
    };
  } catch (e) {
    return jsonResponse(502, { error: 'Errore chiamando Hugging Face.', details: e.message });
  }
};
