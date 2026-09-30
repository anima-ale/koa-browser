const { cors, parseBody } = require('./_zchat');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non permesso.' });

  const HF_TOKEN = process.env.HF_TOKEN;
  if (!HF_TOKEN) return res.status(500).json({ error: 'HF_TOKEN non configurato (Environment variables su Vercel).' });

  const body = parseBody(req);
  if (!body) return res.status(400).json({ error: 'JSON non valido.' });

  const { model, inputs, parameters } = body;
  if (!model || !inputs) return res.status(400).json({ error: 'Servono "model" e "inputs".' });

  try {
    const hfRes = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${HF_TOKEN}`
      },
      body: JSON.stringify({ inputs, parameters })
    });

    if (hfRes.status === 503) {
      const info = await hfRes.json().catch(() => ({}));
      return res.status(503).json({ loading: true, estimated_time: info.estimated_time || 20 });
    }

    if (!hfRes.ok) {
      const errText = await hfRes.text().catch(() => '');
      return res.status(hfRes.status).json({ error: `HF ${model} ha risposto ${hfRes.status}`, details: errText.slice(0, 300) });
    }

    const contentType = hfRes.headers.get('content-type') || 'application/octet-stream';
    const buf = Buffer.from(await hfRes.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    res.status(200).send(buf.toString('base64'));
  } catch (e) {
    res.status(502).json({ error: 'Errore chiamando Hugging Face.', details: e.message });
  }
};
