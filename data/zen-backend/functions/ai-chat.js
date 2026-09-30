const { getStore, connectLambda } = require('@netlify/blobs');
const { verifyToken, getTokenFromEvent, jsonResponse } = require('./_session');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const TIER_CONFIG = {
  free: {
    name: 'Free',
    engine: 'pollinations',
    model: null,
    limits: {
      messagesPerDay: Infinity,
      imagesPerDay: Infinity,
      videosPerMonth: Infinity,
      pdfsPerMonth: Infinity,
      quizzesPerMonth: Infinity,
      modelLimits: { zen6: Infinity, zen7: Infinity, 'zen7.5': Infinity }
    },
    features: { zchat: true, pdfCreator: true, quizEngine: true, devSuite: true, creatorContact: true }
  },
  plus: {
    name: 'ZEN Plus',
    engine: 'gemini',
    model: process.env.GEMINI_MODEL_PLUS || 'gemini-3.1-flash-lite',
    limits: {
      messagesPerDay: 100,
      imagesPerDay: 2,
      videosPerMonth: 0,
      pdfsPerMonth: 10,
      quizzesPerMonth: 10,
      modelLimits: { zen6: Infinity, zen7: 100, 'zen7.5': 100 }
    },
    features: { zchat: true, pdfCreator: true, quizEngine: true, quizEsame: true, spiegameloSemplice: true, devSuite: false, creatorContact: false }
  },
  pro: {
    name: 'ZEN Pro',
    engine: 'gemini',
    model: process.env.GEMINI_MODEL_PRO || 'gemini-3.5-flash',
    limits: {
      messagesPerDay: 1000,
      imagesPerDay: 25,
      videosPerMonth: 5,
      pdfsPerMonth: Infinity,
      quizzesPerMonth: Infinity,
      modelLimits: { zen6: Infinity, zen7: Infinity, 'zen7.5': 1000 }
    },
    features: { zchat: true, pdfCreator: true, quizEngine: true, quizEsame: true, spiegameloSemplice: true, devSuite: true, creatorContact: false }
  },
  unreal: {
    name: 'ZEN Unreal',
    engine: 'gemini',
    model: process.env.GEMINI_MODEL_UNREAL || 'gemini-3.6-flash',
    limits: {
      messagesPerDay: 999999,
      imagesPerDay: 100,
      videosPerMonth: 30,
      pdfsPerMonth: Infinity,
      quizzesPerMonth: Infinity,
      modelLimits: { zen6: 999999, zen7: 999999, 'zen7.5': 999999 }
    },
    features: { zchat: true, pdfCreator: true, quizEngine: true, quizEsame: true, spiegameloSemplice: true, devSuite: true, zenithEarlyAccess: true, priorityGpu: true, creatorContact: true }
  }
};

function getCurrentDayKey() {
  return new Date().toISOString().split('T')[0];
}

function getCurrentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function checkModelLimit(tier, modelKey, usage) {
  const config = TIER_CONFIG[tier] || TIER_CONFIG.free;
  const normalizedKey = (modelKey || 'zen6').toLowerCase().replace('zen ', '').replace('zen', 'zen');
  const key = normalizedKey.includes('7.5') ? 'zen7.5' : normalizedKey.includes('7') ? 'zen7' : 'zen6';
  
  const limit = config.limits.modelLimits[key] ?? Infinity;
  if (limit === 0) {
    return { ok: false, reason: 'MODEL_NOT_AVAILABLE', limit: 0, modelName: key.toUpperCase() };
  }
  if (limit === Infinity) {
    return { ok: true, remaining: Infinity };
  }

  const counts = usage?.counts || {};
  const dayKey = getCurrentDayKey();
  const usageKey = `msg_${key}`;
  const used = counts[dayKey]?.[usageKey] || 0;
  return { ok: used < limit, remaining: Math.max(0, limit - used), limit, used, modelName: key.toUpperCase() };
}

function incrementUsage(usage, kind, modelKey) {
  if (!usage) usage = { date: getCurrentDayKey(), month: new Date().getMonth(), counts: {}, monthlyCounts: {} };
  const dayKey = getCurrentDayKey();
  const monthKey = getCurrentMonthKey();
  usage.counts = usage.counts || {};
  usage.monthlyCounts = usage.monthlyCounts || {};
  usage.counts[dayKey] = usage.counts[dayKey] || {};
  usage.monthlyCounts[monthKey] = usage.monthlyCounts[monthKey] || {};
  
  usage.counts[dayKey][kind] = (usage.counts[dayKey][kind] || 0) + 1;
  usage.monthlyCounts[monthKey][kind] = (usage.monthlyCounts[monthKey][kind] || 0) + 1;

  if (modelKey) {
    const normalizedKey = modelKey.toLowerCase().includes('7.5') ? 'zen7.5' : modelKey.toLowerCase().includes('7') ? 'zen7' : 'zen6';
    const usageKey = `msg_${normalizedKey}`;
    usage.counts[dayKey][usageKey] = (usage.counts[dayKey][usageKey] || 0) + 1;
  }
  return usage;
}

async function callGemini(prompt, model, systemPrompt, history, attachments) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY non configurato su Netlify (Environment variables).');
  }

  const contents = [];
  if (systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
    contents.push({ role: 'model', parts: [{ text: 'Capito. Sono pronto.' }] });
  }

  for (const msg of (history || [])) {
    const role = msg.role === 'user' ? 'user' : 'model';
    const parts = [];
    if (msg.content) parts.push({ text: msg.content });
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
      generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
    })
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '⚠️ Risposta vuota da Gemini.';
}

async function callPollinationsText(messages) {
  const systemMsg = messages.find(m => m.role === 'system');
  const history = messages.filter(m => m.role !== 'system');
  const body = {
    messages: systemMsg ? [systemMsg, ...history] : history,
    model: 'openai',
    seed: Math.floor(Math.random() * 99999),
    stream: false
  };
  const res = await fetch('https://text.pollinations.ai/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    if (res.status === 503 || res.status === 429) {
      throw new Error('BANDA_PUBBLICA_SATURA');
    }
    const err = await res.text().catch(() => '');
    throw new Error(`Pollinations error ${res.status}: ${err.slice(0, 300)}`);
  }
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return json.choices?.[0]?.message?.content || text;
  } catch (e) {
    return text;
  }
}

exports.handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Metodo non permesso.' });

  const token = getTokenFromEvent(event);
  const payload = verifyToken(token);
  if (!payload || !payload.username) return jsonResponse(401, { error: 'Sessione non valida. Accedi di nuovo.' });

  const store = getStore('user_account_blob');
  const key = `user:${payload.username}`;
  let account = await store.get(key, { type: 'json' });
  if (!account) {
    const legacyStore = getStore('zen-accounts');
    account = await legacyStore.get(key, { type: 'json' });
  }
  if (!account) return jsonResponse(404, { error: 'Account non trovato.' });

  const tier = account.plan || 'free';
  const config = TIER_CONFIG[tier] || TIER_CONFIG.free;

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}
  const { mode, prompt, modelKey, attachments, chatHistory } = body;

  if (!mode || !prompt) return jsonResponse(400, { error: 'Servono "mode" e "prompt".' });

  // Controllo disponibilità modello e limiti specifici (ZEN 6, ZEN 7, ZEN 7.5)
  const targetModel = modelKey || 'zen6';
  const modelCheck = checkModelLimit(tier, targetModel, account.usage);

  if (!modelCheck.ok) {
    if (modelCheck.reason === 'MODEL_NOT_AVAILABLE') {
      return jsonResponse(403, {
        error: `I modelli ZEN 7 e ZEN 7.5 non sono disponibili nel piano Free. Passa a ZEN Plus per sbloccarli!`,
        needsUpgrade: true,
        tier
      });
    }
    return jsonResponse(429, {
      error: `Hai raggiunto il limite giornaliero per ${modelCheck.modelName} nel piano ${config.name}. Passa a un piano superiore per messaggi illimitati!`,
      needsUpgrade: true,
      tier
    });
  }

  try {
    let text = '';
    const uiModelLabel = targetModel.toUpperCase().includes('7.5') ? 'ZEN 7.5' : targetModel.toUpperCase().includes('7') ? 'ZEN 7' : 'ZEN 6';
    const systemPrompt = `Sei ${uiModelLabel}, l'IA personale dell'utente. Rispondi in modo completo, accurato e ben strutturato. Usa emoji dove appropriato.`;

    if (config.engine === 'pollinations') {
      text = await callPollinationsText([
        { role: 'system', content: systemPrompt },
        ...(chatHistory || []),
        { role: 'user', content: prompt }
      ]);
    } else {
      text = await callGemini(prompt, config.model, systemPrompt, chatHistory, attachments);
    }

    const updatedUsage = incrementUsage(account.usage, 'messagesPerDay', targetModel);
    account.usage = updatedUsage;
    await store.setJSON(key, account);

    return jsonResponse(200, {
      text,
      tier,
      usage: updatedUsage
    });
  } catch (e) {
    if (e.message === 'BANDA_PUBBLICA_SATURA') {
      return jsonResponse(503, {
        error: 'Banda pubblica satura. Passa a ZEN Plus per accedere alla corsia preferenziale.',
        needsUpgrade: true,
        tier: 'free'
      });
    }
    console.error('AI Chat Error:', e);
    return jsonResponse(502, { error: e.message || 'Errore durante la generazione.', needsUpgrade: false });
  }
};
