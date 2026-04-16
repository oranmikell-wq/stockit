// scoring.js — 5-indicator scoring engine + sector benchmarks

// ── Weights ──────────────────────────────────────────────
export const WEIGHTS = {
  epsGrowth:  0.30,
  forwardPE:  0.25,
  fcfYield:   0.20,
  debtEquity: 0.15,
  rsi:        0.10,
};

// ── Sector key resolver ─────────────────────────────────
export function getSectorKey(sector) {
  if (!sector) return 'default';
  const s = sector.toLowerCase();
  if (s.includes('tech'))          return 'technology';
  if (s.includes('financ') || s.includes('bank') || s.includes('insur')) return 'financials';
  if (s.includes('energy'))        return 'energy';
  if (s.includes('health'))        return 'healthcare';
  if (s.includes('real estate'))   return 'real_estate';
  if (s.includes('consumer'))      return 'consumer';
  if (s.includes('industri'))      return 'industrials';
  if (s.includes('commun'))        return 'communication';
  if (s.includes('utilit'))        return 'utilities';
  if (s.includes('material'))      return 'materials';
  return 'default';
}

// ── Normalize helpers ───────────────────────────────────
export function normalizeInverse(value, benchmarks) {
  const [ex, gd, av, po] = benchmarks;
  if (value <= ex) return 100;
  if (value <= gd) return 75 + ((gd - value) / (gd - ex)) * 25;
  if (value <= av) return 40 + ((av - value) / (av - gd)) * 35;
  if (value <= po) return 10 + ((po - value) / (po - av)) * 30;
  return 5;
}

// Supports both 2-threshold form (value, min, max) and 4-segment form (value, min, low, high, max)
export function normalizeLinear(value, min, low, high, max) {
  if (high === undefined) { max = low; low = undefined; }
  if (value >= max) return 100;
  if (value <= min) return 0;
  if (low !== undefined && high !== undefined) {
    if (value <= low)  return ((value - min) / (low - min)) * 50;
    if (value <= high) return 50 + ((value - low) / (high - low)) * 30;
    return 80 + ((value - high) / (max - high)) * 20;
  }
  return ((value - min) / (max - min)) * 100;
}

// ── Weighted average helper ─────────────────────────────
// Skips null scores and re-normalizes remaining weights
function weightedAvg(items) {
  let totalW = 0, sum = 0;
  for (const { score, weight } of items) {
    if (score != null) { sum += score * weight; totalW += weight; }
  }
  return totalW > 0 ? sum / totalW : null;
}

// ── Individual criterion scorers (0–100) ───────────────

// Forward EPS Growth scorer (sector-adjusted thresholds)
export function scoreEpsGrowthFwd(growth, sectorKey) {
  if (growth == null) return null;
  const benchmarks = {
    technology:   [-10, 5, 15, 30],
    financials:   [-5,  3, 10, 20],
    healthcare:   [-5,  3, 10, 20],
    energy:       [-15, 0, 8,  18],
    real_estate:  [-10, 2, 8,  15],
    consumer:     [-5,  3, 10, 18],
    industrials:  [-5,  3, 10, 18],
    utilities:    [-5,  2, 6,  12],
    materials:    [-10, 2, 8,  15],
    communication:[-5,  3, 10, 20],
    default:      [-5,  3, 10, 20],
  };
  return normalizeLinear(growth * 100, ...(benchmarks[sectorKey] ?? benchmarks.default));
}

// Forward P/E scorer (lower = better, sector-adjusted)
export function scoreForwardPE(pe, sectorKey) {
  if (pe == null || pe <= 0) return null;
  const benchmarks = {
    technology:   [15, 25, 35, 50],
    financials:   [8,  12, 18, 28],
    healthcare:   [12, 20, 30, 45],
    energy:       [8,  12, 18, 28],
    real_estate:  [15, 25, 35, 50],
    consumer:     [12, 18, 28, 40],
    industrials:  [12, 18, 28, 40],
    utilities:    [12, 18, 25, 35],
    materials:    [10, 15, 22, 35],
    communication:[12, 18, 28, 40],
    default:      [12, 18, 28, 40],
  };
  return normalizeInverse(pe, benchmarks[sectorKey] ?? benchmarks.default);
}

// FCF Yield scorer (higher = better)
export function scoreFCFYield(fcfYield) {
  if (fcfYield == null) return null;
  const pct = fcfYield * 100;
  return normalizeLinear(pct, -2, 1, 4, 8);
}

// Debt/Equity scorer (lower = better, sector-adjusted)
// Note: Yahoo returns D/E as percentage (e.g. 45.2 means 0.452 ratio)
export function scoreDebtEquityNew(de, sectorKey) {
  if (de == null || de < 0) return null;
  const ratio = de / 100; // convert Yahoo's % format to ratio
  const benchmarks = {
    technology:   [0, 0.3, 0.8,  1.5],
    financials:   [0, 1,   3,    8  ],
    healthcare:   [0, 0.3, 0.8,  1.5],
    energy:       [0, 0.5, 1.2,  2.5],
    real_estate:  [0, 1,   2,    4  ],
    consumer:     [0, 0.5, 1.2,  2.5],
    industrials:  [0, 0.5, 1.2,  2.5],
    utilities:    [0, 1,   2.5,  5  ],
    materials:    [0, 0.4, 1,    2  ],
    communication:[0, 0.5, 1.5,  3  ],
    default:      [0, 0.5, 1.2,  2.5],
  };
  return normalizeInverse(ratio, benchmarks[sectorKey] ?? benchmarks.default);
}

// RSI-14 scorer (50-60 is ideal, overbought/oversold penalized)
export function scoreRSINew(rsi) {
  if (rsi == null) return null;
  if (rsi >= 30 && rsi <= 70) {
    // Ideal range: peak at RSI=55
    if (rsi <= 55) return Math.round(50 + (rsi - 30) * (50 / 25));
    else return Math.round(100 - (rsi - 55) * (40 / 15));
  }
  if (rsi < 30) return Math.round(rsi * (50 / 30));  // oversold: low score
  return Math.round(60 - (rsi - 70) * (55 / 30));    // overbought: declining score, floor at ~5
}

// ── RSI calculator ──────────────────────────────────────
export function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - 100 / (1 + rs);
}

// ── Master score calculator ─────────────────────────────
// Takes { epsGrowthFwd, forwardPE, fcfYield, debtToEquity, rsi, sectorKey }
// Returns { score, bulls, rating, criteria }
export function calcScore(data) {
  const sectorKey = data.sectorKey ?? getSectorKey(data.sector ?? null);

  // epsGrowthFwd is a decimal (e.g. 0.15 = 15%)
  // debtToEquity is in Yahoo % format (e.g. 45.2)
  const criteriaScores = {
    epsGrowth:  scoreEpsGrowthFwd(data.epsGrowthFwd ?? null, sectorKey),
    forwardPE:  scoreForwardPE(data.forwardPE ?? null, sectorKey),
    fcfYield:   scoreFCFYield(data.fcfYield ?? null),
    debtEquity: scoreDebtEquityNew(data.debtToEquity ?? null, sectorKey),
    rsi:        scoreRSINew(data.rsi ?? null),
  };

  const rawScore = weightedAvg([
    { score: criteriaScores.epsGrowth,  weight: WEIGHTS.epsGrowth  },
    { score: criteriaScores.forwardPE,  weight: WEIGHTS.forwardPE  },
    { score: criteriaScores.fcfYield,   weight: WEIGHTS.fcfYield   },
    { score: criteriaScores.debtEquity, weight: WEIGHTS.debtEquity },
    { score: criteriaScores.rsi,        weight: WEIGHTS.rsi        },
  ]);

  const finalScore = rawScore != null ? Math.round(rawScore) : null;

  let rating = 'wait';
  if (finalScore != null) {
    if (finalScore >= 66) rating = 'buy';
    else if (finalScore < 41) rating = 'sell';
  }

  const bulls = finalScore == null ? null
    : finalScore >= 81 ? 5
    : finalScore >= 61 ? 4
    : finalScore >= 41 ? 3
    : finalScore >= 21 ? 2
    : 1;

  const isPartial = Object.values(criteriaScores).some(v => v == null);

  return {
    score: finalScore,
    bulls,
    rating,
    isPartial,
    criteria: criteriaScores,
    sectorKey,
  };
}
