// ================= KOA Autonomia: micromodelli locali + agente + aura =================
// Tre micromodelli sul PC (pianificatore, italiano, azioni). Pesi in CacheStorage,
// registro in localStorage, verifica reale a ogni avvio. Niente cloud, niente emoji.
const KOA_MODELS = [
  { id: 'SmolLM2-360M-Instruct-q4f16_1-MLC', label: 'Pianificatore', sub: '360M · ~300MB · scompone i comandi', role: 'planner' },
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', label: 'Italiano', sub: '0.5B · ~400MB · capisce e riassume', role: 'italiano' },
  { id: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC', label: 'Azioni web', sub: '1.5B · ~1GB · clic e moduli', role: 'azioni' }
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
// Verifica reale: config + indice pesi sotto il percorso del modello.
async function autonomyVerify(id) {
  try {
    if (!('caches' in window)) return false;
    const base = id.replace(/-mlc$/i, '').toLowerCase();
    const keys = await caches.keys();
    let cfg = false, idx = false;
    outer:
    for (const k of keys) {
      try {
        const c = await caches.open(k);
        const rs = await c.keys();
        for (const r of rs) {
          const u = (r.url || '').toLowerCase();
          if (u.indexOf(base) === -1) continue;
          if (u.indexOf('mlc-chat-config.json') !== -1) cfg = true;
          if (u.indexOf('ndarray-cache.json') !== -1) idx = true;
          if (cfg && idx) break outer;
        }
      } catch (e) {}
    }
    return cfg && idx;
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
async function ensureAutonomyModels(roles) {
  const st = await autonomyStatus();
  const missing = (roles || ['planner', 'italiano'])
    .map(r => KOA_MODELS.find(m => m.role === r))
    .filter(m => m && (!st[m.id] || st[m.id].state !== 'ok'));
  if (missing.length) throw new Error('manca ' + missing.map(m => m.label).join(', ') + ': apri Modelli e scaricali');
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
  renderAutonomyModels(await autonomyStatus());
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
    await koaLocalChat(id, [{ role: 'user', content: 'ok' }], 8, (pct) => {
      if (els) els.fill.style.width = pct + '%';
    });
    const ok = await autonomyVerify(id);
    if (!ok) throw new Error('verifica pesi fallita');
    const reg = autonomyReg();
    reg[id] = { state: 'ok', size: '', at: Date.now() };
    autonomySave(reg);
    await koaLocalChat(id, [{ role: 'user', content: 'rispondi solo con la parola: pronto' }], 16);
  } catch (e) {
    try { if (els) els.sub.textContent += ' · errore: ' + (e.message || 'download'); } catch (err) {}
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
const AGENT_SEARCH = 'https://www.bing.com/search?q=';
function heuristicPlan(cmd) {
  const queries = [cmd.length > 120 ? cmd.slice(0, 120) : cmd];
  if (/roma/i.test(cmd) && /volo/i.test(cmd)) {
    queries.push('voli economici Roma ' + new Date().getFullYear());
    queries.push('aeroporto piu vicino a me');
  }
  if (queries.length === 1) queries.push(cmd + ' prezzo');
  return { tabs: queries.slice(0, 3), note: 'euristica' };
}
async function planWithModel(cmd) {
  const sys = 'Sei il pianificatore di un browser. Rispondi SOLO con JSON valido, senza testo fuori: {"tabs":["URL https://... oppure query di ricerca", "..."]}. Massimo 3 schede. Per ricerche usa query brevi in italiano.';
  const raw = await koaLocalChat(koaModelByRole('planner'), [
    { role: 'system', content: sys },
    { role: 'user', content: cmd.slice(0, 500) }
  ], 512);
  const clean = raw.replace(/```json|```/g, '').trim();
  const start = clean.indexOf('{'), end = clean.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('piano illeggibile');
  const plan = JSON.parse(clean.slice(start, end + 1));
  if (!plan || !Array.isArray(plan.tabs) || !plan.tabs.length) throw new Error('piano vuoto');
  return { tabs: plan.tabs.filter(t => typeof t === 'string' && t.trim()).slice(0, 3), note: 'modello' };
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
  } catch (e) {}
}
function autoAnswer(text) {
  try {
    const box = document.getElementById('auto-log');
    if (!box) return;
    const d = document.createElement('div');
    d.className = 'auto-answer';
    d.textContent = text;
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
  } catch (e) {}
}
function autoState(t) {
  try { document.getElementById('auto-state').textContent = t; } catch (e) {}
}
let autoRunning = false;
async function koaAutonomyRun(cmd) {
  if (autoRunning) return;
  cmd = (cmd || '').trim();
  if (!cmd) return;
  autoRunning = true;
  autoState('al lavoro…');
  const deadline = Date.now() + 120000;
  try {
    autoLog('Comando', cmd);
    try { await ensureAutonomyModels(['planner', 'italiano']); }
    catch (e) { autoLog('Modelli mancanti', e.message || 'scaricali', 'error'); autoState('fermo'); autoRunning = false; return; }
    autoLog('Piano', 'scompongo la richiesta…');
    let plan;
    try { plan = await planWithModel(cmd); }
    catch (e) { plan = heuristicPlan(cmd); }
    autoLog('Piano (' + plan.note + ')', plan.tabs.join('  ·  '));
    const collected = [];
    let n = 0;
    for (const item of plan.tabs) {
      if (Date.now() > deadline) { autoLog('Tempo', 'scaduto: chiudo con quanto raccolto', 'error'); break; }
      if (++n > 3) break;
      const url = /^https?:\/\//i.test(item) ? item : AGENT_SEARCH + encodeURIComponent(item);
      let tabId;
      try { tabId = createTab(url); }
      catch (e) { autoLog('Scheda', 'apertura fallita: ' + item, 'error'); continue; }
      const tab = getTab(tabId);
      if (!tab) continue;
      autoLog('Scheda ' + n, url);
      await waitLoad(tab.webview);
      try { await agentGlow(tab.webview, true); } catch (e) {}
      const page = await agentRead(tab);
      try { await agentGlow(tab.webview, false); } catch (e) {}
      if (page.text) collected.push('FONTE ' + n + ' (' + (page.title || url).slice(0, 80) + '):\n' + page.text.slice(0, 2500));
      else autoLog('Lettura', 'pagina vuota o protetta', 'error');
    }
    if (!collected.length) { autoLog('Risultato', 'nessuna pagina leggibile', 'error'); autoState('fermo'); autoRunning = false; return; }
    autoLog('Sintesi', 'unisco i risultati…');
    const ans = await koaLocalChat(koaModelByRole('italiano'), [
      { role: 'system', content: 'Sei KOA. Rispondi in italiano, conciso e completo, con cifre e fatti dalle fonti. Niente emoji.' },
      { role: 'user', content: 'DOMANDA: ' + cmd.slice(0, 400) + '\n\n' + collected.join('\n\n').slice(0, 6000) }
    ], 1024);
    autoAnswer(ans);
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
  return Object.keys(map).map(k => ({ name: k, ids: map[k] }));
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
    tabGroups = groups.map((g, i) => ({ id: 'g' + (++groupSeq), name: g.name, color: GROUP_COLORS[i % GROUP_COLORS.length], ids: g.ids }));
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
