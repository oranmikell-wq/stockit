// scoring.js — 4-family weighted scoring engine + sector benchmarks

// ── Family Weights ──────────────────────────────────────
export const FAMILY_WEIGHTS = {
  growth:    0.35,
  valuation: 0.25,
  quality:   0.20,
  technical: 0.20,
};

// Sub-weights within each family
export const GROWTH_WEIGHTS    = { epsSurprise: 0.50, eps: 0.30, revenue: 0.20 };
export const VALUATION_WEIGHTS = { peg: 0.50, fcf: 0.30, pe: 0.20 };
export const QUALITY_WEIGHTS   = { operatingMargin: 0.35, insiderOwnership: 0.25, roe: 0.25, currentRatio: 0.15 };
export const TECHNICAL_WEIGHTS = { ma200: 0.40, distFromHigh: 0.25, macd: 0.20, rsi: 0.15 };

// ── Sector Benchmarks ───────────────────────────────────
export const SECTOR_PE = {
  technology:    [15, 25, 40, 60],
  financials:    [8,  12, 18, 25],
  energy:        [8,  12, 18, 25],
  healthcare:    [12, 20, 30, 45],
  real_estate:   [15, 25, 40, 60],
  consumer:      [12, 18, 28, 40],
  industrials:   [12, 18, 25, 35],
  communication: [12, 20, 35, 55],
  utilities:     [14, 18, 25, 35],
  materials:     [10, 15, 22, 30],
  default:       [12, 20, 35, 55],
};

export const SECTOR_PB = {
  technology:    [1, 3, 6, 12],
  financials:    [0.8, 1.2, 2, 3.5],
  energy:        [1, 1.5, 2.5, 4],
  healthcare:    [2, 4, 7, 12],
  real_estate:   [1, 1.5, 2.5, 4],
  consumer:      [1.5, 3, 5, 8],
  industrials:   [1.5, 2.5, 4, 7],
  communication: [1.5, 3, 5, 9],
  utilities:     [1, 1.5, 2.5, 4],
  materials:     [1, 2, 3.5, 6],
  default:       [1, 3, 6, 12],
};

export const SECTOR_PS = {
  technology:    [2, 5, 10, 20],
  financials:    [1, 2, 4, 7],
  energy:        [0.5, 1, 2, 3.5],
  healthcare:    [1, 3, 6, 12],
  real_estate:   [3, 6, 10, 16],
  consumer:      [0.3, 0.8, 1.5, 3],
  industrials:   [0.5, 1, 2, 3.5],
  communication: [1, 3, 6, 10],
  utilities:     [1, 2, 3.5, 5],
  materials:     [0.5, 1, 2, 3.5],
  default:       [1, 3, 6, 12],
};

export function getSectorKey(sector) {
  if (!sector) return 'default';
  const s = sector.toLowerCase();
  if (s.includes('tech'))          return 'technology';
  if (s.includes('financ') || s.includes('bank')) return 'financials';
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

export function normalizeLinear(value, min, max) {
  if (value >= max) return 100;
  if (value <= min) return 0;
  return ((value - min) / (max - min)) * 100;
}

// ── Weighted average helper ─────────────────────────────
// items: [{ score: number|null, weight: number }]
// Skips null scores and re-normalizes remaining weights
function weightedAvg(items) {
  let totalW = 0, sum = 0;
  for (const { score, weight } of items) {
    if (score != null) { sum += score * weight; totalW += weight; }
  }
  return totalW > 0 ? sum / totalW : null;
}

// ── Individual criterion scorers (0–100) ───────────────

export function scoreEPS(epsGrowth) {
  if (epsGrowth == null) return null;
  return normalizeLinear(epsGrowth, -30, 40);
}

export function scoreRevenue(revenueGrowth) {
  if (revenueGrowth == null) return null;
  return normalizeLinear(revenueGrowth, -10, 30);
}

export function scoreEPSSurprise(pct) {
  if (pct == null) return null;
  // -20% miss → 0, +20% beat → 100
  return normalizeLinear(pct, -20, 20);
}

export function scorePEG(peg) {
  if (peg == null || peg <= 0) return null;
  if (peg <= 0.5) return 100;
  if (peg <= 1.0) return normalizeLinear(1.0 - peg, 0, 0.5) / 100 * 20 + 80;
  if (peg <= 2.0) return normalizeLinear(2.0 - peg, 0, 1.0) / 100 * 40 + 40;
  if (peg <= 4.0) return normalizeLinear(4.0 - peg, 0, 2.0) / 100 * 35 + 5;
  return 5;
}

export function scoreFCF(fcf, marketCap) {
  if (fcf == null) return null;
  if (fcf <= 0) return 10;
  if (marketCap == null || marketCap <= 0) return 50;
  const yield_ = (fcf / marketCap) * 100;
  return normalizeLinear(yield_, 0, 10);
}

export function scorePEonly(pe, sectorKey) {
  if (pe == null || pe <= 0) return null;
  return normalizeInverse(pe, SECTOR_PE[sectorKey] || SECTOR_PE.default);
}

export function scoreOperatingMargin(om, sectorKey) {
  if (om == null) return null;
  const highMarginSectors = ['technology', 'healthcare', 'communication'];
  const ex = highMarginSectors.includes(sectorKey) ? 30 : 20;
  const gd = highMarginSectors.includes(sectorKey) ? 20 : 12;
  const av = highMarginSectors.includes(sectorKey) ? 10 : 5;
  if (om <= 0) return 5;
  if (om >= ex) return 100;
  if (om >= gd) return 70 + ((om - gd) / (ex - gd)) * 30;
  if (om >= av) return 40 + ((om - av) / (gd - av)) * 30;
  return 5 + (om / av) * 35;
}

export function scoreInsiderOwnership(pct) {
  if (pct == null) return null;
  if (pct < 0.5) return 20;
  if (pct <= 5)  return 55;
  if (pct <= 15) return 75;
  if (pct <= 30) return 85;
  if (pct <= 50) return 70;
  return 40;
}

export function scoreROE(roe) {
  if (roe == null) return null;
  if (roe < 0) return 5;
  return normalizeLinear(roe, 0, 30);
}

export function scoreCurrentRatio(cr) {
  if (cr == null) return null;
  if (cr >= 2.5) return 100;
  if (cr >= 2.0) return 85;
  if (cr >= 1.5) return 70;
  if (cr >= 1.0) return 45;
  if (cr >= 0.5) return 20;
  return 5;
}

// MA200 position: how far price is above/below MA200
export function scoreMA200Position(price, ma200) {
  if (price == null || ma200 == null || ma200 === 0) return null;
  const pct = (price / ma200 - 1) * 100; // positive = above, negative = below
  if (pct >= 20) return 90;
  if (pct >= 10) return 80;
  if (pct >= 5)  return 70;
  if (pct >= 0)  return 60;
  if (pct >= -5) return 40;
  if (pct >= -10) return 25;
  if (pct >= -20) return 15;
  return 5;
}

// Distance from 52W high (lower distance = stronger)
export function scoreDistFromHigh(price, high52w) {
  if (price == null || high52w == null || high52w === 0) return null;
  const distPct = ((high52w - price) / high52w) * 100; // 0% = at high, 100% = far below
  return normalizeInverse(distPct, [0, 10, 30, 50]);
}

export function scoreShortFloat(pct) {
  if (pct == null) return null;
  if (pct <= 2)  return 95;
  if (pct <= 5)  return 80;
  if (pct <= 10) return 60;
  if (pct <= 15) return 40;
  if (pct <= 25) return 20;
  return 5;
}

export function scoreMACD(macd, price) {
  if (macd == null || price == null || price === 0) return null;
  const pct = (macd / price) * 100;
  if (pct >=  3) return 90;
  if (pct >=  1) return 75;
  if (pct >=  0) return 60;
  if (pct >= -1) return 40;
  if (pct >= -3) return 25;
  return 10;
}

export function scoreInsiderTransactions(data) {
  if (!data) return null;
  const { buys, sells } = data;
  const total = buys + sells;
  if (total === 0) return 50; // no activity = neutral
  return Math.round(10 + (buys / total) * 80); // 100% buys→90, 100% sells→10
}

// RSI only (no MACD)
export function scoreRSI(rsi) {
  if (rsi == null) return null;
  if (rsi < 30) return 70;       // oversold — potential bounce
  if (rsi < 50) return 80;       // healthy pullback
  if (rsi < 65) return 65;       // neutral/slightly bullish
  if (rsi < 75) return 35;       // overbought
  return 15;                      // extremely overbought
}

// ── Legacy scorers (kept for display in tables) ─────────
export function scoreMultiples(pe, pb, ps, sectorKey) {
  const scores = [];
  if (pe != null && pe > 0) scores.push(normalizeInverse(pe, SECTOR_PE[sectorKey] || SECTOR_PE.default));
  if (pb != null && pb > 0) scores.push(normalizeInverse(pb, SECTOR_PB[sectorKey] || SECTOR_PB.default));
  if (ps != null && ps > 0) scores.push(normalizeInverse(ps, SECTOR_PS[sectorKey] || SECTOR_PS.default));
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export function scoreAnalysts(analystScore, analystMean) {
  if (analystMean != null) return normalizeLinear(5 - analystMean, 0, 4);
  if (!analystScore) return null;
  const { strongBuy = 0, buy = 0, hold = 0, sell = 0 } = analystScore;
  const total = strongBuy + buy + hold + sell;
  if (total === 0) return null;
  return (strongBuy * 100 + buy * 75 + hold * 40 + sell * 0) / total;
}

export function scoreMomentum(changePct, price, high52w, low52w) {
  if (changePct == null) return null;
  const dailyScore = normalizeLinear(changePct, -5, 5);
  if (high52w == null || low52w == null || price == null) return dailyScore;
  const range = high52w - low52w;
  if (range === 0) return dailyScore;
  const position = (price - low52w) / range;
  return (dailyScore * 0.4 + position * 100 * 0.6);
}

export function scoreInstitutional(instPct) {
  if (instPct == null) return null;
  return normalizeLinear(instPct * 100, 0, 80);
}

export function scoreDebt(debtEquity, sectorKey) {
  if (debtEquity == null) return null;
  const highDebtSectors = ['financials', 'real_estate', 'utilities'];
  const max = highDebtSectors.includes(sectorKey) ? 10.0 : 2.0;
  return Math.max(0, 100 - normalizeLinear(debtEquity, 0, max));
}

export function scoreATH(price, high52w, ath) {
  if (price == null || high52w == null) return null;
  const distFrom52w = ((high52w - price) / high52w) * 100;
  const fromHigh = normalizeInverse(distFrom52w, [0, 10, 30, 50]);
  if (!ath || ath <= high52w) return fromHigh;
  const distFromATH = ((ath - price) / ath) * 100;
  const fromATH = normalizeInverse(distFromATH, [0, 15, 40, 65]);
  return (fromHigh * 0.6 + fromATH * 0.4);
}

export function scoreHighs(highsBroken) {
  if (!highsBroken) return null;
  const { y1 = 0, y3 = 0, y5 = 0 } = highsBroken;
  return Math.min(100, (y1 * 20 + y3 * 10 + y5 * 5));
}

// ── RSI + MACD helpers ──────────────────────────────────
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

export function calcEMA(closes, period) {
  const k = 2 / (period + 1);
  let ema = closes[0];
  for (let i = 1; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

export function calcMACD(closes) {
  if (closes.length < 26) return null;
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  return ema12 - ema26;
}

export function countHighs(prices, timestamps) {
  if (!prices || !timestamps || prices.length < 2) return { y1: 0, y3: 0, y5: 0 };
  const now = Date.now() / 1000;
  const y1 = now - 365 * 86400;
  const y3 = now - 3 * 365 * 86400;
  const y5 = now - 5 * 365 * 86400;
  let max = 0, h1 = 0, h3 = 0, h5 = 0;
  for (let i = 0; i < prices.length; i++) {
    const p = prices[i];
    const t = timestamps[i];
    if (p > max) {
      max = p;
      if (t >= y1) h1++;
      if (t >= y3) h3++;
      if (t >= y5) h5++;
    }
  }
  return { y1: h1, y3: h3, y5: h5 };
}

// ── Family aggregators ──────────────────────────────────

export function calcFamilyGrowth(data) {
  return weightedAvg([
    { score: scoreEPSSurprise(data.epsSurprise), weight: GROWTH_WEIGHTS.epsSurprise },
    { score: scoreEPS(data.epsGrowth),           weight: GROWTH_WEIGHTS.eps         },
    { score: scoreRevenue(data.revenueGrowth),   weight: GROWTH_WEIGHTS.revenue     },
  ]);
}

export function calcFamilyValuation(data, sectorKey) {
  return weightedAvg([
    { score: scorePEG(data.peg),                              weight: VALUATION_WEIGHTS.peg },
    { score: scoreFCF(data.fcf, data.marketCap),              weight: VALUATION_WEIGHTS.fcf },
    { score: scorePEonly(data.pe, sectorKey),                 weight: VALUATION_WEIGHTS.pe  },
  ]);
}

export function calcFamilyQuality(data, sectorKey) {
  const insiderScore = scoreInsiderTransactions(data.insiderTxn) ?? scoreInsiderOwnership(data.insiderOwnership);
  return weightedAvg([
    { score: scoreOperatingMargin(data.operatingMargin, sectorKey), weight: QUALITY_WEIGHTS.operatingMargin  },
    { score: insiderScore,                                           weight: QUALITY_WEIGHTS.insiderOwnership },
    { score: scoreROE(data.roe),                                    weight: QUALITY_WEIGHTS.roe              },
    { score: scoreCurrentRatio(data.currentRatio),                  weight: QUALITY_WEIGHTS.currentRatio     },
  ]);
}

export function calcFamilyTechnical(data, rsi, highs, ath, indicators) {
  const ma200score = scoreMA200Position(data.price, indicators?.ma200);
  const distHigh   = scoreDistFromHigh(data.price, data.high52w);
  const macdScore  = scoreMACD(calcMACD(indicators?.closes ?? []), data.price);
  const rsiScore   = scoreRSI(rsi);
  return weightedAvg([
    { score: ma200score, weight: TECHNICAL_WEIGHTS.ma200        },
    { score: distHigh,   weight: TECHNICAL_WEIGHTS.distFromHigh },
    { score: macdScore,  weight: TECHNICAL_WEIGHTS.macd         },
    { score: rsiScore,   weight: TECHNICAL_WEIGHTS.rsi          },
  ]);
}

// ── Master score calculator ─────────────────────────────
export function calcScore(data, history5y = [], indicators = {}) {
  const sectorKey = getSectorKey(data.sector);

  const validHistory = history5y.filter(p => p.value && p.time);
  const closes     = validHistory.map(p => p.value);
  const timestamps = validHistory.map(p => p.time);
  const rsi        = calcRSI(closes);
  const macd       = calcMACD(closes);
  const highs      = countHighs(closes, timestamps);
  const ath        = closes.length ? Math.max(...closes) : null;

  const familyGrowth    = calcFamilyGrowth(data);
  const familyValuation = calcFamilyValuation(data, sectorKey);
  const familyQuality   = calcFamilyQuality(data, sectorKey);
  const familyTechnical = calcFamilyTechnical(data, rsi, highs, ath, { ...indicators, closes });

  // Weighted average — only include non-null families
  let totalWeight = 0, weightedSum = 0;
  const fw = FAMILY_WEIGHTS;
  if (familyGrowth    != null) { weightedSum += familyGrowth    * fw.growth;    totalWeight += fw.growth;    }
  if (familyValuation != null) { weightedSum += familyValuation * fw.valuation; totalWeight += fw.valuation; }
  if (familyQuality   != null) { weightedSum += familyQuality   * fw.quality;   totalWeight += fw.quality;   }
  if (familyTechnical != null) { weightedSum += familyTechnical * fw.technical; totalWeight += fw.technical; }

  const finalScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;
  const isPartial  = (familyGrowth == null || familyValuation == null ||
                      familyQuality == null || familyTechnical == null);

  // Individual criterion scores for table display
  const criteriaScores = {
    // Growth
    epsSurprise:      scoreEPSSurprise(data.epsSurprise),
    eps:              scoreEPS(data.epsGrowth),
    revenue:          scoreRevenue(data.revenueGrowth),
    // Valuation
    peg:              scorePEG(data.peg),
    fcf:              scoreFCF(data.fcf, data.marketCap),
    multiples:        scoreMultiples(data.pe, data.pb, data.ps, sectorKey), // display only
    peOnly:           scorePEonly(data.pe, sectorKey),
    // Quality
    operatingMargin:  scoreOperatingMargin(data.operatingMargin, sectorKey),
    insiderOwnership: scoreInsiderOwnership(data.insiderOwnership),
    roe:              scoreROE(data.roe),
    currentRatio:     scoreCurrentRatio(data.currentRatio),
    // Technical
    ma200:            scoreMA200Position(data.price, indicators?.ma200),
    distFromHigh:     scoreDistFromHigh(data.price, data.high52w),
    shortFloat:       scoreShortFloat(data.shortFloat),
    rsiScore:         scoreRSI(rsi),
    // Display-only (not in family model but shown in tables)
    momentum:         scoreMomentum(data.changePct, data.price, data.high52w, data.low52w),
    technical:        rsi != null || macd != null ? (scoreRSI(rsi) != null && macd != null ? (scoreRSI(rsi) * 0.6 + (macd > 0 ? 75 : 30) * 0.4) : scoreRSI(rsi) ?? (macd > 0 ? 75 : 30)) : null,
    ath:              scoreATH(data.price, data.high52w, ath),
    highs:            scoreHighs(highs),
    analysts:         scoreAnalysts(data.analystScore, data.analystMean),
    debt:             scoreDebt(data.debtEquity, sectorKey),
    institutional:    scoreInstitutional(data.instPct),
  };

  let rating = 'wait';
  if (finalScore != null) {
    if (finalScore >= 66) rating = 'buy';
    else if (finalScore < 41) rating = 'sell';
  }

  return {
    score: finalScore,
    rating,
    isPartial,
    criteria: criteriaScores,
    families: {
      growth:    familyGrowth,
      valuation: familyValuation,
      quality:   familyQuality,
      technical: familyTechnical,
    },
    technicals: { rsi, macd, highs, ath, athPrice: ath },
    sectorKey,
    _ma200: indicators?.ma200 ?? null,
  };
}
