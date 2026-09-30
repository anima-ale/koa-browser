const { getStore } = require('./_db');
const { verifyToken, getTokenFromReq, cors } = require('./_zchat');
const { canAccessFeature } = require('./_tiers');

const QUIZ_STORE = 'zen-quizzes';

function quizId() {
  return 'quiz_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = getTokenFromReq(req);
  const payload = verifyToken(token);
  if (!payload || !payload.username) return res.status(401).json({ error: 'Sessione non valida. Accedi di nuovo.' });

  if (!canAccessFeature(payload.plan || 'free', 'quizEngine')) {
    return res.status(403).json({ error: 'Quiz Engine disponibile solo da ZEN Plus.', needsUpgrade: true });
  }

  const store = getStore(QUIZ_STORE);
  const prefix = `quiz:${payload.username}:`;

  if (req.method === 'POST') {
    const body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.body || '{}');
    const { action, quiz } = body;

    if (action === 'create') {
      if (!quiz || !quiz.title || !Array.isArray(quiz.questions) || quiz.questions.length === 0) {
        return res.status(400).json({ error: 'Quiz deve avere titolo e almeno una domanda.' });
      }
      const id = quizId();
      const newQuiz = {
        id,
        title: quiz.title,
        description: quiz.description || '',
        questions: quiz.questions.map((q, i) => ({
          id: q.id || `q${i + 1}`,
          text: q.text,
          type: q.type || 'single',
          options: q.options || [],
          correctAnswer: q.correctAnswer,
          explanation: q.explanation || '',
          points: q.points || 1,
        })),
        settings: {
          timeLimit: quiz.settings?.timeLimit || 0,
          shuffleQuestions: quiz.settings?.shuffleQuestions || false,
          shuffleOptions: quiz.settings?.shuffleOptions || false,
          showExplanation: quiz.settings?.showExplanation !== false,
          passThreshold: quiz.settings?.passThreshold || 60,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        owner: payload.username,
      };
      await store.setJSON(`${prefix}${id}`, newQuiz);
      return res.status(201).json({ quiz: newQuiz });
    }

    if (action === 'update') {
      if (!quiz || !quiz.id) return res.status(400).json({ error: 'ID quiz mancante.' });
      const existing = await store.get(`${prefix}${quiz.id}`, { type: 'json' });
      if (!existing) return res.status(404).json({ error: 'Quiz non trovato.' });
      const updated = { ...existing, ...quiz, updatedAt: new Date().toISOString() };
      await store.setJSON(`${prefix}${quiz.id}`, updated);
      return res.status(200).json({ quiz: updated });
    }

    if (action === 'delete') {
      const { id } = body;
      if (!id) return res.status(400).json({ error: 'ID mancante.' });
      await store.delete(`${prefix}${id}`);
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Azione non valida.' });
  }

  if (req.method === 'GET') {
    const { id, list } = req.query;
    if (list === 'true') {
      const result = await store.list({ prefix });
      const quizzes = [];
      for (const blob of result.blobs || []) {
        const q = await store.get(blob.key, { type: 'json' });
        if (q) quizzes.push({ id: q.id, title: q.title, description: q.description, questionCount: q.questions.length, updatedAt: q.updatedAt });
      }
      return res.status(200).json({ quizzes });
    }
    if (id) {
      const q = await store.get(`${prefix}${id}`, { type: 'json' });
      if (!q) return res.status(404).json({ error: 'Quiz non trovato.' });
      return res.status(200).json({ quiz: q });
    }
    return res.status(400).json({ error: 'Parametri mancanti.' });
  }

  res.status(405).json({ error: 'Metodo non permesso.' });
};