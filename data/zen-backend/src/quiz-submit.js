const { getStore } = require('./_db');
const { verifyToken, getTokenFromReq, cors } = require('./_zchat');
const { canAccessFeature, incrementUsage } = require('./_tiers');
const { getAccount, setAccount } = require('./_db');

const QUIZ_STORE = 'zen-quizzes';

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non permesso.' });

  const token = getTokenFromReq(req);
  const payload = verifyToken(token);
  if (!payload || !payload.username) return res.status(401).json({ error: 'Sessione non valida. Accedi di nuovo.' });

  if (!canAccessFeature(payload.plan || 'free', 'quizEngine')) {
    return res.status(403).json({ error: 'Quiz Engine disponibile solo da ZEN Plus.', needsUpgrade: true });
  }

  const body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.body || '{}');
  const { quizId, answers, startTime } = body;
  if (!quizId || !answers) return res.status(400).json({ error: 'Mancano quizId o answers.' });

  const store = getStore(QUIZ_STORE);
  const quiz = await store.get(`quiz:${payload.username}:${quizId}`, { type: 'json' });
  if (!quiz) return res.status(404).json({ error: 'Quiz non trovato.' });

  if (quiz.settings?.timeLimit && startTime) {
    const elapsed = (Date.now() - new Date(startTime).getTime()) / 1000;
    if (elapsed > quiz.settings.timeLimit * 60) {
      return res.status(400).json({ error: 'Tempo scaduto per questo quiz.' });
    }
  }

  let totalPoints = 0;
  let earnedPoints = 0;
  const results = [];

  for (const q of quiz.questions) {
    totalPoints += q.points;
    const userAnswer = answers[q.id];
    let correct = false;
    if (q.type === 'single' || q.type === 'multiple') {
      const correctAns = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
      const userAns = Array.isArray(userAnswer) ? userAnswer : [userAnswer];
      correct = correctAns.length === userAns.length && correctAns.every(a => userAns.includes(a));
    } else if (q.type === 'text') {
      correct = (userAnswer || '').trim().toLowerCase() === (q.correctAnswer || '').trim().toLowerCase();
    }
    if (correct) earnedPoints += q.points;
    results.push({
      questionId: q.id,
      correct,
      userAnswer,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      points: q.points,
      earned: correct ? q.points : 0,
    });
  }

  const percentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  const passed = percentage >= (quiz.settings?.passThreshold || 60);

  const account = await getAccount(payload.username);
  const updatedUsage = incrementUsage(account.usage, 'quizzesPerMonth');
  await setAccount(payload.username, { ...account, usage: updatedUsage });

  return res.status(200).json({
    quizId,
    title: quiz.title,
    totalPoints,
    earnedPoints,
    percentage,
    passed,
    results,
    usage: updatedUsage,
  });
};