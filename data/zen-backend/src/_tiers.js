const TIER_CONFIG = {
  // Abbonamenti rimossi: un unico livello, tutto illimitato e gratis
  free: {
    name: 'Free',
    price: 0,
    limits: {
      messagesPerDay: Infinity,
      publicQueue: false,
      imagesPerDay: Infinity,
      videosPerMonth: Infinity,
      pdfsPerMonth: Infinity,
      quizzesPerMonth: Infinity,
      modelLimits: {
        zen6: Infinity,
        zen7: Infinity,
        'zen7.5': Infinity,
      }
    },
    engine: 'pollinations',
    model: null,
    features: {
      zchat: true,
      pdfCreator: true,
      quizEngine: true,
      quizEsame: true,
      spiegameloSemplice: true,
      devSuite: true,
      zenithEarlyAccess: true,
      priorityGpu: true,
      creatorContact: true,
    },
  },
  plus: {
    name: 'ZEN Plus',
    price: 4.99,
    limits: {
      messagesPerDay: 100,
      publicQueue: false,
      imagesPerDay: 2,
      videosPerMonth: 0,
      pdfsPerMonth: 10,
      quizzesPerMonth: 10,
      modelLimits: {
        zen6: Infinity,
        zen7: 100,
        'zen7.5': 100,
      }
    },
    engine: 'gemini',
    model: process.env.GEMINI_MODEL_PLUS || 'gemini-3.1-flash-lite',
    features: {
      zchat: true,
      pdfCreator: true,
      quizEngine: true,
      quizEsame: true,
      spiegameloSemplice: true,
      devSuite: false,
      zenithEarlyAccess: false,
      priorityGpu: false,
      creatorContact: false,
    },
  },
  pro: {
    name: 'ZEN Pro',
    price: 19.99,
    limits: {
      messagesPerDay: 1000,
      publicQueue: false,
      imagesPerDay: 25,
      videosPerMonth: 5,
      pdfsPerMonth: Infinity,
      quizzesPerMonth: Infinity,
      modelLimits: {
        zen6: Infinity,
        zen7: Infinity,
        'zen7.5': 1000,
      }
    },
    engine: 'gemini',
    model: process.env.GEMINI_MODEL_PRO || 'gemini-3.5-flash',
    features: {
      zchat: true,
      pdfCreator: true,
      quizEngine: true,
      quizEsame: true,
      spiegameloSemplice: true,
      devSuite: true,
      zenithEarlyAccess: false,
      priorityGpu: false,
      creatorContact: false,
    },
  },
  unreal: {
    name: 'ZEN Unreal',
    price: 99.99,
    limits: {
      messagesPerDay: 999999,
      publicQueue: false,
      imagesPerDay: 100,
      videosPerMonth: 30,
      pdfsPerMonth: Infinity,
      quizzesPerMonth: Infinity,
      modelLimits: {
        zen6: 999999,
        zen7: 999999,
        'zen7.5': 999999,
      }
    },
    engine: 'gemini',
    model: process.env.GEMINI_MODEL_UNREAL || 'gemini-3.6-flash',
    features: {
      zchat: true,
      pdfCreator: true,
      quizEngine: true,
      quizEsame: true,
      spiegameloSemplice: true,
      devSuite: true,
      zenithEarlyAccess: true,
      priorityGpu: true,
      creatorContact: true,
    },
  },
};

const TIER_ORDER = ['free', 'plus', 'pro', 'unreal'];

function getTierConfig(tier) {
  return TIER_CONFIG[tier] || TIER_CONFIG.free;
}

function getCurrentDayKey() {
  return new Date().toISOString().split('T')[0];
}

function getCurrentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getUsage(usage, kind) {
  if (!usage) return { daily: 0, monthly: 0 };
  const dayKey = getCurrentDayKey();
  const monthKey = getCurrentMonthKey();
  const counts = usage.counts || {};
  const monthlyCounts = usage.monthlyCounts || {};
  return {
    daily: counts[dayKey]?.[kind] || 0,
    monthly: monthlyCounts[monthKey]?.[kind] || 0,
  };
}

function incrementUsage(usage, kind) {
  if (!usage) usage = { date: getCurrentDayKey(), month: new Date().getMonth(), counts: {}, monthlyCounts: {} };
  const dayKey = getCurrentDayKey();
  const monthKey = getCurrentMonthKey();
  if (dayKey !== usage.date) {
    usage.date = dayKey;
    usage.counts = { [dayKey]: {} };
  }
  if (monthKey !== `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`) {
    usage.month = new Date().getMonth();
    usage.monthlyCounts = { [monthKey]: {} };
  }
  usage.counts[dayKey] = usage.counts[dayKey] || {};
  usage.monthlyCounts[monthKey] = usage.monthlyCounts[monthKey] || {};
  usage.counts[dayKey][kind] = (usage.counts[dayKey][kind] || 0) + 1;
  usage.monthlyCounts[monthKey][kind] = (usage.monthlyCounts[monthKey][kind] || 0) + 1;
  return usage;
}

function checkLimit(tier, kind, usage) {
  const config = getTierConfig(tier);
  const limit = config.limits[kind];
  if (limit === Infinity) return { ok: true, remaining: Infinity };
  const current = getUsage(usage, kind);
  const value = kind.includes('Month') ? current.monthly : current.daily;
  const remaining = Math.max(0, limit - value);
  return { ok: value < limit, remaining, limit, used: value };
}

function canAccessFeature(tier, feature) {
  const config = getTierConfig(tier);
  return !!config.features[feature];
}

function getUpgradeMessage(tier, kind) {
  const config = getTierConfig(tier);
  const nextTier = TIER_ORDER[TIER_ORDER.indexOf(tier) + 1];
  if (!nextTier) return 'Hai raggiunto il limite massimo del piano UNREAL.';
  const nextConfig = getTierConfig(nextTier);
  if (kind === 'messagesPerDay') {
    return `Hai raggiunto il limite di messaggi gratuiti di oggi. Passa a ${nextConfig.name} per messaggi e risposte illimitate.`;
  }
  return `Hai raggiunto il limite ${kind === 'imagesPerDay' ? 'giornaliero di immagini' : kind === 'videosPerMonth' ? 'mensile di video' : kind === 'pdfsPerMonth' ? 'mensile di PDF' : kind === 'quizzesPerMonth' ? 'mensile di quiz' : 'del tuo piano'}. Passa a ${nextConfig.name} per continuare.`;
}

function getTierColor(tier) {
  const colors = {
    free: '#8b8b8b',
    plus: '#ff8a3d',
    pro: '#2dd4bf',
    unreal: '#c0a3ff',
  };
  return colors[tier] || colors.free;
}

function getTierBadge(tier) {
  const labels = {
    free: 'FREE',
    plus: 'PLUS',
    pro: 'PRO',
    unreal: 'UNREAL',
  };
  return labels[tier] || 'FREE';
}

module.exports = {
  TIER_CONFIG,
  TIER_ORDER,
  getTierConfig,
  getUsage,
  incrementUsage,
  checkLimit,
  canAccessFeature,
  getUpgradeMessage,
  getTierColor,
  getTierBadge,
};