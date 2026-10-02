// ================= KOA Autonomia: micromodelli locali + agente + aura =================
// Tre micromodelli sul PC (pianificatore, italiano, azioni). Pesi in CacheStorage,
// registro in localStorage, verifica reale a ogni avvio. Niente cloud, niente emoji.
const KOA_MODELS = [
  { id: 'SmolLM2-360M-Instruct-q4f16_1-MLC', label: 'Pianificatore', sub: '360M · ~300MB · scompone i comandi', role: 'planner', gb: 0.3 },
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', label: 'Italiano', sub: '0.5B · ~400MB · capisce e riassume', role: 'italiano', gb: 0.4 },
  { id: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC', label: 'Azioni web', sub: '1.5B · ~1GB · clic e moduli', role: 'azioni', gb: 1 },
  { id: 'Phi-3.5-vision-instruct-q4f16_1-MLC', label: 'Occhi', sub: '3.5B vision · ~2.5GB · vede lo schermo', role: 'occhi', gb: 2.5 }
];
let koaEngines = {}, koaEnginesLoading = {};

function autonomyReg() {
  try {
    const r = JSON.parse(localStorage.getItem('koa.autonomy') || 'null');
    if (r && typeof r === 'object') return r;
  } catch (e) {}
  return {};
}
function autonomySave(reg) {
  try { localStorage.setItem('koa.autonomy', JSON.stringify(reg)); } catch (e) {}
}
// Verifica reale: config + indice tensori sotto il percorso del modello.
// (WebLLM attuale usa tensor-cache.json; ndarray-cache.json era il formato vecchio.)
async function autonomyVerify(id) {
  try {
    if (!('caches' in window)) return false;
    const base = id.replace(/-mlc$/i, '').toLowerCase();
    const keys = await caches.keys();
    let cfg = false, wNew = false, wOld = false;
    outer:
    for (const k of keys) {
      try {
        const c = await caches.open(k);
        const rs = await c.keys();
        for (const r of rs) {
          const u = (r.url || '').toLowerCase();
          if (u.indexOf(base) === -1) continue;
          if (u.indexOf('mlc-chat-config.json') !== -1) cfg = true;
          if (u.indexOf('tensor-cache.json') !== -1) wNew = true;
          if (u.indexOf('ndarray-cache.json') !== -1) wOld = true;
          if (cfg && (wNew || wOld)) break outer;
        }
      } catch (e) {}
    }
    return cfg && (wNew || wOld);
  } catch (e) { return false; }
}
async function autonomyStatus() {
  const reg = autonomyReg();
  const out = {};
  for (const m of KOA_MODELS) {
    const ok = await autonomyVerify(m.id);
    const prev = reg[m.id] || {};
    out[m.id] = { state: ok ? 'ok' : 'no', size: prev.size || '', at: ok ? (prev.at || Date.now()) : 0 };
  }
  autonomySave(out);
  return out;
}
async function koaLocalChat(modelId, messages, maxTokens, onProgress) {
  if (koaEngines[modelId]) return koaEngines[modelId];
  if (koaEnginesLoading[modelId]) {
    await koaEnginesLoading[modelId];
    if (koaEngines[modelId]) return koaEngines[modelId];
  }
  koaEnginesLoading[modelId] = (async () => {
    const { CreateMLCEngine } = await import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm/+esm');
    const eng = await CreateMLCEngine(modelId, {
      initProgressCallback: (p) => { try { onProgress && onProgress(Math.round((p.progress || 0) * 100)); } catch (e) {} }
    });
    koaEngines[modelId] = eng;
  })();
  try { await koaEnginesLoading[modelId]; } finally { koaEnginesLoading[modelId] = null; }
  if (!koaEngines[modelId]) throw new Error('motore non avviato');
  const eng = koaEngines[modelId];
  const out = await Promise.race([
    eng.chat.completions.create({ messages, temperature: 0.2, top_p: 0.9, max_tokens: maxTokens || 1024 }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout modello (300s)')), 300000))
  ]);
  const text = out && out.choices && out.choices[0] && out.choices[0].message && out.choices[0].message.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('risposta vuota');
  return text.trim();
}
function koaModelByRole(role) {
  const m = KOA_MODELS.find(x => x.role === role);
  return m ? m.id : KOA_MODELS[0].id;
}
function isGpuError(e) {
  return /gpu|webgpu|compatible/i.test(String((e && e.message) || e || ''));
}
// Ripiego cloud (solo testo) quando la GPU locale manca: l'agente risponde comunque.
// Pollinations legacy ora risponde 402/{} per nuove richieste: niente più "{}" in UI,
// prima le chiavi BYOK (Gemini/Pollen), poi legacy con parsing JSON corretto.
async function koaCloudChat(messages, maxTokens) {
  const clean = messages.map(m => (typeof m.content === 'string'
    ? { role: m.role, content: m.content.slice(0, 2000) }
    : { role: m.role, content: 'immagine non supportata dal ripiego cloud' }))
    .filter(m => m.content && m.content.trim());
  if (!clean.length) throw new Error('cloud senza risposta');
  function pick(t) {
    t = String(t == null ? '' : t).trim();
    if (!t || t === '{}' || t === '[]') throw new Error('cloud senza risposta');
    if (t.charAt(0) === '{' && t.charAt(t.length - 1) === '}') {
      try {
        const j = JSON.parse(t);
        const c = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
        if (c && String(c).trim() && String(c).trim() !== '{}') return String(c).trim().slice(0, maxTokens ? maxTokens * 4 : 8000);
        if (j.text && String(j.text).trim()) return String(j.text).trim();
      } catch (e) { if (e && /402|pagamento/.test(e.message)) throw e; }
      throw new Error('cloud senza risposta');
    }
    return t;
  }
  let gemKey = '', polKey = '';
  try {
    gemKey = (localStorage.getItem('koa.gemini-key') || '').trim();
    polKey = (localStorage.getItem('koa.pollen-key') || '').trim();
  } catch (e) {}
  if (gemKey) {
    try {
      const contents = clean.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content.slice(0, 4000) }] }));
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(gemKey), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig: { temperature: 0.3, maxOutputTokens: Math.min(maxTokens || 1024, 4096) } })
      });
      if (r.ok) {
        const j = await r.json();
        const out = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text;
        if (out && String(out).trim()) return String(out).trim();
      }
    } catch (e) {}
  }
  if (polKey) {
    try {
      const r = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + polKey },
        body: JSON.stringify({ model: 'openai/gpt-5.4-nano', messages: clean, stream: false })
      });
      if (r.ok) return pick(await r.text());
    } catch (e) { if (e && /402|pagamento/.test(e.message)) throw e; }
  }
  for (const m of ['default', 'DeepSeek-V4-Flash-0731', 'GLM-5.3-Flash', 'minimax-m2.7', 'mistral-Nemo-Instruct-2407', 'codestral-latest']) {
    try {
      const r = await fetch('https://api.llm7.io/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer unused' },
        body: JSON.stringify({ model: m, messages: clean, stream: false })
      });
      if (r.status === 429) throw new Error('cloud limite richieste (riprova tra ~20s)');
      if (r.ok) {
        const out = pick(await r.text());
        return maxTokens ? out.slice(0, maxTokens * 4) : out;
      }
    } catch (e) {
      if (e && /limite richieste/.test(e.message)) throw e;
    }
  }
  try {
    const r = await fetch('https://text.pollinations.ai/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: clean })
    });
    if (r.ok) return pick(await r.text());
    if (r.status === 402) throw new Error('cloud senza risposta');
  } catch (e) {
    if (e && /402|pagamento/.test(e.message)) throw e;
  }
  const last = [...clean].reverse().find(m => typeof m.content === 'string' && m.content.trim());
  const r2 = await fetch('https://text.pollinations.ai/' + encodeURIComponent((last ? last.content : 'ciao').slice(0, 500)));
  if (!r2.ok && r2.status === 402) throw new Error('cloud senza risposta');
  const t2 = await r2.text();
  return pick(t2);
}
function parsePlanJson(raw) {
  const clean = raw.replace(/```json|```/g, '').trim();
  const start = clean.indexOf('{'), end = clean.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('piano illeggibile');
  const plan = JSON.parse(clean.slice(start, end + 1));
  if (!plan || !Array.isArray(plan.tabs) || !plan.tabs.length) throw new Error('piano vuoto');
  return plan.tabs.filter(t => typeof t === 'string' && t.trim()).slice(0, 300);
}
async function ensureAutonomyModels(roles) {
  const missing = await missingAutonomyModels(roles);
  if (missing.length) throw new Error('manca ' + missing.map(m => m.label).join(', ') + ': apri Modelli e scaricali');
}
async function missingAutonomyModels(roles) {
  const st = await autonomyStatus();
  return (roles || [])
    .map(r => KOA_MODELS.find(m => m.role === r))
    .filter(m => m && (!st[m.id] || st[m.id].state !== 'ok'));
}
// Nucleo download senza interfaccia (lo riusano finestra e fetch automatico).
// Riprova fino a 3 volte: su reti instabili gli shard falliscono e ripartono.
async function fetchAutonomyModel(id, onPct) {
  let lastErr = new Error('download fallito');
  for (let t = 1; t <= 3; t++) {
    try {
      if (t > 1) {
        try { delete koaEngines[id]; } catch (e) {}
        autoLog('Download', 'tentativo ' + t + '/3…', '');
      }
      await koaLocalChat(id, [{ role: 'user', content: 'ok' }], 8, onPct);
      if (await autonomyVerify(id)) {
        const reg = autonomyReg();
        reg[id] = { state: 'ok', size: '', at: Date.now() };
        autonomySave(reg);
        await koaLocalChat(id, [{ role: 'user', content: 'rispondi solo con la parola: pronto' }], 16);
        return;
      }
      lastErr = new Error('pesi incompleti (rete instabile), riprovo da solo');
    } catch (e) {
      lastErr = e;
      try { delete koaEngines[id]; } catch (err) {}
    }
  }
  throw lastErr;
}
let pendingAutoCmd = null, pendingAutoFetch = [], autoFetchSkip = false, prefetchChecked = null;
function hideFetchBox() {
  try { document.getElementById('auto-fetch').hidden = true; } catch (e) {}
}
function showFetchBox(models) {
  try {
    const gb = models.reduce((s, m) => s + (m.gb || 0), 0);
    document.getElementById('auto-fetch-text').textContent =
      'Servono i micromodelli (' + models.map(m => m.label).join(', ') + ', circa ' + gb.toFixed(1).replace('.', ',') + ' GB). Li scarico ora?';
    document.getElementById('auto-fetch').hidden = false;
  } catch (e) {}
}
async function autoFetchMissing(models) {
  for (const m of models) {
    autoLog('Download', m.label + ' (' + m.sub + ')…');
    try {
      await fetchAutonomyModel(m.id, (pct) => autoLogProgress(m.label, pct));
      autoLog('Download', m.label + ' pronto', 'done');
    } catch (e) {
      autoLog('Download', m.label + ': ' + (e.message || 'fallito'), 'error');
      return false;
    }
  }
  try {
    if (!modelsModal.hidden) renderAutonomyModels(await autonomyStatus());
  } catch (e) {}
  return true;
}
let lastFetchPct = {};
function autoLogProgress(label, pct) {
  try {
    const last = (lastFetchPct[label] == null) ? -10 : lastFetchPct[label];
    if (pct === 100 && last === 100) return;
    if (Math.abs(pct - last) < 10 && pct !== 100) return;
    lastFetchPct[label] = pct;
    autoLog('Download', label + ' ' + pct + '%', '');
  } catch (e) {}
}

// ---------- Finestra modelli ----------
const modelsModal = document.getElementById('models-modal');
function renderAutonomyModels(status) {
  const box = document.getElementById('models-list');
  if (!box) return;
  box.innerHTML = '';
  KOA_MODELS.forEach((m) => {
    const st = (status && status[m.id]) || { state: 'no' };
    const row = document.createElement('div');
    row.className = 'model-row';
    const dot = document.createElement('span');
    dot.className = 'dot' + (st.state === 'ok' ? ' ok' : '');
    const tx = document.createElement('div');
    tx.className = 'tx';
    const b = document.createElement('b');
    b.textContent = m.label;
    const sm = document.createElement('small');
    sm.textContent = m.sub + (st.state === 'ok' ? ' · installato' : ' · non scaricato');
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.appendChild(document.createElement('i'));
    tx.append(b, sm, bar);
    const btn = document.createElement('button');
    btn.className = 'btn' + (st.state === 'ok' ? '' : ' primary');
    btn.textContent = st.state === 'ok' ? 'Pronto' : 'Scarica';
    btn.disabled = st.state === 'ok';
    btn.addEventListener('click', () => downloadAutonomyModel(m.id));
    const del = document.createElement('button');
    del.className = 'btn';
    del.textContent = 'Libera';
    del.disabled = st.state !== 'ok';
    del.title = 'Elimina i pesi dal PC';
    del.addEventListener('click', () => deleteAutonomyModel(m.id));
    row.append(dot, tx, btn, del);
    box.appendChild(row);
  });
}
async function openAutonomyModels() {
  modelsModal.hidden = false;
  renderAutonomyModels(null);
  try {
    const g = await koaGpuInfo();
    try {
      let boot = '';
      try {
        if (window.browserAPI && window.browserAPI.gpuState) {
          const s = await window.browserAPI.gpuState();
          if (s) boot = ' Boot: turbo ' + (s.turbo ? 'ON' : 'OFF') + ', Chromium ' + (s.chrome || '?') + '.';
        }
      } catch (e) {}
      const sub = document.getElementById('models-sub');
      if (sub) {
        if (!sub.dataset.base) sub.dataset.base = sub.textContent;
        sub.textContent = sub.dataset.base + (g.ok
          ? ' GPU rilevata: ' + [g.vendor, g.arch, g.device, g.desc].filter(x => x && x !== '?').join(' ') + '.' + boot
          : ' GPU non vista (' + g.why + ').' + boot);
      }
    } catch (e) {}
  } catch (e) {}
  renderAutonomyModels(await autonomyStatus());
}
// Legge la GPU vera vista dal browser (non quella presunta dai flag).
async function koaGpuInfo() {
  try {
    if (!navigator.gpu) return { ok: false, why: 'API WebGPU assente' };
    const a = await navigator.gpu.requestAdapter();
    if (!a) return { ok: false, why: 'nessun adapter (driver o blocco GPU)' };
    let info = {};
    try { info = a.info || {}; } catch (e) {}
    return { ok: true, vendor: info.vendor || '?', arch: info.architecture || '?', device: info.device || '?', desc: info.description || '' };
  } catch (e) { return { ok: false, why: (e && e.message) || 'errore' }; }
}
function closeAutonomyModels() { modelsModal.hidden = true; }
function autonomyRowEls(id) {
  const rows = [...document.querySelectorAll('#models-list .model-row')];
  const i = KOA_MODELS.findIndex(m => m.id === id);
  const row = rows[i];
  if (!row) return null;
  const btns = row.querySelectorAll('.btn');
  return { dot: row.querySelector('.dot'), bar: row.querySelector('.bar'), fill: row.querySelector('.bar i'), sub: row.querySelector('small'), btn: btns[0], del: btns[1] };
}
async function downloadAutonomyModel(id) {
  const els = autonomyRowEls(id);
  try {
    if (els) { els.dot.className = 'dot busy'; els.bar.classList.add('on'); els.btn.disabled = true; }
    await fetchAutonomyModel(id, (pct) => {
      if (els) els.fill.style.width = pct + '%';
    });
  } catch (e) {
    try {
      if (els) {
        els.sub.textContent = els.sub.textContent.replace(/ · errore:.*$/, '') + ' · errore: ' + (e.message || 'download');
        els.dot.className = 'dot';
        els.bar.classList.remove('on');
        els.fill.style.width = '0%';
        els.btn.disabled = false;
      }
    } catch (err) {}
    return;
  }
  renderAutonomyModels(await autonomyStatus());
}
async function deleteAutonomyModel(id) {
  try {
    const base = id.replace(/-mlc$/i, '').toLowerCase();
    const keys = await caches.keys();
    for (const k of keys) {
      try {
        const c = await caches.open(k);
        const rs = await c.keys();
        for (const r of rs) {
          if ((r.url || '').toLowerCase().indexOf(base) !== -1) { try { await c.delete(r); } catch (e) {} }
        }
      } catch (e) {}
    }
  } catch (e) {}
  try { delete koaEngines[id]; } catch (e) {}
  const reg = autonomyReg();
  delete reg[id];
  autonomySave(reg);
  renderAutonomyModels(await autonomyStatus());
}

// ---------- Agente: legge, tocca, riassume ----------
// Gira DENTRO il guest: alone rosso pulsante sul bordo pagina.
function koaAgentGlowFn(on) {
  var id = 'koa-agent-glow';
  try {
    var ex = document.getElementById(id);
    if (ex) ex.remove();
    var st = document.getElementById(id + '-css');
    if (st) st.remove();
    if (!on) return 'off';
    st = document.createElement('style');
    st.id = id + '-css';
    st.textContent = '@keyframes koaAgentPulse{0%{box-shadow:inset 0 0 0 3px rgba(220,30,30,0.95),inset 0 0 24px rgba(220,30,30,0.35);}50%{box-shadow:inset 0 0 0 6px rgba(255,60,40,1),inset 0 0 48px rgba(220,30,30,0.55);}100%{box-shadow:inset 0 0 0 3px rgba(220,30,30,0.95),inset 0 0 24px rgba(220,30,30,0.35);}}';
    (document.head || document.documentElement).appendChild(st);
    var d = document.createElement('div');
    d.id = id;
    d.setAttribute('style', 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;border-radius:8px;animation:koaAgentPulse 1.1s ease-in-out infinite;');
    document.documentElement.appendChild(d);
    return 'on';
  } catch (e) { return 'err'; }
}
function agentGlow(wv, on) {
  try { return wv.executeJavaScript('(' + koaAgentGlowFn.toString() + ')(' + (on ? 'true' : 'false') + ')', true); }
  catch (e) { return Promise.resolve('err'); }
}
function waitLoad(wv, ms) {
  return new Promise((resolve) => {
    let done = false;
    const fin = () => { if (!done) { done = true; resolve(); } };
    try {
      if (!wv.isLoading()) { fin(); return; }
      wv.addEventListener('did-stop-loading', fin, { once: true });
    } catch (e) { fin(); return; }
    setTimeout(fin, ms || 20000);
  });
}
// Attende che la pagina abbia davvero testo (siti JS-idratati come Bing).
function waitContent(wv, ms) {
  ms = ms || 12000;
  const t0 = Date.now();
  return new Promise((resolve) => {
    const tick = async () => {
      try {
        if (Date.now() - t0 > ms) { resolve(0); return; }
        let n = 0;
        try { n = await wv.executeJavaScript('try{document.body?document.body.innerText.length:0}catch(e){0}', true) || 0; } catch (e) {}
        if (n > 200) { resolve(n); return; }
        setTimeout(tick, 800);
      } catch (e) { resolve(0); }
    };
    tick();
  });
}
async function agentRead(tab) {
  try {
    const r = await tab.webview.executeJavaScript('(' + koaExtractPage.toString() + ')()', true);
    return { title: (r && r.title) || tab.title || '', text: String((r && r.text) || '').slice(0, 4000) };
  } catch (e) { return { title: tab.title || '', text: '' }; }
}
async function agentAct(tab, act) {
  const wv = tab.webview;
  if (!act || !act.op) return 'niente';
  if (act.op === 'goto' && act.url && /^https?:\/\//i.test(act.url)) {
    try {
      if (typeof wv.loadURL === 'function') wv.loadURL(act.url);
      else wv.setAttribute('src', act.url);
    } catch (e) {}
    await waitLoad(wv);
    return 'vai ' + act.url;
  }
  if (act.op === 'click' && act.selector) {
    try {
      const sel = JSON.stringify(String(act.selector).slice(0, 300));
      const r = await wv.executeJavaScript('(function(){try{var el=document.querySelector(' + sel + ');if(!el)return "manca";try{el.scrollIntoView({block:"center"})}catch(e){}el.click();return "clic"}catch(e){return "err"}})()', true);
      await waitLoad(wv, 8000);
      return 'clic ' + r;
    } catch (e) { return 'clic err'; }
  }
  if (act.op === 'type' && act.selector && act.text != null) {
    try {
      const sel = JSON.stringify(String(act.selector).slice(0, 300));
      const tx = JSON.stringify(String(act.text).slice(0, 500));
      await wv.executeJavaScript('(function(){try{var el=document.querySelector(' + sel + ');if(!el)return "manca";el.focus();el.value=' + tx + ';el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));return "scritto"}catch(e){return "err"}})()', true);
      return 'scritto';
    } catch (e) { return 'scritto err'; }
  }
  return 'ignoto';
}
// ---------- Occhi e tocco vero: screenshot, coordinate, clic nativo ----------
function shrinkShot(dataUrl, maxW) {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const sc = Math.min(1, maxW / img.width);
          const w = Math.max(1, Math.round(img.width * sc));
          const h = Math.max(1, Math.round(img.height * sc));
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL('image/jpeg', 0.7));
        } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error('shot illeggibile'));
      img.src = dataUrl;
    } catch (e) { reject(e); }
  });
}
async function agentScreenshot(tab) {
  let wcId = 0;
  try { wcId = tab.webview.getWebContentsId(); } catch (e) {}
  if (!wcId) throw new Error('id webview mancante');
  if (!window.browserAPI || !window.browserAPI.captureTab) throw new Error('cattura non supportata da questa build');
  let r = null;
  try { r = await window.browserAPI.captureTab(wcId); } catch (e) {}
  if (!r || !r.ok || !r.dataUrl) throw new Error('screenshot fallito');
  return shrinkShot(r.dataUrl, 768);
}
async function agentLocate(tab, target) {
  const shot = await agentScreenshot(tab);
  const raw = await koaLocalChat(koaModelByRole('occhi'), [
    { role: 'system', content: 'Sei il puntatore di un browser. Guarda lo screenshot (coordinate 0-1000, origine in alto a sinistra). Rispondi SOLO con JSON {"x":N,"y":M} del centro esatto del bersaglio. Niente altro testo.' },
    { role: 'user', content: [
      { type: 'text', text: 'Bersaglio: ' + String(target).slice(0, 200) },
      { type: 'image_url', image_url: { url: shot } }
    ] }
  ], 256);
  const clean = raw.replace(/```json|```/g, '').trim();
  const pt = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
  const x = Number(pt.x), y = Number(pt.y);
  if (!isFinite(x) || !isFinite(y) || x < 0 || x > 1000 || y < 0 || y > 1000) throw new Error('coordinate illeggibili');
  let rect = { width: 1000, height: 800 };
  try { rect = tab.webview.getBoundingClientRect(); } catch (e) {}
  return { x: x / 1000 * rect.width, y: y / 1000 * rect.height };
}
async function agentTouch(tab, target) {
  if (!koaHasGpu) return 'niente WebGPU';
  try { await agentGlow(tab.webview, true); } catch (e) {}
  try {
    try { await ensureAutonomyModels(['occhi']); }
    catch (e) { return 'occhi non pronto'; }
    const pt = await agentLocate(tab, target);
    let wcId = 0;
    try { wcId = tab.webview.getWebContentsId(); } catch (e) { return 'id webview mancante'; }
    if (!window.browserAPI || !window.browserAPI.clickTab) return 'clic non supportato da questa build';
    try { await agentCursorMove(tab.webview, pt.x, pt.y); } catch (e) {}
    await new Promise(r => setTimeout(r, 650));
    let ok = false;
    try {
      const r = await window.browserAPI.clickTab(wcId, Math.round(pt.x), Math.round(pt.y));
      ok = !!(r && r.ok);
    } catch (e) {}
    await agentCursorDone(tab.webview);
    await waitLoad(tab.webview, 8000);
    if (ok) return 'toccato ' + Math.round(pt.x) + ',' + Math.round(pt.y);
    try { await agentCursorDone(tab.webview); } catch (e) {}
    return 'tocco fallito';
  } finally { try { await agentGlow(tab.webview, false); } catch (e) {} try { await agentCursorDone(tab.webview); } catch (e) {} }
}
  // Link dei risultati: entra nei siti veri invece di fermarsi alla ricerca.
  async function agentLinks(tab, maxN) {
    maxN = maxN || 6;
    try {
      const code = ['(function(){try{var out=[],seen={},N=' + maxN + ';',
        'function push(u){try{u=String(u||"");if(!/^https?:\\/\\//i.test(u))return;if(seen[u])return;seen[u]=1;out.push(u)}catch(e){}}',
        'var host="";try{host=location.hostname}catch(e){}',
        'var sels=["li.b_algo h2 a",".b_algo h2 a","#b_results h2 a","article a[href^=http]","main a[href^=http]"];',
        'for(var s=0;s<sels.length&&out.length<N;s++){try{var els=document.querySelectorAll(sels[s]);',
        'for(var i=0;i<els.length&&out.length<N;i++){var h=els[i].href||"";if(!h)continue;',
        'var hh="";try{hh=new URL(h).hostname}catch(e){}if(hh===host)continue;',
        'if(/login|signin|signup|register|account|cookie|privacy|terms/i.test(h))continue;push(h)}}catch(e){}}',
        'return out.slice(0,N)}catch(e){return[]}})()'].join('');
      const r = await tab.webview.executeJavaScript(code, true);
      if (Array.isArray(r)) return r.filter(u => typeof u === 'string').slice(0, maxN);
    } catch (e) {}
    return [];
  }
  // Mouse rosso stilizzato: si sposta sul bersaglio, preme, svanisce.
  async function agentCursorMove(wv, x, y) {
    try {
      const xx = Math.round(x), yy = Math.round(y);
      const code = '(function(x,y){try{var id="koa-agent-cursor";var d=document.getElementById(id);'
        + 'if(!d){d=document.createElement("div");d.id=id;'
        + 'd.setAttribute("style","position:fixed;z-index:2147483647;pointer-events:none;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:radial-gradient(circle,#ff5a3c 0%,#c41e1e 70%);box-shadow:0 0 14px 4px rgba(255,60,40,.8),0 0 3px 1px #fff;transition:left .55s ease-out,top .55s ease-out,opacity .3s;");'
        + '(document.documentElement||document.body).appendChild(d);'
        + 'd.style.left=(x)+"px";d.style.top=((y)-170)+"px";d.style.opacity="1";}'
        + 'void d.offsetWidth;'
        + 'd.style.left=(x)+"px";d.style.top=(y)+"px";'
        + 'return "go"}catch(e){return "err"}})(' + xx + ',' + yy + ')';
      await wv.executeJavaScript(code, true);
    } catch (e) {}
  }
  async function agentCursorDone(wv) {
    try {
      await wv.executeJavaScript('(function(){try{var d=document.getElementById("koa-agent-cursor");if(!d)return "no";d.style.transform="scale(.6)";d.style.opacity="0";setTimeout(function(){try{d.remove()}catch(e){}},350);return "ok"}catch(e){return "err"}})()', true);
    } catch (e) {}
  }
async function agentPageAct(tab, page, cmd) {
  if (!koaHasGpu) return false;
  try { await ensureAutonomyModels(['azioni']); }
  catch (e) { return false; }
  let raw;
  try {
    raw = await koaLocalChat(koaModelByRole('azioni'), [
      { role: 'system', content: 'Sei le mani di un browser. Pagina: ' + (page.title || '').slice(0, 80) + '\n' + page.text.slice(0, 1500) + '\n\nRispondi SOLO JSON: {"op":"touch","target":"descrizione elemento da premere"} per toccare cio che serve alla domanda, oppure {"op":"done"}. Niente altro testo.' },
      { role: 'user', content: 'DOMANDA: ' + cmd.slice(0, 300) }
    ], 256);
  } catch (e) { return false; }
  let act;
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    act = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
  } catch (e) { return false; }
  if (!act || act.op === 'done') return false;
  if (act.op === 'touch' && act.target) {
    autoLog('Tocco', String(act.target).slice(0, 120));
    const r = await agentTouch(tab, String(act.target));
    autoLog('Tocco', r, r.indexOf('toccato') === 0 ? 'done' : 'error');
    return r.indexOf('toccato') === 0;
  }
  if ((act.op === 'click' && act.selector) || (act.op === 'type' && act.selector)) {
    const r = await agentAct(tab, act);
    autoLog('Azione', r, '');
    return true;
  }
  return false;
}
const AGENT_SEARCH = 'https://www.bing.com/search?q=';
function heuristicPlan(cmd) {
  const queries = [cmd.length > 120 ? cmd.slice(0, 120) : cmd];
  if (/roma/i.test(cmd) && /volo/i.test(cmd)) {
    queries.push('voli economici Roma ' + new Date().getFullYear());
    queries.push('aeroporto piu vicino a me');
  }
  if (queries.length === 1) queries.push('migliore ' + cmd.slice(0, 60));
  return { tabs: queries.slice(0, 300), note: 'euristica' };
}
async function planWithModel(cmd) {
  const sys = 'Sei il pianificatore di un browser. Rispondi SOLO con JSON valido, senza testo fuori: {"tabs":["URL https://... oppure query di ricerca", "..."]}. Apri quante schede servono davvero, fino a 300, in sequenza. Proponi query di ricerca, non articoli: KOA entra da solo nei link dei risultati. Per ricerche usa query brevi in italiano.';
  const raw = await koaLocalChat(koaModelByRole('planner'), [
    { role: 'system', content: sys },
    { role: 'user', content: cmd.slice(0, 500) }
  ], 512);
  return { tabs: parsePlanJson(raw), note: 'modello' };
}
async function planWithCloud(cmd) {
  const sys = 'Sei il pianificatore di un browser. Rispondi SOLO con JSON valido, senza testo fuori: {"tabs":["URL https://... oppure query di ricerca", "..."]}. Apri quante schede servono davvero, fino a 300, in sequenza. Proponi query di ricerca, non articoli: KOA entra da solo nei link dei risultati. Per ricerche usa query brevi in italiano.';
  const raw = await koaCloudChat([
    { role: 'system', content: sys },
    { role: 'user', content: cmd.slice(0, 500) }
  ], 512);
  return { tabs: parsePlanJson(raw), note: 'cloud' };
}
function autoLog(title, body, cls) {
  try {
    const box = document.getElementById('auto-log');
    if (!box) return;
    const d = document.createElement('div');
    d.className = 'auto-step' + (cls ? ' ' + cls : '');
    const b = document.createElement('b');
    b.textContent = title;
    d.appendChild(b);
    if (body) {
      const p = document.createElement('div');
      p.textContent = body;
      d.appendChild(p);
    }
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
    while (box.children.length > 80) box.removeChild(box.firstChild);
  } catch (e) {}
}
function autoAnswer(text) {
  let btn = null;
  try {
    const box = document.getElementById('auto-log');
    if (!box) return null;
    const d = document.createElement('div');
    d.className = 'auto-answer';
    d.textContent = text;
    btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = 'Ascolta';
    btn.addEventListener('click', () => { btn.disabled = true; speakAnswer(text, btn); });
    d.appendChild(document.createElement('br'));
    d.appendChild(btn);
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
  } catch (e) {}
  return btn;
}
// Voce neurale locale (Piper, italiano): setup una tantum, sintesi, play.
let lastTtsFile = null;
let ttsApiWarned = false;
async function ensureTts() {
  try {
    if (!window.browserAPI || !window.browserAPI.ttsStatus) {
      if (!ttsApiWarned) {
        ttsApiWarned = true;
        autoLog('Voce', 'manca il supporto vocale: ricompila con ricrea-exe', 'error');
      }
      return false;
    }
    const s = await window.browserAPI.ttsStatus();
    if (s && s.ok) return true;
    autoLog('Voce', 'scarico la voce neurale italiana…', '');
    const f = await window.browserAPI.ttsFetch();
    return !!(f && f.ok);
  } catch (e) {
    autoLog('Voce', 'non disponibile: ' + ((e && e.message) || 'errore'), 'error');
    return false;
  }
}
async function speakAnswer(text, btn) {
  const t = String(text || '').slice(0, 900);
  if (!t) return;
  try {
    if (!await ensureTts()) { if (btn) btn.disabled = false; return; }
    try {
      if (lastTtsFile && window.browserAPI && window.browserAPI.ttsClean) {
        await window.browserAPI.ttsClean();
      }
    } catch (e) {}
    const r = await window.browserAPI.ttsSpeak(t);
    if (!r || !r.ok || !r.file) throw new Error('sintesi fallita');
    lastTtsFile = r.file;
    const url = 'file:///' + String(r.file).replace(/\\/g, '/').replace(/ /g, '%20');
    const a = new Audio(url);
    await a.play();
  } catch (e) {
    autoLog('Voce', 'premi Ascolta per riprovare', 'error');
    if (btn) btn.disabled = false;
  }
}
function autoState(t) {
  try { document.getElementById('auto-state').textContent = t; } catch (e) {}
}
let autoRunning = false;
let koaHasGpu = false;
async function koaAutonomyRun(cmd) {
  if (autoRunning) return;
  cmd = (cmd || '').trim();
  if (!cmd) return;
  autoRunning = true;
  autoState('al lavoro…');
  const deadline = Date.now() + 1800000;
  koaHasGpu = false;
  try { koaHasGpu = !!navigator.gpu; } catch (e) {}
  try {
    autoLog('Comando', cmd);
    const need = await missingAutonomyModels(['planner', 'italiano']);
    if (need.length) {
      if (!koaHasGpu) {
        autoLog('GPU', 'WebGPU assente: salto i download inutili, lavoro via cloud.', '');
      } else {
      let pre = false;
      try {
        if (prefetchChecked == null && window.browserAPI && window.browserAPI.modelsPrefetch) {
          const r = await window.browserAPI.modelsPrefetch();
          prefetchChecked = !!(r && r.prefetch);
        }
        pre = !!prefetchChecked;
      } catch (e) {}
      if (pre) {
        autoLog('Setup', 'scarico i micromodelli scelti in installazione…');
        const ok = await autoFetchMissing(need);
        if (!ok) { autoState('fermo'); autoRunning = false; return; }
      } else if (!autoFetchSkip) {
        pendingAutoCmd = cmd;
        pendingAutoFetch = need;
        showFetchBox(need);
        autoState('fermo');
        autoRunning = false;
        return;
      } else {
        autoLog('Modelli mancanti', 'servono: ' + need.map(m => m.label).join(', '), 'error');
        autoState('fermo');
        autoRunning = false;
        return;
      }
      }
    }
    autoLog('Piano', 'scompongo la richiesta…');
    let plan;
    try { plan = await planWithModel(cmd); }
    catch (e) {
      if (isGpuError(e) || !koaHasGpu) {
        autoLog('Piano', 'piano dal cloud…', '');
        try { plan = await planWithCloud(cmd); }
        catch (e2) { plan = heuristicPlan(cmd); }
      } else plan = heuristicPlan(cmd);
    }
    autoLog('Piano (' + plan.note + ')', plan.tabs.join('  ·  '));
    const collected = [];
    const doneIds = [];
    const closeDone = (keep) => {
      try {
        while (doneIds.length > keep) {
          const cid = doneIds.shift();
          try { if (getTab(cid)) closeTab(cid); } catch (e) {}
        }
      } catch (e) {}
    };
    let n = 0;
    const queue = plan.tabs.slice(0, 300);
    const seenUrls = new Set();
    let qi = 0;
    while (qi < queue.length) {
      if (Date.now() > deadline) { autoLog('Tempo', 'scaduto: chiudo con quanto raccolto', 'error'); break; }
      if (++n > 300) break;
      const item = queue[qi++];
      const url = /^https?:\/\//i.test(item) ? item : AGENT_SEARCH + encodeURIComponent(item);
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);
      let tabId;
      try { tabId = createTab(url); }
      catch (e) { autoLog('Scheda', 'apertura fallita: ' + item, 'error'); continue; }
      const tab = getTab(tabId);
      if (!tab) continue;
      autoLog('Scheda ' + n, url);
      await waitLoad(tab.webview);
      try { await agentGlow(tab.webview, true); } catch (e) {}
      await waitContent(tab.webview);
      let page = await agentRead(tab);
      if (!page.text) {
        await new Promise(r => setTimeout(r, 3000));
        page = await agentRead(tab);
      }
      try { await agentGlow(tab.webview, false); } catch (e) {}
      if (page.text) collected.push('FONTE ' + n + ' (' + (page.title || url).slice(0, 80) + '):\n' + page.text.slice(0, 2500));
      else autoLog('Lettura', 'pagina vuota o protetta (' + page.text.length + ' caratteri)', 'error');
      // Era una ricerca: entra nei siti dei risultati.
      if (page.text && !/^https?:\/\//i.test(item) && queue.length < 300) {
        try {
          const links = await agentLinks(tab, 6);
          let added = 0;
          for (const lu of links) {
            if (seenUrls.has(lu) || queue.indexOf(lu) !== -1) continue;
            if (queue.length >= 300) break;
            queue.push(lu);
            seenUrls.add(lu);
            added++;
          }
          if (added) autoLog('Link', added + ' risultati da aprire', '');
        } catch (e) {}
      }
      // Giri di mani finché serve (max 5): tocca, rileggi, continua.
      if (page.text && Date.now() < deadline) {
        for (let round = 0; round < 5; round++) {
          if (Date.now() > deadline) break;
          let acted = false;
          try { acted = await agentPageAct(tab, page, cmd); } catch (e) {}
          if (!acted) break;
          const page2 = await agentRead(tab);
          if (page2.text && page2.text !== page.text) {
            collected.push('FONTE ' + n + 'b' + (round + 1) + ' (' + (page2.title || url).slice(0, 80) + ', dopo azione):\n' + page2.text.slice(0, 2200));
            page = page2;
          } else break;
        }
      }
      // Libera RAM: tiene al massimo le ultime 2 lette.
      doneIds.push(tab.id);
      closeDone(2);
    }
    closeDone(1);
    if (!collected.length) { autoLog('Risultato', 'nessuna pagina leggibile', 'error'); autoState('fermo'); autoRunning = false; return; }
    autoLog('Sintesi', 'unisco i risultati…');
    const sumSys = 'Sei KOA. Rispondi in italiano, conciso e completo, con cifre e fatti dalle fonti. Niente emoji.';
    const sumUsr = 'DOMANDA: ' + cmd.slice(0, 400) + '\n\n' + collected.join('\n\n').slice(0, 6000);
    let ans;
    try {
      ans = await koaLocalChat(koaModelByRole('italiano'), [
        { role: 'system', content: sumSys },
        { role: 'user', content: sumUsr }
      ], 1024);
    } catch (e) {
      if (!isGpuError(e)) throw e;
      autoLog('Sintesi', 'niente GPU locale: sintesi dal cloud…', '');
      ans = await koaCloudChat([
        { role: 'system', content: sumSys },
        { role: 'user', content: sumUsr }
      ], 1024);
    }
    const ab = autoAnswer(ans);
    speakAnswer(ans, ab);
    autoLog('Fatto', collected.length + ' schede lette', 'done');
    autoState('pronto');
  } catch (e) {
    autoLog('Errore', (e && e.message) || 'imprevisto', 'error');
    autoState('fermo');
  }
  autoRunning = false;
}

// ---------- Sottospecie: aura + raggruppamento ----------
let tabGroups = [];
let groupFilter = null;
let groupSeq = 0;
const GROUP_COLORS = ['#E86A2C', '#9d4edd', '#4ade80', '#4dd0e1', '#f5c400', '#f472b6'];
const GROUP_BUCKETS = [
  { name: 'Viaggi', rx: /(volo|voli|hotel|booking|airbnb|trenitalia|ryanair|skyscanner|trip|maps|viaggi|aereo|treno)/i },
  { name: 'Video', rx: /(youtube|twitch|netflix|vimeo|dailymotion|video|raiplay|mediaset)/i },
  { name: 'Social', rx: /(instagram|facebook|twitter|x\.com|tiktok|reddit|whatsapp|telegram|discord|linkedin)/i },
  { name: 'Lavoro', rx: /(docs\.|drive\.|gmail|notion|office|teams|slack|calendar|dropbox|asana|trello)/i },
  { name: 'Dev', rx: /(github|stackoverflow|npmjs|mdn|localhost|127\.0\.0\.1|codepen|vercel|netlify)/i },
  { name: 'News', rx: /(repubblica|corriere|ansa|bbc|gazzetta|sole24ore|huffington|fanpage|news)/i },
  { name: 'Shopping', rx: /(amazon|ebay|subito|idealo|aliexpress|zalando|ikea|unieuro|mediaworld)/i },
  { name: 'Musica', rx: /(spotify|soundcloud|deezer|music\.youtube|bandcamp)/i }
];
function tabIdentity(t) {
  let url = '';
  try { url = t.webview.getURL() || t.webview.src || ''; } catch (e) {}
  return { id: t.id, title: t.title || '', url };
}
function heuristicGroups(items) {
  const map = {};
  items.forEach((it) => {
    const hay = (it.title + ' ' + it.url).toLowerCase();
    const b = GROUP_BUCKETS.find(x => x.rx.test(hay));
    const name = b ? b.name : 'Altro';
    (map[name] = map[name] || []).push(it.id);
  });
  const big = [], lone = [];
  Object.keys(map).forEach(k => { if (map[k].length >= 2) big.push({ name: k, ids: map[k] }); else lone.push(...map[k]); });
  if (lone.length) big.push({ name: 'Altro', ids: lone });
  return big;
}
// ID modello (stringhe) -> ID numerici delle schede; i singoli finiscono in Altro.
function consolidateGroups(groups) {
  const norm = (groups || [])
    .filter(g => g && g.name && Array.isArray(g.ids))
    .map(g => ({
      name: String(g.name).slice(0, 24),
      ids: g.ids.map(id => { const n = Number(id); return Number.isFinite(n) ? n : id; })
        .filter(id => getTab(id))
    }))
    .filter(g => g.ids.length)
    .slice(0, 6);
  const big = [], lone = [];
  norm.forEach(g => { if (g.ids.length >= 2) big.push(g); else lone.push(...g.ids); });
  if (lone.length) big.push({ name: 'Altro', ids: lone });
  return big;
}
async function classifyWithModel(items) {
  const sys = 'Sei un classificatore di schede browser. Rispondi SOLO JSON valido: {"groups":[{"name":"Nome breve","ids":["id1","id2"]}]}. Massimo 6 gruppi, nomi italiani corti. Ogni id in un solo gruppo.';
  const raw = await koaLocalChat(koaModelByRole('planner'), [
    { role: 'system', content: sys },
    { role: 'user', content: JSON.stringify(items.map(i => ({ id: i.id, title: i.title.slice(0, 80), url: i.url.slice(0, 120) }))).slice(0, 3000) }
  ], 768);
  const clean = raw.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
  const valid = new Set(items.map(i => String(i.id)));
  const seen = new Set();
  return (parsed.groups || [])
    .filter(g => g && g.name && Array.isArray(g.ids))
    .map(g => ({ name: String(g.name).slice(0, 24), ids: g.ids.map(String).filter(id => valid.has(id) && !seen.has(id) && (seen.add(id), true)) }))
    .filter(g => g.ids.length)
    .slice(0, 6);
}
function auraShow() {
  try {
    const v = document.getElementById('aura-veil');
    v.hidden = false;
    void v.offsetWidth;
    v.classList.add('show');
    document.body.classList.add('aura');
  } catch (e) {}
}
function auraHide() {
  try {
    const v = document.getElementById('aura-veil');
    v.classList.remove('show');
    document.body.classList.remove('aura');
    setTimeout(() => { try { v.hidden = true; } catch (e) {} }, 250);
  } catch (e) {}
}
function renderGroupChips() {
  try {
    const bar = document.getElementById('group-bar');
    if (!bar) return;
    bar.innerHTML = '';
    if (!tabGroups.length) { bar.hidden = true; return; }
    bar.hidden = false;
    const all = document.createElement('button');
    all.className = 'gchip' + (groupFilter == null ? ' on' : '');
    all.textContent = 'Tutte (' + tabs.length + ')';
    all.addEventListener('click', () => { groupFilter = null; applyGroupFilter(); });
    bar.appendChild(all);
    tabGroups.forEach((g) => {
      const c = document.createElement('button');
      c.className = 'gchip' + (groupFilter === g.id ? ' on' : '');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.setProperty('--c', g.color);
      const tx = document.createElement('span');
      tx.textContent = g.name + ' (' + g.ids.filter(id => getTab(id)).length + ')';
      const x = document.createElement('button');
      x.className = 'x';
      x.textContent = '×';
      x.title = 'Sciogli gruppo';
      x.addEventListener('click', (e) => { e.stopPropagation(); dissolveGroup(g.id); });
      c.append(dot, tx, x);
      c.addEventListener('click', () => { groupFilter = (groupFilter === g.id ? null : g.id); applyGroupFilter(); });
      bar.appendChild(c);
    });
  } catch (e) {}
}
function applyGroupFilter() {
  try {
    tabGroups = tabGroups.filter(g => g.ids.some(id => getTab(id)));
    if (groupFilter != null && !tabGroups.some(g => g.id === groupFilter)) groupFilter = null;
    const inSplit = (typeof splitState !== 'undefined' && splitState) ? splitState.panes : [];
    tabs.forEach((t) => {
      let show = true;
      if (groupFilter != null && t.groupId !== groupFilter && inSplit.indexOf(t.id) === -1) show = false;
      t.tabEl.style.display = show ? '' : 'none';
    });
    renderGroupChips();
  } catch (e) {}
}
function dissolveGroup(gid) {
  try {
    tabs.forEach((t) => { if (t.groupId === gid) delete t.groupId; });
    tabGroups = tabGroups.filter(g => g.id !== gid);
    if (groupFilter === gid) groupFilter = null;
    applyGroupFilter();
    autoLog('Sottospecie', 'gruppo sciolto', 'done');
  } catch (e) {}
}
async function koaGroupTabs() {
  if (!tabs.length) return;
  auraShow();
  autoState('raggruppo…');
  try {
    const items = tabs.map(tabIdentity);
    let groups;
    try {
      await ensureAutonomyModels(['planner']);
      groups = await classifyWithModel(items);
      if (!groups.length) groups = heuristicGroups(items);
    } catch (e) { groups = heuristicGroups(items); }
    tabGroups = consolidateGroups(groups).map((g, i) => ({ id: 'g' + (++groupSeq), name: g.name, color: GROUP_COLORS[i % GROUP_COLORS.length], ids: g.ids }));
    tabs.forEach((t) => { delete t.groupId; });
    tabGroups.forEach((g) => g.ids.forEach((id) => { const t = getTab(id); if (t) t.groupId = g.id; }));
    groupFilter = null;
    applyGroupFilter();
    autoLog('Sottospecie', tabGroups.map(g => g.name + ' (' + g.ids.length + ')').join(' · ') || 'nessun gruppo', 'done');
    autoState('pronto');
  } catch (e) {
    autoLog('Sottospecie', 'non riuscita', 'error');
    autoState('fermo');
  }
  setTimeout(auraHide, 950);
}

// ---------- Split veloce: pannelli non a fuoco a 30fps + animazioni ferme ----------
// Il fuoco cambia solo dentro applyLayout: un hook alla fine basta per tutto.
const SPLIT_FREEZE_CSS = '*,*::before,*::after{animation-play-state:paused !important;transition-duration:.01ms !important;}';
function applySplitPerf() {
  try {
    const st = (typeof splitState !== 'undefined' && splitState) ? splitState : null;
    const panes = st ? st.panes : [];
    const focus = st ? st.focus : null;
    tabs.forEach((t) => {
      const member = panes.indexOf(t.id) !== -1;
      const hot = !panes.length || t.id === focus;
      try {
        if ((!member || hot) && (t._splitKey != null || t._splitPending)) {
          t._splitPending = false;
          const k = t._splitKey; t._splitKey = null;
          if (k != null) {
            try { const r = t.webview.removeCSS(k); if (r && r.catch) r.catch(() => {}); } catch (e) {}
          }
        }
        if (member && !hot && t._splitKey == null && !t._splitPending) {
          t._splitPending = true;
          try {
            const p = t.webview.insertCSS(SPLIT_FREEZE_CSS);
            if (p && p.then) {
              p.then((k) => { try { t._splitKey = k; } finally { try { t._splitPending = false; } catch (e) {} } }).catch(() => { t._splitPending = false; });
            } else t._splitPending = false;
          } catch (e) { t._splitPending = false; }
        }
      } catch (e) {}
      try {
        let wcId = 0;
        try { wcId = t.webview.getWebContentsId(); } catch (e) {}
        if (wcId && window.browserAPI && window.browserAPI.panePerf && t._perfHot !== hot) {
          t._perfHot = hot;
          const r = window.browserAPI.panePerf(wcId, hot);
          if (r && r.catch) r.catch(() => {});
        }
      } catch (e) {}
    });
  } catch (e) {}
}

// ---------- Cablaggio interfaccia ----------
try {
  document.getElementById('auto-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = document.getElementById('auto-input');
    const v = inp.value;
    inp.value = '';
    koaAutonomyRun(v);
  });
  document.getElementById('auto-models').addEventListener('click', openAutonomyModels);
  document.getElementById('auto-group').addEventListener('click', koaGroupTabs);
  document.getElementById('models-close').addEventListener('click', closeAutonomyModels);
  document.getElementById('models-info-btn').addEventListener('click', () => {
    try {
      const b = document.getElementById('models-info');
      b.hidden = !b.hidden;
    } catch (e) {}
  });
  document.getElementById('fetch-accept').addEventListener('click', async () => {
    hideFetchBox();
    const cmd = pendingAutoCmd, need = pendingAutoFetch;
    pendingAutoCmd = null; pendingAutoFetch = [];
    if (!cmd || !need.length) return;
    autoState('scarico…');
    const ok = await autoFetchMissing(need);
    if (ok) koaAutonomyRun(cmd);
    else autoState('fermo');
  });
  document.getElementById('fetch-later').addEventListener('click', () => {
    autoFetchSkip = true;
    pendingAutoCmd = null; pendingAutoFetch = [];
    hideFetchBox();
    autoLog('Download', 'rimandato: apri Modelli quando vuoi', '');
  });
  document.getElementById('models-download-all').addEventListener('click', async () => {
    for (const m of KOA_MODELS) {
      try {
        const st = await autonomyStatus();
        if (!st[m.id] || st[m.id].state !== 'ok') await downloadAutonomyModel(m.id);
      } catch (e) {}
    }
  });
  modelsModal.addEventListener('click', (e) => { if (e.target === modelsModal) closeAutonomyModels(); });
  autoState('pronto');
  autonomyStatus().then(() => {}).catch(() => {});
} catch (e) {}
