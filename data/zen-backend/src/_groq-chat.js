// ══════════════════════════════════════════════════════
// ZEN — Proxy verso Groq (chat completions, anche vision)
// POST /groq-chat  body: { messages, model, temperature, max_tokens }
// La chiave resta SOLO nel secret Netlify groq_ultrasecret_potentissimo_api,
// mai nel browser. Senza secret risponde 500 e il client usa Pollinations gratis.
// ══════════════════════════════════════════════════════
const { cors, parseBody } = require('./_zchat');

const ALLOWED_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.6-27b',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'qwen-qwq-32b',
  'deepseek-r1-distill-llama-70b'
];

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non permesso.' });

  const GROQ_API_KEY = process.env.groq_ultrasecret_potentissimo_api;
  if (!GROQ_API_KEY) return res.status(500).json({ error: 'groq_ultrasecret_potentissimo_api non configurato nei secret di Netlify (Environment variables).' });

  const body = parseBody(req);
  if (!body || !Array.isArray(body.messages) || !body.messages.length) {
    return res.status(400).json({ error: 'Servono "messages" (array non vuoto).' });
  }

  const model = ALLOWED_MODELS.includes(body.model) ? body.model : 'openai/gpt-oss-120b';
  const temperature = Math.min(2, Math.max(0, Number(body.temperature) || 0.7));
  // Cap output per modello: il piano Groq gratuito ha ~8K TPM, chiedere 32K
  // in un colpo solo causa quasi sempre 429 rate-limit → meglio 8-16K affidabili.
  const MODEL_MAX_OUT = {
    'openai/gpt-oss-120b': 16384,
    'openai/gpt-oss-20b': 8192,
    'qwen/qwen3.6-27b': 8192,
    'llama-3.3-70b-versatile': 8192,
    'llama-3.1-8b-instant': 8192,
    'meta-llama/llama-4-scout-17b-16e-instruct': 8192,
    'meta-llama/llama-4-maverick-17b-128e-instruct': 8192,
    'qwen-qwq-32b': 16384,
    'deepseek-r1-distill-llama-70b': 8192
  };
  const cap = MODEL_MAX_OUT[model] || 8192;
  const max_tokens = Math.min(cap, Math.max(256, parseInt(body.max_tokens, 10) || 8192));
  // Ragionamento extra per Ultra/Think (supportato da gpt-oss, qwq, deepseek-r1)
  const reasoning_effort = ['low', 'medium', 'high'].includes(body.reasoning_effort)
    ? body.reasoning_effort
    : undefined;

  try {
    const groqBody = { model, messages: body.messages, temperature, max_tokens };
    if (reasoning_effort) groqBody.reasoning_effort = reasoning_effort;
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify(groqBody)
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      return res.status(r.status).json({ error: `Groq ${r.status}: ${errText.slice(0, 300)}` });
    }

    const data = await r.json();
    const text = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ text, model });
  } catch (e) {
    return res.status(502).json({ error: 'Errore chiamando Groq.', details: e.message });
  }
};
