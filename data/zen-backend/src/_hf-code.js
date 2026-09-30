// ══════════════════════════════════════════════════════
// ZEN — Proxy verso Hugging Face, specialista CODING (chat completions)
// POST /hf-code  body: { messages, model, temperature, max_tokens }
// La chiave resta SOLO nel secret hf_coder_ultrasecret_potentissimo_api,
// mai nel browser. Senza secret risponde 500 e il client salta al ramo successivo.
// ══════════════════════════════════════════════════════
const { cors, parseBody } = require('./_zchat');

const ALLOWED_CODE_MODELS = [
  'Qwen/Qwen3-Coder-30B-A8B-Instruct',
  'Qwen/Qwen2.5-Coder-32B-Instruct',
  'Qwen/Qwen3-Coder-480B-A35B-Instruct'
];
const DEFAULT_CODE_MODEL = 'Qwen/Qwen3-Coder-30B-A8B-Instruct';

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non permesso.' });

  const HF_CODER_KEY = process.env.hf_coder_ultrasecret_potentissimo_api;
  if (!HF_CODER_KEY) return res.status(500).json({ error: 'hf_coder_ultrasecret_potentissimo_api non configurato nei secret (Environment variables).' });

  const body = parseBody(req);
  if (!body || !Array.isArray(body.messages) || !body.messages.length) {
    return res.status(400).json({ error: 'Servono "messages" (array non vuoto).' });
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

    if (r.status === 503) {
      const info = await r.json().catch(() => ({}));
      return res.status(503).json({ loading: true, estimated_time: info.estimated_time || 20 });
    }

    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      return res.status(r.status).json({ error: `HF ${r.status}: ${errText.slice(0, 300)}` });
    }

    const data = await r.json();
    const text = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ text, model });
  } catch (e) {
    return res.status(502).json({ error: 'Errore chiamando Hugging Face.', details: e.message });
  }
};
