// StrategyChecklist.js — Advanced pattern recognition & strategy table

import { calcSMA, yahooChart } from '../services/StockService.js';
import { getSectorKey } from '../utils/scoring.js';
import { t } from '../utils/i18n.js?v=6';
import { initInfoButtons } from './InfoPopup.js';

// Industry average P/S ratios (midpoint of sector benchmarks)
const INDUSTRY_PS_AVG = {
  technology:    5,
  financials:    2,
  energy:        1,
  healthcare:    3,
  real_estate:   6,
  consumer:      0.8,
  industrials:   1,
  communication: 3,
  utilities:     2,
  materials:     1,
  default:       3,
};

// Industry average P/E ratios (realistic market consensus)
const INDUSTRY_PE_AVG = {
  technology:    28,
  financials:    14,
  energy:        12,
  healthcare:    22,
  real_estate:   35,
  consumer:      22,
  industrials:   20,
  communication: 22,
  utilities:     18,
  materials:     16,
  default:       22,
};

// ── Helpers ────────────────────────────────────────────
function statusCell(type, label) {
  const map = {
    YES:     { cls: 'sc-yes'     },
    NO:      { cls: 'sc-no'      },
    NEUTRAL: { cls: 'sc-neutral' },
    NA:      { cls: 'sc-na'      },
  };
  const s = map[type] || map.NA;
  const fallback = type === 'YES' ? t('sc_yes') : type === 'NO' ? t('sc_no') : type === 'NEUTRAL' ? t('sc_neutral') : t('sc_na');
  return `<span class="sc-status ${s.cls}">${label ?? fallback}</span>`;
}

function row(criteria, statusType, statusLabel, insight, infoKey) {
  const btn = infoKey
    ? `<button class="info-icon-btn" data-info="${infoKey}" onclick="event.stopPropagation()">i</button>`
    : '';
  return `
    <tr class="sc-row">
      <td class="sc-criteria">${criteria}${btn}</td>
      <td class="sc-status-cell">${statusCell(statusType, statusLabel)}</td>
      <td class="sc-insight">${insight}</td>
    </tr>`;
}

function groupHeader(title) {
  return `<tr class="sc-group-header"><td colspan="3">${title}</td></tr>`;
}

// ── Pattern Detection ──────────────────────────────────

/**
 * Count how many times the close made a new rolling 52-week high.
 */
export function countNewHighs(closes) {
  if (!closes || closes.length < 5) return 0;
  let count = 0;
  for (let i = 1; i < closes.length; i++) {
    const windowStart = Math.max(0, i - 251);
    const prevHigh    = Math.max(...closes.slice(windowStart, i));
    if (closes[i] >= prevHigh * 0.999) count++;
  }
  return count;
}

/**
 * Cup & Handle heuristic (Stan Weinstein / O'Neil rules).
 *
 * - Consolidation window: 7–65 weeks (~35–325 trading days)
 * - Cup depth: 15%–33% from left-lip high to base low
 * - Handle forms in the upper third of the cup (above 2/3 of cup depth)
 * - Handle pullback: ≤12% from handle peak
 *
 * Returns { detected, confidence, depth, handlePct, weeks }
 */
function detectCupAndHandle(closes) {
  if (!closes || closes.length < 35) return { detected: false };

  // Try windows from 65 weeks down to 7 weeks, pick best fit
  const trySizes = [];
  for (let w = Math.min(65, Math.floor(closes.length / 5)); w >= 7; w -= 4) {
    trySizes.push(w * 5); // convert weeks → trading days (≈5/week)
  }

  for (const size of trySizes) {
    if (closes.length < size) continue;
    const bars = closes.slice(-size);
    const n    = bars.length;

    // Left lip: highest in first 15%
    const leftLip  = Math.max(...bars.slice(0, Math.max(3, Math.floor(n * 0.15))));
    // Cup base: lowest in middle 50–70%
    const baseStart = Math.floor(n * 0.20);
    const baseEnd   = Math.floor(n * 0.80);
    const cupBase  = Math.min(...bars.slice(baseStart, baseEnd));
    // Right cup rim: highest in last 25%
    const rightStart = Math.floor(n * 0.65);
    const rightLip   = Math.max(...bars.slice(rightStart));

    const depth = (leftLip - cupBase) / leftLip;
    if (depth < 0.15 || depth > 0.33) continue; // cup must be 15–33% deep

    // Right lip must recover to at least 90% of left lip
    const recovery = (rightLip - cupBase) / (leftLip - cupBase);
    if (recovery < 0.90) continue;

    // Handle must form in the upper third of the cup
    const upperThirdFloor = leftLip - (leftLip - cupBase) / 3;
    const handleWindow    = bars.slice(Math.floor(n * 0.80));
    const handleLow       = Math.min(...handleWindow);
    const handleHigh      = Math.max(...handleWindow);
    if (handleLow < upperThirdFloor) continue; // handle dipped too deep

    // Handle pullback ≤ 12% from handle peak
    const handlePct = (handleHigh - handleLow) / handleHigh;
    if (handlePct < 0 || handlePct > 0.12) continue;

    return {
      detected:   true,
      confidence: handlePct < 0.06 ? 'high' : 'medium',
      depth:      (depth * 100).toFixed(0),
      handlePct:  (handlePct * 100).toFixed(1),
      weeks:      Math.round(size / 5),
    };
  }

  return { detected: false };
}

/**
 * Double Bottom heuristic (last 6 months, ~126 trading days).
 *
 * - Two distinct local minima (L1 and L2) within last 6 months
 * - L2 within ±3% of L1
 * - Peak between L1 and L2 at least 10% above the lows
 * - Confirmed if current price ≥ 97% of that peak (breakout)
 *
 * Returns { detected, confirmed, variance, recovery }
 */
function detectDoubleBottom(closes) {
  if (!closes || closes.length < 40) return { detected: false };

  const bars = closes.slice(-Math.min(closes.length, 126)); // last ~6 months

  // Find local minima: lower than 7 neighbours on each side
  const minima = [];
  for (let i = 7; i < bars.length - 7; i++) {
    const left  = bars.slice(i - 7, i);
    const right = bars.slice(i + 1, i + 8);
    if (bars[i] < Math.min(...left) && bars[i] < Math.min(...right)) {
      minima.push({ idx: i, val: bars[i] });
    }
  }

  if (minima.length < 2) return { detected: false };

  // Check all pairs of minima (prefer the last two)
  for (let a = minima.length - 2; a >= 0; a--) {
    const m1 = minima[a];
    const m2 = minima[a + 1];

    if (m2.idx - m1.idx < 10) continue; // too close together

    const variance = Math.abs(m1.val - m2.val) / m1.val;
    if (variance > 0.03) continue; // must be within 3% of each other

    const peakBetween = Math.max(...bars.slice(m1.idx, m2.idx + 1));
    const recovery    = (peakBetween - Math.min(m1.val, m2.val)) / Math.min(m1.val, m2.val);
    if (recovery < 0.10) continue; // peak must be ≥10% above both lows

    const currentPrice = closes[closes.length - 1];
    const confirmed    = currentPrice >= peakBetween * 0.97;

    return {
      detected:  true,
      confirmed,
      variance:  (variance * 100).toFixed(1),
      recovery:  (recovery * 100).toFixed(0),
    };
  }

  return { detected: false };
}

// ── Main Render ────────────────────────────────────────
export async function renderStrategyChecklist(container, data, history1Y, indicators) {
  if (!container) return;

  container.innerHTML = `<div class="sc-loading"><div class="sc-spinner"></div><span>${t('sc_analyzing')}</span></div>`;

  const closes       = (history1Y || []).map(h => h.value).filter(v => v != null && v > 0);
  const currentPrice = data.price;

  let rows = '';

  // ── GROUP 1: Trend Indicators ──────────────────────────
  rows += groupHeader(t('sc_group_trend'));

  // MA150
  const ma150 = calcSMA(closes, 150);
  if (ma150 != null && currentPrice != null) {
    const above = currentPrice > ma150;
    const pct   = Math.abs((currentPrice / ma150 - 1) * 100).toFixed(1);
    rows += row(t('sc_ma150'), above ? 'YES' : 'NO', null,
      above ? t('sc_i_ma150_above', { pct }) : t('sc_i_ma150_below', { pct }), 'sc_ma150');
  } else {
    rows += row(t('sc_ma150'), 'NA', null, t('sc_i_ma_nodata', { n: 150 }), 'sc_ma150');
  }

  // MA200
  if (indicators?.ma200 != null && currentPrice != null) {
    const above = indicators.priceAboveMA200;
    const pct   = Math.abs((currentPrice / indicators.ma200 - 1) * 100).toFixed(1);
    rows += row(t('sc_ma200'), above ? 'YES' : 'NO', null,
      above ? t('sc_i_ma200_above', { pct }) : t('sc_i_ma200_below', { pct }), 'sc_ma200');
  } else {
    rows += row(t('sc_ma200'), 'NA', null, t('sc_i_ma_nodata', { n: 200 }), 'sc_ma200');
  }

  // New 52-week highs count
  const highCount = countNewHighs(closes);
  const highStatus = highCount >= 10 ? 'YES' : highCount >= 3 ? 'NEUTRAL' : 'NO';
  rows += row(t('sc_new_highs'), highStatus, `${highCount}×`,
    highCount >= 10 ? t('sc_i_highs_high', { n: highCount })
    : highCount >= 3 ? t('sc_i_highs_mid',  { n: highCount })
    : highCount === 0 ? t('sc_i_highs_zero')
    : t('sc_i_highs_few', { n: highCount }), 'sc_new_highs');

  // ── GROUP 2: Pattern Recognition ──────────────────────
  rows += groupHeader(t('sc_group_patterns'));

  // Cup & Handle
  const cup = detectCupAndHandle(closes);
  rows += row(t('sc_cup_handle'),
    cup.detected ? 'YES' : 'NEUTRAL',
    cup.detected ? t('sc_forming') : t('sc_not_detected'),
    cup.detected
      ? t('sc_i_cup_found', { depth: cup.depth, handle: cup.handlePct, msg: cup.confidence === 'high' ? t('sc_i_cup_break') : t('sc_i_cup_forming') })
      : t('sc_i_cup_none'), 'sc_cup_handle');

  // Double Bottom
  const dbl = detectDoubleBottom(closes);
  rows += row(t('sc_double_bottom'),
    dbl.detected ? 'YES' : 'NEUTRAL',
    dbl.detected ? (dbl.confirmed ? t('sc_confirmed') : t('sc_forming')) : t('sc_not_detected'),
    dbl.detected
      ? t('sc_i_dbl_found', { v: dbl.variance, r: dbl.recovery, msg: dbl.confirmed ? t('sc_i_dbl_confirmed') : t('sc_i_dbl_forming') })
      : t('sc_i_dbl_none'), 'sc_double_bottom');

  // ── GROUP 3: Valuation vs. Sector ─────────────────────
  rows += groupHeader(t('sc_group_valuation'));

  const sectorKey     = getSectorKey(data.sector);
  const industryAvgPE = INDUSTRY_PE_AVG[sectorKey] || INDUSTRY_PE_AVG.default;
  const sectorLabel   = data.sector || t('sc_group_valuation').replace(/[^\w\s]/g, '').trim();

  if (data.pe != null && data.pe > 0) {
    const ratio = data.pe / industryAvgPE;
    let vType, vLabel, vInsight;
    if (ratio <= 0.8) {
      vType = 'YES'; vLabel = t('sc_cheap');
      vInsight = t('sc_i_pe_cheap', { pe: data.pe.toFixed(1), pct: ((1 - ratio) * 100).toFixed(0), sector: sectorLabel, avg: industryAvgPE });
    } else if (ratio <= 1.2) {
      vType = 'NEUTRAL'; vLabel = t('sc_fair');
      vInsight = t('sc_i_pe_fair', { pe: data.pe.toFixed(1), sector: sectorLabel, avg: industryAvgPE });
    } else {
      vType = 'NO'; vLabel = t('sc_expensive');
      vInsight = t('sc_i_pe_expensive', { pe: data.pe.toFixed(1), pct: ((ratio - 1) * 100).toFixed(0), sector: sectorLabel, avg: industryAvgPE });
    }
    rows += row(t('sc_pe_vs_sector'), vType, vLabel, vInsight, 'sc_pe_sector');
  } else if (data.ps != null && data.ps > 0) {
    // PE is N/A (negative earnings) — use P/S vs sector average instead
    const industryAvgPS = INDUSTRY_PS_AVG[sectorKey] || INDUSTRY_PS_AVG.default;
    const ratio = data.ps / industryAvgPS;
    let vType, vLabel, vInsight;
    if (ratio <= 0.8) {
      vType = 'YES'; vLabel = t('sc_cheap');
      vInsight = t('sc_i_ps_cheap', { ps: data.ps.toFixed(1), pct: ((1 - ratio) * 100).toFixed(0), sector: sectorLabel, avg: industryAvgPS });
    } else if (ratio <= 1.2) {
      vType = 'NEUTRAL'; vLabel = t('sc_fair');
      vInsight = t('sc_i_ps_fair', { ps: data.ps.toFixed(1), sector: sectorLabel, avg: industryAvgPS });
    } else {
      vType = 'NO'; vLabel = t('sc_expensive');
      vInsight = t('sc_i_ps_expensive', { ps: data.ps.toFixed(1), pct: ((ratio - 1) * 100).toFixed(0), sector: sectorLabel, avg: industryAvgPS });
    }
    rows += row(t('sc_ps_vs_sector'), vType, vLabel, vInsight, 'sc_pe_sector');
  } else {
    rows += row(t('sc_pe_vs_sector'), 'NA', null, t('sc_i_pe_nodata'), 'sc_pe_sector');
  }

  // ── GROUP 4: Relative Strength vs. SPY ────────────────
  rows += groupHeader(t('sc_group_rs'));

  const spyId = `sc-spy-${Date.now()}`;
  rows += `
    <tr class="sc-row" id="${spyId}">
      <td class="sc-criteria">${t('sc_spy_drawdown')}<button class="info-icon-btn" data-info="sc_spy" onclick="event.stopPropagation()">i</button></td>
      <td class="sc-status-cell">${statusCell('NEUTRAL', t('sc_neutral'))}</td>
      <td class="sc-insight sc-insight-loading">${t('sc_loading_spy')}</td>
    </tr>`;

  // Render table immediately (SPY will fill in async)
  container.innerHTML = `
    <div class="sc-wrap">
      <table class="sc-table">
        <thead>
          <tr>
            <th>${t('sc_criteria')}</th>
            <th>${t('sc_status')}</th>
            <th>${t('sc_insight')}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  initInfoButtons(container);

  // ── Async: fetch SPY and update row ───────────────────
  try {
    const spyRaw    = await yahooChart('SPY', '1y', '1d');
    const spyCloses = (spyRaw?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(v => v != null && v > 0);

    if (spyCloses.length > 10 && closes.length > 10 && currentPrice != null) {
      const spyATH        = Math.max(...spyCloses);
      const spyCurrent    = spyCloses[spyCloses.length - 1];
      const spyDrawdown   = (spyATH - spyCurrent) / spyATH * 100;

      const stockATH      = Math.max(...closes);
      const stockDrawdown = (stockATH - currentPrice) / stockATH * 100;

      const diff = stockDrawdown - spyDrawdown;

      let spyType, spyLabel, spyInsight;
      if (diff < -3) {
        spyType    = 'YES';
        spyLabel   = t('sc_stronger');
        spyInsight = t('sc_i_spy_stronger', { stock: stockDrawdown.toFixed(1), spy: spyDrawdown.toFixed(1), diff: Math.abs(diff).toFixed(1) });
      } else if (diff > 3) {
        spyType    = 'NO';
        spyLabel   = t('sc_weaker');
        spyInsight = t('sc_i_spy_weaker', { stock: stockDrawdown.toFixed(1), spy: spyDrawdown.toFixed(1), diff: diff.toFixed(1) });
      } else {
        spyType    = 'NEUTRAL';
        spyLabel   = t('sc_in_line');
        spyInsight = t('sc_i_spy_inline', { stock: stockDrawdown.toFixed(1), spy: spyDrawdown.toFixed(1) });
      }

      const spyRow = document.getElementById(spyId);
      if (spyRow) {
        spyRow.querySelector('.sc-status-cell').innerHTML = statusCell(spyType, spyLabel);
        spyRow.querySelector('.sc-insight').textContent   = spyInsight;
        spyRow.querySelector('.sc-insight').classList.remove('sc-insight-loading');
      }
    } else {
      throw new Error('insufficient data');
    }
  } catch {
    const spyRow = document.getElementById(spyId);
    if (spyRow) {
      spyRow.querySelector('.sc-status-cell').innerHTML = statusCell('NA', 'N/A');
      spyRow.querySelector('.sc-insight').textContent   = t('sc_no_data');
      spyRow.querySelector('.sc-insight').classList.remove('sc-insight-loading');
    }
  }
}
