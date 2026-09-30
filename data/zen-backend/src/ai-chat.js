const { getAccount, setAccount } = require('./_db');
const { verifyToken, getTokenFromReq, cors } = require('./_zchat');
const { getTierConfig, incrementUsage, checkLimit, getUpgradeMessage, canAccessFeature } = require('./_tiers');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function callGemini(prompt, model, systemPrompt, history, attachments) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY non configurato su Netlify (Environment variables).');
  }

  const contents = [];

  if (systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
    contents.push({ role: 'model', parts: [{ text: 'Capito. Sono pronto.' }] });
  }

  for (const msg of history) {
    const role = msg.role === 'user' ? 'user' : 'model';
    const parts = [];
    if (msg.content) parts.push({ text: msg.content });
    if (msg.mediaUrls) {
      for (const url of msg.mediaUrls) {
        if (url.startsWith('data:image/')) {
          const mimeType = url.split(';')[0].split(':')[1];
          const data = url.split(',')[1];
          parts.push({ inlineData: { mimeType, data } });
        }
      }
    }
    if (parts.length > 0) contents.push({ role, parts });
  }

  if (attachments && attachments.length > 0) {
    const lastUserIdx = contents.findLastIndex(c => c.role === 'user');
    if (lastUserIdx >= 0) {
      for (const att of attachments) {
        if (att.type?.startsWith('image/') && att.data) {
          const b64 = att.data.includes(',') ? att.data.split(',')[1] : att.data;
          contents[lastUserIdx].parts.push({ inlineData: { mimeType: att.type, data: b64 } });
        }
      }
    }
  }

  contents.push({ role: 'user', parts: [{ text: prompt }] });

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
      }
    })
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '⚠️ Risposta vuota da Gemini.';
}

const POLLINATIONS_CASCADE = ['openai', 'mistral', 'qwen', 'llama', 'deepseek'];

async function callPollinationsText(messages) {
  const systemMsg = messages.find(m => m.role === 'system');
  const history = messages.filter(m => m.role !== 'system');
  const formattedMessages = systemMsg ? [systemMsg, ...history] : history;

  for (const model of POLLINATIONS_CASCADE) {
    try {
      const body = {
        messages: formattedMessages,
        model,
        seed: Math.floor(Math.random() * 99999),
        stream: false
      };
      const res = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const text = await res.text();
        let reply = text.trim();
        if (reply.startsWith('{') && reply.endsWith('}')) {
          try {
            const data = JSON.parse(reply);
            reply = data.choices?.[0]?.message?.content || data.text || reply;
          } catch (_) {}
        }
        if (reply && reply.length > 0 && !reply.includes('rate limit') && !reply.includes('Service Unavailable')) {
          return reply;
        }
      }
    } catch (err) {
      console.warn(`Pollinations model ${model} error, trying next:`, err.message);
    }
  }

  // Backup GET se POST non ha restituito nulla
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  const promptText = typeof lastUser?.content === 'string' ? lastUser.content : 'Ciao';
  try {
    const res = await fetch(`https://text.pollinations.ai/${encodeURIComponent(promptText)}?model=openai`);
    if (res.ok) {
      const txt = await res.text();
      if (txt && txt.trim()) return txt.trim();
    }
  } catch (_) {}

  return 'Sono pronto ad aiutarti. Come posso esserti utile?';
}

async function callPollinationsImage(prompt, count = 1) {
  const imgs = [];
  for (let i = 0; i < count; i++) {
    const seed = Math.floor(Math.random() * 999999) + i;
    const encodedPrompt = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&seed=${seed}&nologo=true&enhance=true&model=flux`;
    imgs.push(url);
  }
  return imgs;
}

async function callHFVideo(prompt, seconds) {
  const HF_TOKEN = process.env.HF_TOKEN;
  if (!HF_TOKEN) throw new Error('HF_TOKEN non configurato');

  const models = [
    { name: 'ModelScope T2V', model: 'damo-vilab/text-to-video-ms-1.7b' },
    { name: 'ZeroScope', model: 'cerspense/zeroscope_v2_576w' }
  ];

  for (const m of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch('https://router.huggingface.co/hf-inference/models/' + m.model, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HF_TOKEN}` },
          body: JSON.stringify({ inputs: prompt, parameters: { num_frames: seconds * 8 } })
        });
        if (res.status === 503) {
          const info = await res.json().catch(() => ({}));
          const wait = Math.min((info.estimated_time || 20) * 1000, 30000);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        if (!res.ok) throw new Error(`${m.name} non disponibile (${res.status})`);
        const blob = await res.blob();
        if (!blob || blob.size < 2000) throw new Error(`${m.name}: risposta non valida`);
        return URL.createObjectURL(blob);
      } catch (e) { /* next */ }
    }
  }
  throw new Error('Tutti i modelli video gratuiti sono occupati o offline. Riprova tra qualche minuto.');
}

async function callHFMusic(prompt, duration) {
  const HF_TOKEN = process.env.HF_TOKEN;
  if (!HF_TOKEN) throw new Error('HF_TOKEN non configurato');

  const models = ['facebook/musicgen-melody', 'facebook/musicgen-small'];
  for (const model of models) {
    try {
      const res = await fetch('https://router.huggingface.co/hf-inference/models/' + model, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HF_TOKEN}` },
        body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: duration * 50 } })
      });
      if (res.ok) {
        const blob = await res.blob();
        if (blob.type.startsWith('audio') || blob.size >= 1000) return URL.createObjectURL(blob);
      }
    } catch (e) { /* next */ }
  }
  throw new Error('Modelli musicali non disponibili.');
}

function buildSystemPrompt(tier, modelKey) {
  const isThink = modelKey?.includes('think') || modelKey?.includes('ultra');
  return `Sei ZEN ${tier === 'free' ? '6' : tier.toUpperCase()}, l'IA personale dell'utente. ${isThink ? 'Esegui un ragionamento lento, sistematico e multi-step prima di rispondere.' : 'Rispondi in modo completo, accurato e ben strutturato.'} Usa emoji dove appropriato.`;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non permesso.' });

  const token = getTokenFromReq(req);
  const payload = verifyToken(token);
  if (!payload || !payload.username) return res.status(401).json({ error: 'Sessione non valida. Accedi di nuovo.' });

  const account = await getAccount(payload.username);
  if (!account) return res.status(404).json({ error: 'Account non trovato.' });

  const tier = account.plan || 'free';
  const config = getTierConfig(tier);

  const body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.body || '{}');
  const { mode, prompt, modelKey, attachments, chatHistory } = body;

  if (!mode || !prompt) return res.status(400).json({ error: 'Servono "mode" e "prompt".' });

  let kind;
  switch (mode) {
    case 'text': kind = 'messagesPerDay'; break;
    case 'image': kind = 'imagesPerDay'; break;
    case 'video': kind = 'videosPerMonth'; break;
    case 'music': kind = 'videosPerMonth'; break;
    case 'pdf': kind = 'pdfsPerMonth'; break;
    case 'quiz': kind = 'quizzesPerMonth'; break;
    default: return res.status(400).json({ error: 'Mode non supportato.' });
  }

  if (!canAccessFeature(tier, mode === 'image' ? 'pdfCreator' : mode === 'quiz' ? 'quizEngine' : true)) {
    return res.status(403).json({ error: getUpgradeMessage(tier, kind), needsUpgrade: true, tier });
  }

  const limitCheck = checkLimit(tier, kind, account.usage);
  if (!limitCheck.ok) {
    return res.status(429).json({ error: getUpgradeMessage(tier, kind), needsUpgrade: true, tier, limit: limitCheck });
  }

  try {
    let result = { text: '', mediaUrls: [] };

    if (mode === 'text') {
      if (config.engine === 'pollinations') {
        result.text = await callPollinationsText([
          { role: 'system', content: buildSystemPrompt(tier, modelKey) },
          ...(chatHistory || []),
          { role: 'user', content: prompt }
        ]);
      } else {
        result.text = await callGemini(prompt, config.model, buildSystemPrompt(tier, modelKey), chatHistory || [], attachments);
      }
    } else if (mode === 'image') {
      if (!canAccessFeature(tier, 'pdfCreator')) {
        return res.status(403).json({ error: getUpgradeMessage(tier, 'imagesPerDay'), needsUpgrade: true, tier });
      }
      result.mediaUrls = await callPollinationsImage(prompt, 1);
      result.text = '✨ Immagine creata!';
    } else if (mode === 'video') {
      const seconds = Math.min(Math.max(parseInt(body.duration) || 5, 2), 10);
      const videoUrl = await callHFVideo(prompt, seconds);
      result.mediaUrls = [videoUrl];
      result.text = '🎬 Video creato con successo!';
    } else if (mode === 'music') {
      const duration = Math.min(Math.max(parseInt(body.duration) || 30, 5), 60);
      const audioUrl = await callHFMusic(prompt, duration);
      result.mediaUrls = [audioUrl];
      result.text = '🎵 Musica creata con successo!';
    } else if (mode === 'pdf') {
      return res.status(501).json({ error: 'PDF Creator va chiamato via endpoint dedicato.', needsUpgrade: false });
    } else if (mode === 'quiz') {
      return res.status(501).json({ error: 'Quiz Engine va chiamato via endpoint dedicato.', needsUpgrade: false });
    }

    const updatedUsage = incrementUsage(account.usage, kind);
    await setAccount(payload.username, { ...account, usage: updatedUsage });

    return res.status(200).json({
      ...result,
      tier,
      usage: updatedUsage,
      limits: {
        [kind]: { used: limitCheck.used + 1, limit: limitCheck.limit, remaining: limitCheck.remaining - 1 }
      }
    });
  } catch (e) {
    console.error('AI Chat error:', e);
    return res.status(502).json({ error: e.message || 'Errore durante la generazione.', needsUpgrade: false });
  }
};