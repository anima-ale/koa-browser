const { getAccount, setAccount } = require('./_db');
const { verifyToken, getTokenFromReq, cors } = require('./_zchat');
const { getTierConfig, checkLimit, incrementUsage, canAccessFeature } = require('./_tiers');

function generatePDF(content) {
  const pages = content.pages || [{ elements: [] }];
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 50;

  let pdf = '%PDF-1.4\n';
  const objects = [];
  let objId = 1;

  const addObject = (content) => {
    const id = objId++;
    objects.push({ id, content });
    return id;
  };

  const catalogId = addObject(`<</Type /Catalog /Pages ${addObject('<</Type /Pages /Kids [' + pages.map(() => addObject('')).join(' ') + '] /Count ' + pages.length + '>>')}>>`);

  const fontId = addObject(`<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>`);
  const fontBoldId = addObject(`<</Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold>>`);

  pages.forEach((page, pi) => {
    const pageObjId = addObject('');
    const contentStream = [];
    let y = pageHeight - margin;

    const addText = (text, x, size, font = fontId, color = '0 0 0') => {
      contentStream.push(`BT /F${font === fontBoldId ? 2 : 1} ${size} Tf ${color} rg ${x} ${y} Td (${escapePDF(text)}) Tj ET`);
      y -= size * 1.3;
    };

    page.elements.forEach(el => {
      if (el.type === 'title') {
        addText(el.text, margin, 24, fontBoldId, '0.1 0.3 0.6');
        y -= 10;
      } else if (el.type === 'heading') {
        addText(el.text, margin, 18, fontBoldId, '0.2 0.2 0.2');
        y -= 6;
      } else if (el.type === 'paragraph') {
        const words = el.text.split(' ');
        let line = '';
        for (const w of words) {
          const testLine = line + (line ? ' ' : '') + w;
          if (testLine.length > 90) {
            addText(line, margin, 11);
            line = w;
          } else {
            line = testLine;
          }
        }
        if (line) addText(line, margin, 11);
        y -= 6;
      } else if (el.type === 'list') {
        el.items.forEach(item => {
          addText('• ' + item, margin + 10, 11);
        });
        y -= 6;
      } else if (el.type === 'code') {
        const lines = el.text.split('\n');
        lines.forEach(l => addText(l, margin + 5, 9, fontId, '0.3 0.3 0.3'));
        y -= 6;
      } else if (el.type === 'divider') {
        y -= 4;
        contentStream.push(`${margin} ${y} m ${pageWidth - margin} ${y} l S`);
        y -= 10;
      }
    });

    const stream = contentStream.join('\n');
    const streamObjId = addObject(`<</Length ${stream.length}>>\nstream\n${stream}\nendstream`);
    objects[pageObjId - 1].content = `<</Type /Page /Parent ${catalogId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${streamObjId} 0 R>>`;
  });

  objects[catalogId - 1].content = `<</Type /Catalog /Pages ${objects[catalogId].id} 0 R>>`;

  let xref = 'xref\n0 ' + (objId) + '\n0000000000 65535 f \n';
  let pos = pdf.length;
  let offsets = [0];
  for (const obj of objects) {
    offsets.push(pos);
    pdf += `${obj.id} 0 obj\n${obj.content}\nendobj\n`;
    pos = pdf.length;
  }
  for (let i = 1; i < offsets.length; i++) {
    xref += offsets[i].toString().padStart(10, '0') + ' 00000 n \n';
  }
  pdf += xref;
  pdf += `trailer\n<</Size ${objId} /Root ${catalogId} 0 R>>\nstartxref\n${pos}\n%%EOF`;

  return pdf;
}

function escapePDF(str) {
  return str.replace(/[\\()]/g, c => '\\' + c).replace(/\n/g, '\\n');
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
  if (!canAccessFeature(tier, 'pdfCreator')) {
    return res.status(403).json({ error: 'PDF Creator disponibile solo da ZEN Plus. Passa a Plus per sbloccarlo.', needsUpgrade: true });
  }

  const limitCheck = checkLimit(tier, 'pdfsPerMonth', account.usage);
  if (!limitCheck.ok) {
    return res.status(429).json({ error: 'Limite mensile PDF raggiunto per il tuo piano.', needsUpgrade: true, limit: limitCheck });
  }

  const body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.body || '{}');
  const { title, sections } = body;
  if (!title || !Array.isArray(sections)) {
    return res.status(400).json({ error: 'Servono "title" e "sections" (array di oggetti).' });
  }

  const elements = [{ type: 'title', text: title }, { type: 'divider' }];
  for (const sec of sections) {
    if (sec.type === 'heading') elements.push({ type: 'heading', text: sec.text });
    else if (sec.type === 'paragraph') elements.push({ type: 'paragraph', text: sec.text });
    else if (sec.type === 'list') elements.push({ type: 'list', items: sec.items || [] });
    else if (sec.type === 'code') elements.push({ type: 'code', text: sec.text });
    else if (sec.type === 'divider') elements.push({ type: 'divider' });
  }

  const pdfContent = { pages: [{ elements }] };
  const pdfString = generatePDF(pdfContent);
  const base64 = Buffer.from(pdfString).toString('base64');
  const dataUrl = `data:application/pdf;base64,${base64}`;

  const updatedUsage = incrementUsage(account.usage, 'pdfsPerMonth');
  await setAccount(payload.username, { ...account, usage: updatedUsage });

  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({ pdfUrl: dataUrl, filename: `${title.replace(/[^a-z0-9]/gi, '_')}.pdf`, usage: updatedUsage });
};